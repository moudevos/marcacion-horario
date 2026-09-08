import "server-only";

import { addDays, format, parseISO } from "date-fns";
import { canAccessStore } from "@/lib/auth/permissions";
import { AuthorizationError, assertPermission, getActorContext } from "@/lib/auth/require-permission";
import { normalizeWeekStart } from "@/lib/schedules/service";
import { createAdminClient } from "@/lib/supabase/admin";
import type { EmployeePosition, WorkerType } from "@/types/domain";
import type {
  AnalysisDayStatus,
  ScheduleAnalysisDay,
  ScheduleAnalysisModuleData,
  ScheduleAnalysisRow,
  ScheduleAnalysisStore,
  ScheduleAnalysisTotals,
} from "@/types/schedule-analysis";

type RawStore = { id: string; code: string; name: string; active: boolean };
type RawProfile = {
  id: string;
  full_name: string;
  position: EmployeePosition | null;
  worker_type: WorkerType | null;
};
type RawIdentifier = { profile_id: string; dni: string };
type RawSchedule = {
  employee_id: string;
  work_date: string;
  shift_code: string | null;
  start_time: string;
  end_time: string;
  break_minutes: number;
};
type RawAttendance = {
  employee_id: string;
  work_date: string;
  check_in: string | null;
  check_out: string | null;
  status: string;
};

const EMPTY_TOTALS: ScheduleAnalysisTotals = {
  plannedHours: 0,
  presenceHours: 0,
  effectiveHours: 0,
  varianceHours: 0,
  compliancePercent: null,
  incompleteDays: 0,
  missingDays: 0,
};

function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function minutesFromTime(value: string) {
  const [hours = "0", minutes = "0"] = value.split(":");
  return Number(hours) * 60 + Number(minutes);
}

function plannedHours(schedule?: RawSchedule) {
  if (!schedule) return 0;
  const grossMinutes = minutesFromTime(schedule.end_time) - minutesFromTime(schedule.start_time);
  return round2(Math.max(0, grossMinutes - schedule.break_minutes) / 60);
}

function presenceHours(attendance?: RawAttendance) {
  if (!attendance?.check_in || !attendance.check_out) return null;
  const milliseconds = new Date(attendance.check_out).getTime() - new Date(attendance.check_in).getTime();
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return null;
  return round2(milliseconds / 3_600_000);
}

function resolveDayStatus(input: {
  hasSchedule: boolean;
  attendance?: RawAttendance;
  varianceHours: number | null;
}): AnalysisDayStatus {
  const { hasSchedule, attendance, varianceHours } = input;
  const hasAnyMark = Boolean(attendance?.check_in || attendance?.check_out);
  const hasCompleteMark = Boolean(attendance?.check_in && attendance?.check_out);

  if (!hasSchedule && !hasAnyMark) return "off";
  if (!hasSchedule && hasCompleteMark) return "unscheduled";
  if (!hasSchedule && hasAnyMark) return "incomplete";
  if (!hasAnyMark) return "missing";
  if (!hasCompleteMark || varianceHours === null) return "incomplete";
  if (varianceHours < -0.25) return "deficit";
  if (varianceHours > 0.25) return "excess";
  return "ok";
}

function buildDay(date: string, schedule?: RawSchedule, attendance?: RawAttendance): ScheduleAnalysisDay {
  const planned = plannedHours(schedule);
  const presence = presenceHours(attendance);
  const effective = presence === null
    ? null
    : round2(Math.max(0, presence - (schedule?.break_minutes ?? 0) / 60));
  const variance = effective === null ? null : round2(effective - planned);
  const status = resolveDayStatus({
    hasSchedule: Boolean(schedule),
    attendance,
    varianceHours: variance,
  });

  return {
    date,
    shiftCode: schedule?.shift_code ?? null,
    plannedStart: schedule?.start_time.slice(0, 5) ?? null,
    plannedEnd: schedule?.end_time.slice(0, 5) ?? null,
    breakMinutes: schedule?.break_minutes ?? 0,
    plannedHours: planned,
    checkIn: attendance?.check_in ?? null,
    checkOut: attendance?.check_out ?? null,
    attendanceStatus: attendance?.status ?? null,
    presenceHours: presence,
    effectiveHours: effective,
    varianceHours: variance,
    status,
  };
}

function sumRows(rows: ScheduleAnalysisRow[]): ScheduleAnalysisTotals {
  const planned = round2(rows.reduce((sum, row) => sum + row.plannedHours, 0));
  const presence = round2(rows.reduce((sum, row) => sum + row.presenceHours, 0));
  const effective = round2(rows.reduce((sum, row) => sum + row.effectiveHours, 0));
  return {
    plannedHours: planned,
    presenceHours: presence,
    effectiveHours: effective,
    varianceHours: round2(effective - planned),
    compliancePercent: planned > 0 ? round2((effective / planned) * 100) : null,
    incompleteDays: rows.reduce((sum, row) => sum + row.incompleteDays, 0),
    missingDays: rows.reduce((sum, row) => sum + row.missingDays, 0),
  };
}

export async function getScheduleAnalysisModuleData(input?: {
  storeId?: string;
  weekStart?: string;
}): Promise<ScheduleAnalysisModuleData> {
  const actor = await getActorContext();
  assertPermission(actor, "schedules", "read");
  assertPermission(actor, "attendance", "read");

  if (
    actor.role !== "superuser" &&
    actor.position !== "rh" &&
    actor.position !== "zonal" &&
    actor.position !== "supervisor" &&
    actor.position !== "visualizador"
  ) {
    throw new AuthorizationError("El análisis de horarios está reservado para perfiles de gestión y visualización");
  }

  const admin = createAdminClient();
  const weekStart = normalizeWeekStart(input?.weekStart);
  const dates = Array.from({ length: 7 }, (_, index) => format(addDays(parseISO(weekStart), index), "yyyy-MM-dd"));
  const weekEnd = dates[6];

  const { data: rawStores, error: storesError } = await admin
    .from("stores")
    .select("id, code, name, active")
    .order("name");
  if (storesError) throw new Error(storesError.message);

  const globalScope = actor.role === "superuser" || actor.position === "rh";
  const stores: ScheduleAnalysisStore[] = ((rawStores ?? []) as RawStore[])
    .filter((store) => globalScope || canAccessStore(actor, store.id))
    .map((store) => ({ id: store.id, code: store.code, name: store.name }));

  const selectedStoreId = stores.some((store) => store.id === input?.storeId)
    ? input?.storeId ?? null
    : stores[0]?.id ?? null;

  if (!selectedStoreId) {
    return { stores, selectedStoreId: null, weekStart, rows: [], totals: EMPTY_TOTALS };
  }

  const [assignmentsResponse, schedulesResponse, attendanceResponse] = await Promise.all([
    admin.from("user_store_assignments").select("user_id").eq("store_id", selectedStoreId),
    admin
      .from("schedules")
      .select("employee_id, work_date, shift_code, start_time, end_time, break_minutes")
      .eq("store_id", selectedStoreId)
      .eq("active", true)
      .gte("work_date", weekStart)
      .lte("work_date", weekEnd),
    admin
      .from("attendance_records")
      .select("employee_id, work_date, check_in, check_out, status")
      .eq("store_id", selectedStoreId)
      .gte("work_date", weekStart)
      .lte("work_date", weekEnd),
  ]);

  if (assignmentsResponse.error) throw new Error(assignmentsResponse.error.message);
  if (schedulesResponse.error) throw new Error(schedulesResponse.error.message);
  if (attendanceResponse.error) throw new Error(attendanceResponse.error.message);

  const schedules = (schedulesResponse.data ?? []) as RawSchedule[];
  const attendances = (attendanceResponse.data ?? []) as RawAttendance[];
  const employeeIds = [...new Set([
    ...(assignmentsResponse.data ?? []).map((row) => row.user_id),
    ...schedules.map((row) => row.employee_id),
    ...attendances.map((row) => row.employee_id),
  ])];

  if (employeeIds.length === 0) {
    return { stores, selectedStoreId, weekStart, rows: [], totals: EMPTY_TOTALS };
  }

  const [profilesResponse, identifiersResponse] = await Promise.all([
    admin
      .from("profiles")
      .select("id, full_name, position, worker_type")
      .in("id", employeeIds)
      .order("full_name"),
    admin.from("employee_identifiers").select("profile_id, dni").in("profile_id", employeeIds),
  ]);

  if (profilesResponse.error) throw new Error(profilesResponse.error.message);
  if (identifiersResponse.error) throw new Error(identifiersResponse.error.message);

  const identifiers = new Map(
    ((identifiersResponse.data ?? []) as RawIdentifier[]).map((row) => [row.profile_id, row.dni]),
  );
  const scheduleMap = new Map(schedules.map((row) => [`${row.employee_id}_${row.work_date}`, row]));
  const attendanceMap = new Map(attendances.map((row) => [`${row.employee_id}_${row.work_date}`, row]));

  const rows: ScheduleAnalysisRow[] = ((profilesResponse.data ?? []) as RawProfile[]).map((profile) => {
    const days = dates.map((date) =>
      buildDay(
        date,
        scheduleMap.get(`${profile.id}_${date}`),
        attendanceMap.get(`${profile.id}_${date}`),
      ),
    );
    const planned = round2(days.reduce((sum, day) => sum + day.plannedHours, 0));
    const presence = round2(days.reduce((sum, day) => sum + (day.presenceHours ?? 0), 0));
    const effective = round2(days.reduce((sum, day) => sum + (day.effectiveHours ?? 0), 0));

    return {
      employeeId: profile.id,
      fullName: profile.full_name,
      dni: identifiers.get(profile.id) ?? null,
      position: profile.position,
      workerType: profile.worker_type,
      days,
      plannedHours: planned,
      presenceHours: presence,
      effectiveHours: effective,
      varianceHours: round2(effective - planned),
      compliancePercent: planned > 0 ? round2((effective / planned) * 100) : null,
      incompleteDays: days.filter((day) => day.status === "incomplete").length,
      missingDays: days.filter((day) => day.status === "missing").length,
    };
  });

  return {
    stores,
    selectedStoreId,
    weekStart,
    rows,
    totals: sumRows(rows),
  };
}
