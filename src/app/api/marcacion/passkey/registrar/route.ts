import { NextResponse } from "next/server";
import { z } from "zod";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { verifyPasskeyRegistration } from "@/lib/attendance/webauthn";

export const runtime = "nodejs";

const schema = z.object({
  dni: z.string().regex(/^\d{8}$/),
  enrollmentCode: z.string().regex(/^\d{8}$/),
  response: z.record(z.string(), z.unknown()),
});

export async function POST(request: Request) {
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ ok: false, message: "Respuesta de enrolamiento inválida" }, { status: 400 });
    }

    await verifyPasskeyRegistration({
      request,
      dni: parsed.data.dni,
      enrollmentCode: parsed.data.enrollmentCode,
      response: parsed.data.response as unknown as RegistrationResponseJSON,
    });

    return NextResponse.json(
      { ok: true, message: "Passkey enrolada correctamente" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "No se pudo completar el enrolamiento" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}
