import { WeeklyScheduleClient } from "./weekly-schedule-client";
import { getWeeklySchedulesModuleData } from "@/lib/schedules/service";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ store?: string; week?: string }>;
};

async function loadPageData(params: { store?: string; week?: string }) {
  try {
    return {
      ok: true as const,
      data: await getWeeklySchedulesModuleData({
        storeId: params.store,
        weekStart: params.week,
      }),
    };
  } catch (error) {
    return {
      ok: false as const,
      message: error instanceof Error ? error.message : "Error inesperado al cargar el módulo",
    };
  }
}

export default async function SchedulesPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const result = await loadPageData(params);

  if (!result.ok) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6">
        <h1 className="text-xl font-bold text-rose-900">No se pudo cargar Horarios</h1>
        <p className="mt-2 text-sm text-rose-700">{result.message}</p>
        <p className="mt-3 text-xs text-rose-600">
          Verifica que hayas ejecutado el script 05_horarios_semanales.sql en Supabase.
        </p>
      </div>
    );
  }

  return (
    <WeeklyScheduleClient
      key={`${result.data.selectedStoreId ?? "none"}_${result.data.weekStart}`}
      initialData={result.data}
    />
  );
}
