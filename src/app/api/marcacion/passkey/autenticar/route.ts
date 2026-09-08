import { NextResponse } from "next/server";
import { z } from "zod";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { verifyPasskeyAuthentication } from "@/lib/attendance/webauthn";

export const runtime = "nodejs";

const schema = z.object({
  token: z.string().min(32),
  response: z.record(z.string(), z.unknown()),
});

export async function POST(request: Request) {
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ ok: false, message: "Respuesta de autenticación inválida" }, { status: 400 });
    }

    await verifyPasskeyAuthentication({
      request,
      token: parsed.data.token,
      response: parsed.data.response as unknown as AuthenticationResponseJSON,
    });

    return NextResponse.json(
      { ok: true, message: "Passkey validada" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "No se pudo validar la Passkey" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}
