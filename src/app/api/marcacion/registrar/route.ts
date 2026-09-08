import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getPublicAttendanceEventLabel,
  hashPublicValue,
} from "@/lib/attendance/public-engine";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PublicAttendanceEvent } from "@/types/public-attendance";

export const runtime = "nodejs";

const schema = z.object({
  token: z.string().min(32),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  livenessResponse: z.string().min(1).max(32),
});

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

function requestFingerprint(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || request.headers.get("x-real-ip") || "unknown";
  const userAgent = request.headers.get("user-agent") || "unknown";
  return `${ip}|${userAgent.slice(0, 180)}`;
}

export async function POST(request: Request) {
  const admin = createAdminClient();

  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      return json({ ok: false, message: "Faltan validaciones obligatorias para registrar la asistencia" }, 400);
    }

    const tokenHash = hashPublicValue(parsed.data.token);
    const { data: session, error: sessionError } = await admin
      .from("attendance_marking_sessions")
      .select("id, expected_event, expires_at, used_at, request_fingerprint_hash, passkey_verified_at, challenge_code, liveness_value")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (sessionError) throw new Error(sessionError.message);
    if (!session || session.used_at || new Date(session.expires_at).getTime() <= Date.now()) {
      return json({ ok: false, message: "La sesión expiró. Inicia nuevamente." }, 400);
    }

    const fingerprintHash = hashPublicValue(requestFingerprint(request));
    if (session.request_fingerprint_hash && session.request_fingerprint_hash !== fingerprintHash) {
      return json({ ok: false, message: "La sesión debe completarse en el mismo dispositivo." }, 400);
    }

    if (!session.passkey_verified_at) {
      return json({ ok: false, message: "Primero debes validar la Passkey del trabajador." }, 400);
    }

    if (!session.liveness_value || parsed.data.livenessResponse !== session.liveness_value) {
      return json({ ok: false, message: "La firma de vida no coincide con el reto solicitado." }, 400);
    }

    const now = new Date().toISOString();
    const { error: livenessError } = await admin
      .from("attendance_marking_sessions")
      .update({ liveness_verified_at: now })
      .eq("id", session.id);

    if (livenessError) throw new Error(livenessError.message);

    const userAgent = request.headers.get("user-agent") || "unknown";
    const { data, error: registerError } = await admin.rpc("register_public_attendance_mark_v2", {
      p_session_id: session.id,
      p_token_hash: tokenHash,
      p_latitude: parsed.data.latitude,
      p_longitude: parsed.data.longitude,
      p_metadata: {
        user_agent_hash: hashPublicValue(userAgent),
        validation_model: "dni+schedule+passkey+interactive_liveness+geofence",
        webauthn_user_verification_required: true,
        face_image_stored: false,
        server_biometric_template_stored: false,
      },
    });

    if (registerError) throw new Error(registerError.message);

    const result = data as {
      event?: PublicAttendanceEvent;
      occurred_at?: string;
      attendance_status?: string | null;
      distance_meters?: number | null;
    } | null;
    const event = result?.event ?? (session.expected_event as PublicAttendanceEvent);

    return json({
      ok: true,
      message: `${getPublicAttendanceEventLabel(event)} registrado correctamente`,
      event,
      eventLabel: getPublicAttendanceEventLabel(event),
      occurredAt: result?.occurred_at ?? now,
      attendanceStatus: result?.attendance_status ?? null,
      distanceMeters: result?.distance_meters ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo registrar la marcación";
    return json({ ok: false, message }, 400);
  }
}
