import { Building2, CalendarDays, Clock3, LayoutDashboard, LogOut, ScanLine, Users } from "lucide-react";
import Link from "next/link";

const navigation = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/personal", label: "Personal", icon: Users },
  { href: "/tiendas", label: "Tiendas", icon: Building2 },
  { href: "/horarios", label: "Horarios", icon: CalendarDays },
  { href: "/marcaciones", label: "Marcaciones", icon: ScanLine },
];

export function AppSidebar({ fullName, role, position }: { fullName: string; role: string; position: string }) {
  return (
    <aside className="border-b border-slate-800 bg-slate-950 text-white lg:min-h-screen lg:w-72 lg:border-b-0 lg:border-r">
      <div className="p-5 lg:sticky lg:top-0">
        <div className="mb-8 flex items-center gap-3">
          <div className="rounded-xl bg-blue-600 p-2.5">
            <Clock3 className="h-5 w-5" />
          </div>
          <div>
            <p className="font-semibold">Marcación</p>
            <p className="text-xs text-slate-400">Administración</p>
          </div>
        </div>

        <nav className="grid gap-1 sm:grid-cols-5 lg:grid-cols-1">
          {navigation.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-300 transition hover:bg-slate-900 hover:text-white"
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-8 border-t border-slate-800 pt-5">
          <p className="truncate text-sm font-medium">{fullName}</p>
          <p className="mt-1 truncate text-xs text-slate-400">{position} · {role}</p>
          <form action="/auth/signout" method="post" className="mt-4">
            <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-300 transition hover:bg-slate-900 hover:text-white">
              <LogOut className="h-4 w-4" />
              Cerrar sesión
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
