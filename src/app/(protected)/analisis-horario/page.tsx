import { ScheduleAnalysisClient } from "./analysis-client";
import { getScheduleAnalysisModuleData } from "@/lib/schedule-analysis/service";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ store?: string; week?: string }>;
};

async function loadPageData(params: { store?: string; week?: string }) {
  try {
    return {
      ok: true as const,
      data: await getScheduleAnalysisModuleData({
        storeId: params.store,
        weekStart: params.week,
      }),
    };
  } catch (error) {
    return {
      ok: false as const,
      message: error instanceof Error ? error.message : "Error inesperado al cargar el análisis",
    };
  }
}

export default async function ScheduleAnalysisPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const result = await loadPageData(params);

  if (!result.ok) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6">
        <h1 className="text-xl font-bold text-rose-900">No se pudo cargar el análisis de horario</h1>
        <p className="mt-2 text-sm text-rose-700">{result.message}</p>
        <p className="mt-3 text-xs text-rose-600">
          Verifica permisos, alcance de tienda y que el módulo de Horarios esté configurado.
        </p>
      </div>
    );
  }

  return <ScheduleAnalysisClient data={result.data} />;
}
