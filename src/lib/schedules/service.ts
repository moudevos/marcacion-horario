import "server-only";

import { addDays, format, parseISO, startOfWeek } from "date-fns";
import { can, canAccessStore } from "@/lib/auth/permissions";
import { assertPermission, getActorContext } from "@/lib/auth/require-permission";
import { createAdminClient } from "@/lib/supabase/admin";
import type { EmployeePosition, WorkerType } from "@/types/domain";
import type {
  ScheduleEmployee,
  ScheduleStoreOption,
  ShiftCode,
  WeeklyScheduleRecord,
  WeeklySchedulesModuleData,
} from "@/types/schedules";

function limaToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function normalizeWeekStart(value?: string) {
  const source = value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : limaToday();
  return format(startOfWeek(parseISO(source), { weekStartsOn: 1 }), "yyyy-MM-dd");
}

type RawStore = { id: string; code: string; name: string; active: boolean };
type RawProfile = {
  id: string;
  full_name: string;
  position: EmployeePosition | null;
  worker_type: WorkerType | null;
  active: boolean;
};
type RawIdentifier = { profile_id: string; dni: string };
type RawSchedule = {
  id: string;
  employee_id: string;
  work_date: string;
  shift_code: ShiftCode | null;
  start_time: string;
  end_time: string;
  break_minutes: number;
  tolerance_minutes: number;
};

export async function getWeeklySchedulesModuleData(input?: {
  storeId?: string;
  weekStart?: string;
}): Promise<WeeklySchedulesModuleData> {
  const actor = await getActorContext();
  assertPermission(actor, "schedules", "read");

  const admin = createAdminClient();
  const weekStart = normalizeWeekStart(input?.weekStart);
  const weekEnd = format(addDays(parseISO(weekStart), 6), "yyyy-MM-dd");

  const { data: rawStores, error: storesError } = await admin
    .from("stores")
    .select("id, code, name, active")
    .eq("active", true)
    .order("name");

  if (storesError) throw new Error(storesError.message);

  const globalScope = actor.role === "superuser" || actor.position === "rh";
  const stores: ScheduleStoreOption[] = ((rawStores ?? []) as RawStore[])
    .filter((store) => globalScope || actor.storeIds.includes(store.id))
    .map((store) => ({ id: store.id, code: store.code, name: store.name }));

  const selectedStoreId = stores.some((store) => store.id === input?.storeId)
    ? input?.storeId ?? null
    : stores[0]?.id ?? null;

  if (!selectedStoreId) {
    return { stores, selectedStoreId: null, weekStart, employees: [], schedules: [], canEdit: false };
  }

  const { data: assignments, error: assignmentsError } = await admin
    .from("user_store_assignments")
    .select("user_id")
    .eq("store_id", selectedStoreId);
  if (assignmentsError) throw new Error(assignmentsError.message);

  const employeeIds = [...new Set((assignments ?? []).map((row) => row.user_id))];
  let employees: ScheduleEmployee[] = [];

  if (employeeIds.length > 0) {
    const [profilesResponse, identifiersResponse] = await Promise.all([
      admin
        .from("profiles")
        .select("id, full_name, position, worker_type, active")
        .in("id", employeeIds)
        .eq("active", true)
        .order("full_name"),
      admin
        .from("employee_identifiers")
        .select("profile_id, dni")
        .in("profile_id", employeeIds),
    ]);

    if (profilesResponse.error) throw new Error(profilesResponse.error.message);
    if (identifiersResponse.error) throw new Error(identifiersResponse.error.message);

    const dniByProfile = new Map(
      ((identifiersResponse.data ?? []) as RawIdentifier[]).map((identifier) => [
        identifier.profile_id,
        identifier.dni,
      ]),
    );

    employees = ((profilesResponse.data ?? []) as RawProfile[]).map((profile) => ({
      id: profile.id,
      fullName: profile.full_name,
      dni: dniByProfile.get(profile.id) ?? "",
      position: profile.position,
      workerType: profile.worker_type,
    }));
  }

  const { data: rawSchedules, error: schedulesError } = await admin
    .from("schedules")
    .select("id, employee_id, work_date, shift_code, start_time, end_time, break_minutes, tolerance_minutes")
    .eq("store_id", selectedStoreId)
    .eq("active", true)
    .gte("work_date", weekStart)
    .lte("work_date", weekEnd);
  if (schedulesError) throw new Error(schedulesError.message);

  const schedules: WeeklyScheduleRecord[] = ((rawSchedules ?? []) as RawSchedule[]).map((schedule) => ({
    id: schedule.id,
    employeeId: schedule.employee_id,
    workDate: schedule.work_date,
    shiftCode: schedule.shift_code,
    startTime: schedule.start_time.slice(0, 5),
    endTime: schedule.end_time.slice(0, 5),
    breakMinutes: schedule.break_minutes,
    toleranceMinutes: schedule.tolerance_minutes,
  }));

  return {
    stores,
    selectedStoreId,
    weekStart,
    employees,
    schedules,
    canEdit: can(actor.role, "schedules", "update") && canAccessStore(actor, selectedStoreId),
  };
}
