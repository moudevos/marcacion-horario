import { WeeklyScheduleClient } from "./weekly-schedule-client";
import { getWeeklySchedulesModuleData } from "@/lib/schedules/service";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ store?: string; week?: string }>;
};

export default async function SchedulesPage({ searchParams }: PageProps) {
  const params = await searchParams;

  try {
    const data = await getWeeklySchedulesModuleData({
      storeId: params.store,
      weekStart: params.week,
    });

    return (
      <WeeklyScheduleClient
        key={`${data.selectedStoreId ?? "none"}_${data.weekStart}`}
        initialData={data}
      />
    );
  } catch (error) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6">
        <h1 className="text-xl font-bold text-rose-900">No se pudo cargar Horarios</h1>
        <p className="mt-2 text-sm text-rose-700">
          {error instanceof Error ? error.message : "Error inesperado al cargar el módulo"}
        </p>
        <p className="mt-3 text-xs text-rose-600">
          Verifica que hayas ejecutado el script 05_horarios_semanales.sql en Supabase.
        </p>
      </div>
    );
  }
}
