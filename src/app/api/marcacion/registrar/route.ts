import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getPublicAttendanceEventLabel,
  hashPublicValue,
} from "@/lib/attendance/public-engine";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PublicAttendanceEvent } from "@/types/public-attendance";

export const runtime = "nodejs";

const livenessSchema = z.object({
  engine: z.literal("mediapipe_face_landmarker"),
  engineVersion: z.literal("1.0.1"),
  challenge: z.enum(["blink_twice", "mouth_open", "brow_raise", "nose_sneer"]),
  durationMs: z.number().int().min(300).max(20_000),
  processedFrames: z.number().int().min(6).max(500),
  singleFaceFrames: z.number().int().min(6).max(500),
  validFrames: z.number().int().min(1).max(500),
  transitions: z.number().int().min(1).max(4),
  peakScore: z.number().min(0).max(1),
  completedAt: z.string().datetime(),
});

const schema = z.object({
  token: z.string().min(32),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  liveness: livenessSchema,
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

function validateLivenessEvidence(
  expectedChallenge: string,
  evidence: z.infer<typeof livenessSchema>,
) {
  if (evidence.challenge !== expectedChallenge) {
    throw new Error("La prueba de vida no corresponde al reto solicitado.");
  }

  if (evidence.singleFaceFrames !== evidence.processedFrames) {
    throw new Error("La prueba de vida requiere exactamente un rostro durante toda la secuencia válida.");
  }

  if (evidence.challenge === "blink_twice") {
    if (evidence.transitions < 2 || evidence.validFrames < 2 || evidence.peakScore < 0.5) {
      throw new Error("No se pudo validar correctamente el doble parpadeo.");
    }
    return;
  }

  if (evidence.transitions !== 1 || evidence.validFrames < 4) {
    throw new Error("La prueba de vida facial no tuvo suficiente continuidad.");
  }

  const minimumScore = evidence.challenge === "mouth_open" ? 0.5 : evidence.challenge === "brow_raise" ? 0.34 : 0.32;
  if (evidence.peakScore < minimumScore) {
    throw new Error("El gesto facial no alcanzó el nivel mínimo requerido.");
  }
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
      .select("id, expected_event, expires_at, used_at, request_fingerprint_hash, passkey_verified_at, challenge_code")
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
      return json({ ok: false, message: "Primero debes validar la identidad del trabajador." }, 400);
    }

    validateLivenessEvidence(session.challenge_code, parsed.data.liveness);

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
        validation_model: "dni+schedule+passkey+facial_liveness+geofence",
        webauthn_user_verification_required: true,
        liveness: parsed.data.liveness,
        face_image_stored: false,
        face_video_stored: false,
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
