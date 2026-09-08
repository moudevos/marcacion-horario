import { NextResponse } from "next/server";
import { z } from "zod";
import { generatePasskeyAuthenticationOptions } from "@/lib/attendance/webauthn";

export const runtime = "nodejs";

const schema = z.object({
  token: z.string().min(32),
});

export async function POST(request: Request) {
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ ok: false, message: "Sesión inválida" }, { status: 400 });
    }

    const options = await generatePasskeyAuthenticationOptions({
      request,
      token: parsed.data.token,
    });

    return NextResponse.json(
      { ok: true, options },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "No se pudo iniciar la validación del dispositivo" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}
