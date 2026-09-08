import { AttendanceAdminClient } from "./marcaciones-client";
import { getAttendanceAdminModuleData } from "@/lib/attendance/admin-service";

export const dynamic = "force-dynamic";

export default async function AttendanceAdminPage() {
  try {
    const data = await getAttendanceAdminModuleData();
    return <AttendanceAdminClient data={data} />;
  } catch (error) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6">
        <h1 className="text-xl font-bold text-rose-900">No se pudo cargar Marcaciones</h1>
        <p className="mt-2 text-sm text-rose-700">{error instanceof Error ? error.message : "Error inesperado"}</p>
        <p className="mt-3 text-xs text-rose-600">Verifica que hayas ejecutado los scripts 07 y 08 en Supabase.</p>
      </div>
    );
  }
}
