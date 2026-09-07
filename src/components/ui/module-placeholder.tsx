import { Construction } from "lucide-react";

export function ModulePlaceholder({ title, description, actions }: { title: string; description: string; actions: string[] }) {
  return (
    <section>
      <div className="mb-7">
        <p className="text-sm font-medium text-blue-600">Módulo</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">{title}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{description}</p>
      </div>

      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8">
        <Construction className="h-7 w-7 text-amber-600" />
        <h2 className="mt-4 text-lg font-semibold text-slate-950">Estructura preparada</h2>
        <p className="mt-2 text-sm text-slate-600">
          La interfaz CRUD se implementará sobre el modelo de datos y la política de permisos ya definidos.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          {actions.map((action) => (
            <span key={action} className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700">
              {action}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
