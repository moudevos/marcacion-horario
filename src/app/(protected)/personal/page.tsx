import { PersonalClient } from "./personal-client";
import { getPersonalModuleData } from "@/lib/personal/service";
import type { PersonalModuleData } from "@/types/personal";

async function loadPersonalData(): Promise<PersonalModuleData | null> {
  try {
    return await getPersonalModuleData();
  } catch {
    return null;
  }
}

export default async function PersonalPage() {
  const data = await loadPersonalData();

  if (!data) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6">
        <h1 className="text-lg font-bold text-rose-900">No se pudo abrir el módulo de Personal</h1>
        <p className="mt-2 text-sm text-rose-700">
          Verifica que tu usuario tenga permisos y que los scripts SQL requeridos hayan sido ejecutados en Supabase.
        </p>
      </div>
    );
  }

  return <PersonalClient initialData={data} />;
}
