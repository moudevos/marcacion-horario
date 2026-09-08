import { NextResponse } from "next/server";
import { z } from "zod";
import { generatePasskeyRegistrationOptions } from "@/lib/attendance/webauthn";

export const runtime = "nodejs";

const schema = z.object({
  dni: z.string().regex(/^\d{8}$/),
  enrollmentCode: z.string().regex(/^\d{8}$/),
});

export async function POST(request: Request) {
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ ok: false, message: "Datos de enrolamiento inválidos" }, { status: 400 });
    }

    const options = await generatePasskeyRegistrationOptions({
      request,
      dni: parsed.data.dni,
      enrollmentCode: parsed.data.enrollmentCode,
    });

    return NextResponse.json(
      { ok: true, options },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "No se pudo iniciar el enrolamiento" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}
