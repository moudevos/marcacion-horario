import "server-only";

import { canAccessStore } from "@/lib/auth/permissions";
import { assertPermission, getActorContext } from "@/lib/auth/require-permission";
import { createAdminClient } from "@/lib/supabase/admin";
import type { EmployeePosition, WorkerType } from "@/types/domain";
import type { PublicAttendanceEvent } from "@/types/public-attendance";
import type {
  AttendanceAdminModuleData,
  AttendanceAdminRow,
  AttendanceAdminStore,
} from "@/types/attendance-admin";

const EVENT_LABELS: Record<PublicAttendanceEvent, string> = {
  check_in: "Ingreso",
  break_out: "Salida a almuerzo",
  break_in: "Retorno de almuerzo",
  check_out: "Salida final",
};

type RawStore = { id: string; code: string; name: string; active: boolean };
type RawSchedule = {
  employee_id: string;
  store_id: string;
  shift_code: string | null;
  start_time: string;
  end_time: string;
  break_minutes: number;
};
type RawProfile = {
  id: string;
  full_name: string;
  position: EmployeePosition | null;
  worker_type: WorkerType | null;
  active: boolean;
};
type RawAttendance = {
  employee_id: string;
  check_in: string | null;
  break_out: string | null;
  break_in: string | null;
  check_out: string | null;
  status: string | null;
};

function limaWorkDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function nextEvent(attendance: RawAttendance | undefined, breakMinutes: number): PublicAttendanceEvent | null {
  if (!attendance?.check_in) return "check_in";
  if (breakMinutes > 0 && !attendance.break_out) return "break_out";
  if (breakMinutes > 0 && !attendance.break_in) return "break_in";
  if (!attendance.check_out) return "check_out";
  return null;
}

function canManageAttendance(actor: Awaited<ReturnType<typeof getActorContext>>) {
  return actor.role === "superuser"
    || (actor.role === "admin" && (actor.position === "rh" || actor.position === "zonal"))
    || (actor.role === "store_manager" && actor.position === "supervisor");
}

export async function getAttendanceAdminModuleData(): Promise<AttendanceAdminModuleData> {
  const actor = await getActorContext();
  assertPermission(actor, "attendance", "read");

  const admin = createAdminClient();
  const workDate = limaWorkDate();
  const { data: rawStores, error: storesError } = await admin
    .from("stores")
    .select("id, code, name, active")
    .eq("active", true)
    .order("name");

  if (storesError) throw new Error(storesError.message);

  const globalScope = actor.role === "superuser" || actor.position === "rh";
  const stores: AttendanceAdminStore[] = ((rawStores ?? []) as RawStore[])
    .filter((store) => globalScope || canAccessStore(actor, store.id))
    .map((store) => ({ id: store.id, code: store.code, name: store.name }));

  const storeIds = stores.map((store) => store.id);
  if (storeIds.length === 0) {
    return { workDate, stores, rows: [], canManage: canManageAttendance(actor) };
  }

  const { data: rawSchedules, error: schedulesError } = await admin
    .from("schedules")
    .select("employee_id, store_id, shift_code, start_time, end_time, break_minutes")
    .eq("work_date", workDate)
    .eq("active", true)
    .in("store_id", storeIds);

  if (schedulesError) throw new Error(schedulesError.message);
  const schedules = (rawSchedules ?? []) as RawSchedule[];
  const employeeIds = [...new Set(schedules.map((schedule) => schedule.employee_id))];

  if (employeeIds.length === 0) {
    return { workDate, stores, rows: [], canManage: canManageAttendance(actor) };
  }

  const [profilesResponse, identifiersResponse, attendanceResponse, passkeysResponse] = await Promise.all([
    admin
      .from("profiles")
      .select("id, full_name, position, worker_type, active")
      .in("id", employeeIds),
    admin
      .from("employee_identifiers")
      .select("profile_id, dni")
      .in("profile_id", employeeIds),
    admin
      .from("attendance_records")
      .select("employee_id, check_in, break_out, break_in, check_out, status")
      .eq("work_date", workDate)
      .in("employee_id", employeeIds),
    admin
      .from("employee_passkeys")
      .select("employee_id")
      .in("employee_id", employeeIds)
      .is("revoked_at", null),
  ]);

  if (profilesResponse.error) throw new Error(profilesResponse.error.message);
  if (identifiersResponse.error) throw new Error(identifiersResponse.error.message);
  if (attendanceResponse.error) throw new Error(attendanceResponse.error.message);
  if (passkeysResponse.error) throw new Error(passkeysResponse.error.message);

  const profiles = new Map(((profilesResponse.data ?? []) as RawProfile[]).map((profile) => [profile.id, profile]));
  const identifiers = new Map((identifiersResponse.data ?? []).map((row) => [row.profile_id, row.dni]));
  const attendances = new Map(((attendanceResponse.data ?? []) as RawAttendance[]).map((row) => [row.employee_id, row]));
  const passkeyCounts = new Map<string, number>();
  for (const row of passkeysResponse.data ?? []) {
    passkeyCounts.set(row.employee_id, (passkeyCounts.get(row.employee_id) ?? 0) + 1);
  }
  const storeMap = new Map(stores.map((store) => [store.id, store]));
  const canManage = canManageAttendance(actor);

  const rows: AttendanceAdminRow[] = schedules.flatMap((schedule) => {
    const profile = profiles.get(schedule.employee_id);
    const store = storeMap.get(schedule.store_id);
    if (!profile?.active || !store) return [];

    const attendance = attendances.get(schedule.employee_id);
    const next = nextEvent(attendance, schedule.break_minutes ?? 0);
    return [{
      employeeId: profile.id,
      fullName: profile.full_name,
      dni: identifiers.get(profile.id) ?? null,
      position: profile.position,
      workerType: profile.worker_type,
      storeId: store.id,
      storeCode: store.code,
      storeName: store.name,
      shiftCode: schedule.shift_code,
      startTime: schedule.start_time.slice(0, 5),
      endTime: schedule.end_time.slice(0, 5),
      breakMinutes: schedule.break_minutes ?? 0,
      checkIn: attendance?.check_in ?? null,
      breakOut: attendance?.break_out ?? null,
      breakIn: attendance?.break_in ?? null,
      checkOut: attendance?.check_out ?? null,
      attendanceStatus: attendance?.status ?? null,
      nextEvent: next,
      nextEventLabel: next ? EVENT_LABELS[next] : "Jornada completa",
      passkeyCount: passkeyCounts.get(profile.id) ?? 0,
      canManage: canManage && (globalScope || canAccessStore(actor, store.id)),
    }];
  }).sort((a, b) => a.storeName.localeCompare(b.storeName) || a.fullName.localeCompare(b.fullName));

  return { workDate, stores, rows, canManage };
}
