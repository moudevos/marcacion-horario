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
  try {
    const body = await request.json();
    const parsed = requestSchema.safeParse(body);

    if (!parsed.success) {
      return json({ ok: false, message: "Ingresa un DNI válido de 8 dígitos" }, 400);
    }

    const fingerprint = requestFingerprint(request);
    const allowed = await consumePublicAttendanceRateLimit({
      fingerprint,
      dni: parsed.data.dni,
    });

    if (!allowed) {
      return json(
        { ok: false, message: "Demasiados intentos. Espera unos minutos antes de volver a intentar." },
        429,
      );
    }

    const session = await createPublicAttendanceSession({
      dni: parsed.data.dni,
      requestFingerprintHash: hashPublicValue(fingerprint),
    });

    return json({ ok: true, session });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo iniciar la marcación";
    const safeMessage = message.includes("jornada de hoy ya está completa")
      ? message
      : message.includes("No hay una marcación disponible")
        ? message
        : "No se pudo iniciar la marcación. Verifica tus datos e intenta nuevamente.";

    return json({ ok: false, message: safeMessage }, 400);
  }
}
