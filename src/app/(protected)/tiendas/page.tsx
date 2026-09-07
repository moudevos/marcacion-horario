import { TiendasClient } from "./tiendas-client";
import { getStoresModuleData } from "@/lib/stores/service";

export const dynamic = "force-dynamic";

async function loadPageData() {
  try {
    return { ok: true as const, data: await getStoresModuleData() };
  } catch (error) {
    return {
      ok: false as const,
      message: error instanceof Error ? error.message : "No se pudo cargar el módulo de Tiendas",
    };
  }
}

export default async function TiendasPage() {
  const result = await loadPageData();

  if (!result.ok) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6">
        <h1 className="text-xl font-bold text-rose-950">No se pudo abrir Tiendas</h1>
        <p className="mt-2 text-sm text-rose-800">{result.message}</p>
      </div>
    );
  }

  return <TiendasClient initialData={result.data} />;
}
