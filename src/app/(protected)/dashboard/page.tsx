import Link from "next/link";
import { CalendarDays, ScanLine, Users } from "lucide-react";

const modules = [
  {
    title: "Personal",
    description: "Colaboradores, roles, cargos y asignaciones.",
    href: "/personal",
    icon: Users,
  },
  {
    title: "Horarios",
    description: "Turnos por trabajador, fecha y tienda.",
    href: "/horarios",
    icon: CalendarDays,
  },
  {
    title: "Marcaciones",
    description: "Consulta y corrección administrativa de asistencia.",
    href: "/marcaciones",
    icon: ScanLine,
  },
];

export default function DashboardPage() {
  return (
    <section>
      <div className="mb-7">
        <p className="text-sm font-medium text-blue-600">Panel administrativo</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">Dashboard</h1>
        <p className="mt-2 text-sm text-slate-600">Base inicial de los tres módulos operativos.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {modules.map((module) => {
          const Icon = module.icon;
          return (
            <Link
              key={module.href}
              href={module.href}
              className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                <Icon className="h-5 w-5" />
              </div>
              <h2 className="text-lg font-semibold text-slate-950">{module.title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">{module.description}</p>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
