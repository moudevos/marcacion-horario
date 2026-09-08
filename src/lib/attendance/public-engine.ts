import "server-only";

import { createHash, randomBytes, randomInt } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  PresenceChallengeCode,
  PublicAttendanceEvent,
  PublicAttendanceSessionResponse,
} from "@/types/public-attendance";

const EVENT_LABELS: Record<PublicAttendanceEvent, string> = {
  check_in: "Ingreso",
  break_out: "Salida a almuerzo",
  break_in: "Retorno de almuerzo",
  check_out: "Salida final",
};

type RawAttendance = {
  check_in: string | null;
  break_out: string | null;
  break_in: string | null;
  check_out: string | null;
};

type ChallengeDefinition = {
  code: PresenceChallengeCode;
  label: string;
  value: string;
  publicValue?: string;
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

export function hashPublicValue(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function getPublicAttendanceEventLabel(event: PublicAttendanceEvent) {
  return EVENT_LABELS[event];
}

function resolveNextEvent(attendance: RawAttendance | null, breakMinutes: number): PublicAttendanceEvent | null {
  if (!attendance?.check_in) return "check_in";
  if (breakMinutes > 0 && !attendance.break_out) return "break_out";
  if (breakMinutes > 0 && !attendance.break_in) return "break_in";
  if (!attendance.check_out) return "check_out";
  return null;
}

function chooseChallenge(previousCode?: string | null): ChallengeDefinition {
  const definitions: ChallengeDefinition[] = [
    {
      code: "hold_2s",
      label: "Mantén presionado el botón de firma de vida durante 2 segundos.",
      value: "held_2s",
    },
    {
      code: "tap_3",
      label: "Pulsa tres veces el botón de firma de vida.",
      value: "tap_3",
    },
    (() => {
      const code = String(randomInt(100, 1000));
      return {
        code: "type_code" as const,
        label: `Escribe el código ${code} para completar la firma de vida.`,
        value: code,
        publicValue: code,
      };
    })(),
  ];

  const options = definitions.filter((challenge) => challenge.code !== previousCode);
  const source = options.length > 0 ? options : definitions;
  return source[randomInt(source.length)]!;
}

export async function consumePublicAttendanceRateLimit(input: {
  fingerprint: string;
  dni: string;
}) {
  const pepper = process.env.SUPABASE_SECRET_KEY ?? "attendance-rate-limit";
  const rateKey = hashPublicValue(`${pepper}|${input.fingerprint}|${input.dni}`);
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("consume_attendance_rate_limit", {
    p_rate_key: rateKey,
    p_limit: 8,
    p_window_seconds: 600,
  });

  if (error) throw new Error(error.message);
  return data === true;
}

export async function createPublicAttendanceSession(input: {
  dni: string;
  requestFingerprintHash?: string | null;
}): Promise<PublicAttendanceSessionResponse> {
  const admin = createAdminClient();
  const workDate = limaWorkDate();

  const { data: identifier, error: identifierError } = await admin
    .from("employee_identifiers")
    .select("profile_id")
    .eq("dni", input.dni)
    .maybeSingle();

  if (identifierError) throw new Error(identifierError.message);
  if (!identifier?.profile_id) throw new Error("No hay una marcación disponible para los datos ingresados");

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id, full_name, position, active")
    .eq("id", identifier.profile_id)
    .maybeSingle();

  if (profileError) throw new Error(profileError.message);
  if (!profile?.active) throw new Error("No hay una marcación disponible para los datos ingresados");

  const { data: schedule, error: scheduleError } = await admin
    .from("schedules")
    .select("id, store_id, start_time, end_time, break_minutes, tolerance_minutes")
    .eq("employee_id", profile.id)
    .eq("work_date", workDate)
    .eq("active", true)
    .maybeSingle();

  if (scheduleError) throw new Error(scheduleError.message);
  if (!schedule) throw new Error("No hay una marcación disponible para los datos ingresados");

  const { data: store, error: storeError } = await admin
    .from("stores")
    .select("id, code, name, address, latitude, longitude, attendance_radius_meters, active")
    .eq("id", schedule.store_id)
    .maybeSingle();

  if (storeError) throw new Error(storeError.message);
  if (!store?.active) throw new Error("No hay una marcación disponible para los datos ingresados");
  if (store.latitude === null || store.longitude === null) {
    throw new Error("La tienda aún no tiene una ubicación configurada para marcación");
  }

  const { data: attendance, error: attendanceError } = await admin
    .from("attendance_records")
    .select("check_in, break_out, break_in, check_out")
    .eq("employee_id", profile.id)
    .eq("work_date", workDate)
    .maybeSingle();

  if (attendanceError) throw new Error(attendanceError.message);

  const nextEvent = resolveNextEvent((attendance as RawAttendance | null) ?? null, schedule.break_minutes ?? 0);
  if (!nextEvent) throw new Error("La jornada de hoy ya está completa");

  const [{ data: previousEvents, error: previousEventError }, { count: passkeyCount, error: passkeyError }] = await Promise.all([
    admin
      .from("attendance_events")
      .select("metadata")
      .eq("employee_id", profile.id)
      .eq("store_id", store.id)
      .eq("source", "public_dni")
      .order("occurred_at", { ascending: false })
      .limit(1),
    admin
      .from("employee_passkeys")
      .select("id", { count: "exact", head: true })
      .eq("employee_id", profile.id)
      .is("revoked_at", null),
  ]);

  if (previousEventError) throw new Error(previousEventError.message);
  if (passkeyError) throw new Error(passkeyError.message);

  const previousMetadata = previousEvents?.[0]?.metadata as Record<string, unknown> | undefined;
  const previousChallenge = typeof previousMetadata?.challenge_code === "string" ? previousMetadata.challenge_code : null;
  const challenge = chooseChallenge(previousChallenge);

  const token = randomBytes(32).toString("hex");
  const tokenHash = hashPublicValue(token);
  const expiresAt = new Date(Date.now() + 3 * 60 * 1000).toISOString();

  const { error: sessionError } = await admin.from("attendance_marking_sessions").insert({
    token_hash: tokenHash,
    employee_id: profile.id,
    store_id: store.id,
    schedule_id: schedule.id,
    work_date: workDate,
    expected_event: nextEvent,
    challenge_code: challenge.code,
    liveness_value: challenge.value,
    request_fingerprint_hash: input.requestFingerprintHash ?? null,
    expires_at: expiresAt,
  });

  if (sessionError) throw new Error(sessionError.message);

  return {
    token,
    expiresAt,
    employee: {
      fullName: profile.full_name,
      position: profile.position,
    },
    store: {
      code: store.code,
      name: store.name,
      address: store.address,
      latitude: Number(store.latitude),
      longitude: Number(store.longitude),
      attendanceRadiusMeters: store.attendance_radius_meters ?? 100,
    },
    schedule: {
      startTime: schedule.start_time.slice(0, 5),
      endTime: schedule.end_time.slice(0, 5),
      breakMinutes: schedule.break_minutes ?? 0,
    },
    passkeyConfigured: (passkeyCount ?? 0) > 0,
    nextEvent,
    nextEventLabel: EVENT_LABELS[nextEvent],
    challenge: {
      code: challenge.code,
      label: challenge.label,
      publicValue: challenge.publicValue,
    },
  };
}
