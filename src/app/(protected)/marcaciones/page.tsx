import { AttendanceAdminClient } from "./marcaciones-client";
import { getAttendanceAdminModuleData } from "@/lib/attendance/admin-service";

export const dynamic = "force-dynamic";

async function loadPageData() {
  try {
    return { ok: true as const, data: await getAttendanceAdminModuleData() };
  } catch (error) {
    return {
      ok: false as const,
      message: error instanceof Error ? error.message : "Error inesperado",
    };
  }
}

export default async function AttendanceAdminPage() {
  const result = await loadPageData();

  if (!result.ok) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6">
        <h1 className="text-xl font-bold text-rose-900">No se pudo cargar Marcaciones</h1>
        <p className="mt-2 text-sm text-rose-700">{result.message}</p>
        <p className="mt-3 text-xs text-rose-600">Verifica que hayas ejecutado los scripts 07 y 08 en Supabase.</p>
      </div>
    );
  }

  return <AttendanceAdminClient data={result.data} />;
}
