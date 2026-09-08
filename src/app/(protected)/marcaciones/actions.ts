"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { canAccessStore } from "@/lib/auth/permissions";
import { assertPermission, AuthorizationError, getActorContext } from "@/lib/auth/require-permission";
import { createPasskeyEnrollment } from "@/lib/attendance/webauthn";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AttendanceAdminActionResult } from "@/types/attendance-admin";

const employeeIdSchema = z.string().uuid();
const markSchema = z.object({
  employeeId: z.string().uuid(),
  storeId: z.string().uuid(),
  reason: z.string().trim().min(5, "El motivo debe tener al menos 5 caracteres").max(300),
});

function result(ok: boolean, message: string, extra?: Partial<AttendanceAdminActionResult>): AttendanceAdminActionResult {
  return { ok, message, ...extra };
}

function isManager(actor: Awaited<ReturnType<typeof getActorContext>>) {
  return actor.role === "superuser"
    || (actor.role === "admin" && (actor.position === "rh" || actor.position === "zonal"))
    || (actor.role === "store_manager" && actor.position === "supervisor");
}

async function employeeStores(employeeId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("user_store_assignments")
    .select("store_id")
    .eq("user_id", employeeId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => row.store_id);
}

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

export async function createPasskeyEnrollmentAction(input: unknown): Promise<AttendanceAdminActionResult> {
  const parsed = employeeIdSchema.safeParse(input);
  if (!parsed.success) return result(false, "Trabajador inválido");

  try {
    const actor = await getActorContext();
    assertPermission(actor, "attendance", "update");
    if (!isManager(actor)) throw new AuthorizationError("Este perfil no puede enrolar dispositivos");

    const stores = await employeeStores(parsed.data);
    const globalScope = actor.role === "superuser" || actor.position === "rh";
    if (!globalScope && !stores.some((storeId) => canAccessStore(actor, storeId))) {
      throw new AuthorizationError("El trabajador está fuera de tu alcance");
    }

    const enrollment = await createPasskeyEnrollment({ employeeId: parsed.data, actorId: actor.id });
    return result(true, "Código de enrolamiento generado", {
      enrollmentCode: enrollment.code,
      expiresAt: enrollment.expiresAt,
    });
  } catch (error) {
    return result(false, error instanceof Error ? error.message : "No se pudo generar el enrolamiento");
  }
}

export async function registerAdminAttendanceAction(input: unknown): Promise<AttendanceAdminActionResult> {
  const parsed = markSchema.safeParse(input);
  if (!parsed.success) return result(false, parsed.error.issues[0]?.message ?? "Datos inválidos");

  try {
    const actor = await getActorContext();
    assertPermission(actor, "attendance", "update", parsed.data.storeId);
    if (!isManager(actor)) throw new AuthorizationError("Este perfil no puede registrar marcaciones administrativas");

    const admin = createAdminClient();
    const { data, error } = await admin.rpc("register_admin_attendance_mark", {
      p_employee_id: parsed.data.employeeId,
      p_store_id: parsed.data.storeId,
      p_work_date: limaWorkDate(),
      p_actor_id: actor.id,
      p_reason: parsed.data.reason,
    });

    if (error) throw new Error(error.message);
    const mark = data as { event?: string } | null;

    revalidatePath("/marcaciones");
    revalidatePath("/analisis-horario");
    return result(true, mark?.event ? `Marcación ${mark.event} registrada` : "Marcación registrada correctamente");
  } catch (error) {
    return result(false, error instanceof Error ? error.message : "No se pudo registrar la marcación");
  }
}
