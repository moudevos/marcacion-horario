import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import {
  getPublicAttendanceEventLabel,
  hashPublicValue,
} from "@/lib/attendance/public-engine";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PublicAttendanceEvent } from "@/types/public-attendance";

export const runtime = "nodejs";

const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

function requestFingerprint(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || request.headers.get("x-real-ip") || "unknown";
  const userAgent = request.headers.get("user-agent") || "unknown";
  return `${ip}|${userAgent.slice(0, 180)}`;
}

function optionalCoordinate(value: FormDataEntryValue | null, min: number, max: number) {
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new Error("Ubicación inválida");
  }
  return parsed;
}

export async function POST(request: Request) {
  const admin = createAdminClient();
  let uploadedPath: string | null = null;

  try {
    const formData = await request.formData();
    const tokenEntry = formData.get("token");
    const photoEntry = formData.get("photo");

    if (typeof tokenEntry !== "string" || tokenEntry.length < 32) {
      return NextResponse.json({ ok: false, message: "Sesión de marcación inválida" }, { status: 400 });
    }

    if (!(photoEntry instanceof File) || photoEntry.type !== "image/jpeg" || photoEntry.size <= 0) {
      return NextResponse.json({ ok: false, message: "Debes capturar una fotografía válida" }, { status: 400 });
    }

    if (photoEntry.size > MAX_PHOTO_BYTES) {
      return NextResponse.json({ ok: false, message: "La fotografía supera el tamaño permitido" }, { status: 413 });
    }

    const latitude = optionalCoordinate(formData.get("latitude"), -90, 90);
    const longitude = optionalCoordinate(formData.get("longitude"), -180, 180);
    if ((latitude === null) !== (longitude === null)) {
      return NextResponse.json({ ok: false, message: "La ubicación está incompleta" }, { status: 400 });
    }

    const tokenHash = hashPublicValue(tokenEntry);
    const { data: session, error: sessionError } = await admin
      .from("attendance_marking_sessions")
      .select("id, employee_id, work_date, expected_event, expires_at, used_at, request_fingerprint_hash")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (sessionError) throw new Error(sessionError.message);
    if (!session || session.used_at || new Date(session.expires_at).getTime() <= Date.now()) {
      return NextResponse.json({ ok: false, message: "La sesión expiró. Inicia nuevamente." }, { status: 400 });
    }

    const fingerprintHash = hashPublicValue(requestFingerprint(request));
    if (session.request_fingerprint_hash && session.request_fingerprint_hash !== fingerprintHash) {
      return NextResponse.json({ ok: false, message: "La sesión debe completarse en el mismo dispositivo." }, { status: 400 });
    }

    const expectedEvent = session.expected_event as PublicAttendanceEvent;
    uploadedPath = `${session.work_date}/${session.employee_id}/${expectedEvent}-${randomUUID()}.jpg`;
    const photoBuffer = Buffer.from(await photoEntry.arrayBuffer());

    const { error: uploadError } = await admin.storage
      .from("attendance-evidence")
      .upload(uploadedPath, photoBuffer, {
        contentType: "image/jpeg",
        cacheControl: "0",
        upsert: false,
      });

    if (uploadError) throw new Error(uploadError.message);

    const userAgent = request.headers.get("user-agent") || "unknown";
    const { data, error: registerError } = await admin.rpc("register_public_attendance_mark", {
      p_session_id: session.id,
      p_token_hash: tokenHash,
      p_evidence_path: uploadedPath,
      p_latitude: latitude,
      p_longitude: longitude,
      p_metadata: {
        user_agent_hash: hashPublicValue(userAgent),
        capture_method: "browser_camera",
        biometric_matching: false,
      },
    });

    if (registerError) throw new Error(registerError.message);

    const result = data as {
      event?: PublicAttendanceEvent;
      occurred_at?: string;
      attendance_status?: string | null;
    } | null;
    const event = result?.event ?? expectedEvent;

    return NextResponse.json({
      ok: true,
      message: `${getPublicAttendanceEventLabel(event)} registrado correctamente`,
      event,
      eventLabel: getPublicAttendanceEventLabel(event),
      occurredAt: result?.occurred_at ?? new Date().toISOString(),
      attendanceStatus: result?.attendance_status ?? null,
    });
  } catch (error) {
    if (uploadedPath) {
      await admin.storage.from("attendance-evidence").remove([uploadedPath]);
    }

    const message = error instanceof Error ? error.message : "No se pudo registrar la marcación";
    return NextResponse.json({ ok: false, message }, { status: 400 });
  }
}
