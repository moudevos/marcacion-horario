"use server";

import { revalidatePath } from "next/cache";
import { assertPermission, AuthorizationError, getActorContext } from "@/lib/auth/require-permission";
import { saveWeeklyScheduleSchema } from "@/lib/schedules/schemas";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ScheduleActionResult } from "@/types/schedules";

function failure(message: string): ScheduleActionResult {
  return { ok: false, message };
}

function formatError(error: unknown) {
  if (error instanceof AuthorizationError) return error.message;
  if (error instanceof Error) return error.message;
  return "No se pudo guardar la semana";
}

export async function saveWeeklyScheduleAction(input: unknown): Promise<ScheduleActionResult> {
  const parsed = saveWeeklyScheduleSchema.safeParse(input);
  if (!parsed.success) {
    return failure(parsed.error.issues[0]?.message ?? "El horario contiene datos inválidos");
  }

  try {
    const actor = await getActorContext();
    assertPermission(actor, "schedules", "update", parsed.data.storeId);

    const admin = createAdminClient();
    const { data: assignments, error: assignmentsError } = await admin
      .from("user_store_assignments")
      .select("user_id")
      .eq("store_id", parsed.data.storeId);

    if (assignmentsError) throw new Error(assignmentsError.message);

    const allowedEmployees = new Set((assignments ?? []).map((row) => row.user_id));
    for (const entry of parsed.data.entries) {
      if (!allowedEmployees.has(entry.employeeId)) {
        throw new AuthorizationError("El cuadro contiene un trabajador fuera de la tienda seleccionada");
      }
    }

    const payload = parsed.data.entries.map((entry) => ({
      employee_id: entry.employeeId,
      work_date: entry.workDate,
      shift_code: entry.mode === "OFF" ? null : entry.mode,
      start_time: entry.mode === "OFF" ? null : entry.startTime,
      end_time: entry.mode === "OFF" ? null : entry.endTime,
      break_minutes: entry.mode === "OFF" ? 0 : entry.breakMinutes,
      tolerance_minutes: entry.toleranceMinutes,
      is_off: entry.mode === "OFF",
    }));

    const { error } = await admin.rpc("save_weekly_schedule", {
      p_store_id: parsed.data.storeId,
      p_week_start: parsed.data.weekStart,
      p_entries: payload,
      p_actor_id: actor.id,
    });

    if (error) throw new Error(error.message);

    revalidatePath("/horarios");
    revalidatePath("/marcaciones");
    return { ok: true, message: "Horario semanal guardado correctamente" };
  } catch (error) {
    return failure(formatError(error));
  }
}
