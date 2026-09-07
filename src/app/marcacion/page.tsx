import { Clock3, ShieldCheck } from "lucide-react";
import { AttendanceForm } from "./attendance-form";

export default function PublicAttendancePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10">
      <section className="w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-xl ring-1 ring-slate-200">
        <div className="bg-slate-950 px-7 py-8 text-white">
          <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600">
            <Clock3 className="h-6 w-6" />
          </div>
          <p className="text-sm font-medium text-blue-300">Marcación de asistencia</p>
          <h1 className="mt-1 text-3xl font-semibold">Registra tu asistencia</h1>
          <p className="mt-3 text-sm leading-6 text-slate-300">
            Ingresa tu DNI para iniciar el proceso de validación.
          </p>
        </div>

        <div className="p-7">
          <AttendanceForm />
          <div className="mt-6 flex gap-3 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            <p>
              Esta página es pública, pero no consulta directamente la base de datos. El mecanismo de validación de DNI se habilitará en una capa segura de servidor.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
