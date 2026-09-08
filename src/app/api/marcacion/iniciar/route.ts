import { NextResponse } from "next/server";
import { z } from "zod";
import {
  consumePublicAttendanceRateLimit,
  createPublicAttendanceSession,
  hashPublicValue,
} from "@/lib/attendance/public-engine";

export const runtime = "nodejs";

const requestSchema = z.object({
  dni: z.string().regex(/^\d{8}$/),
});

function requestFingerprint(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || request.headers.get("x-real-ip") || "unknown";
  const userAgent = request.headers.get("user-agent") || "unknown";
  return `${ip}|${userAgent.slice(0, 180)}`;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = requestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, message: "Ingresa un DNI válido de 8 dígitos" },
        { status: 400 },
      );
    }

    const fingerprint = requestFingerprint(request);
    const allowed = await consumePublicAttendanceRateLimit({
      fingerprint,
      dni: parsed.data.dni,
    });

    if (!allowed) {
      return NextResponse.json(
        { ok: false, message: "Demasiados intentos. Espera unos minutos antes de volver a intentar." },
        { status: 429 },
      );
    }

    const session = await createPublicAttendanceSession({
      dni: parsed.data.dni,
      requestFingerprintHash: hashPublicValue(fingerprint),
    });

    return NextResponse.json({ ok: true, session });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo iniciar la marcación";
    const safeMessage = message.includes("jornada de hoy ya está completa")
      ? message
      : message.includes("No hay una marcación disponible")
        ? message
        : "No se pudo iniciar la marcación. Verifica tus datos e intenta nuevamente.";

    return NextResponse.json({ ok: false, message: safeMessage }, { status: 400 });
  }
}
