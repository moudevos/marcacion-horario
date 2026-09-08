import { Camera, Clock3, Fingerprint, MapPin, ShieldCheck } from "lucide-react";
import { AttendanceForm } from "./attendance-form";

export default function PublicAttendancePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10">
      <section className="w-full max-w-2xl overflow-hidden rounded-3xl bg-white shadow-xl ring-1 ring-slate-200">
        <div className="bg-slate-950 px-7 py-8 text-white">
          <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600">
            <Clock3 className="h-6 w-6" />
          </div>
          <p className="text-sm font-medium text-blue-300">Marcación de asistencia</p>
          <h1 className="mt-1 text-3xl font-semibold">Registra tu asistencia</h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-slate-300">
            Ingresa tu DNI. Antes de confirmar se validarán horario, fecha, identidad del dispositivo, prueba de vida facial y ubicación de la tienda.
          </p>
        </div>

        <div className="p-7">
          <AttendanceForm />
          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Info icon={ShieldCheck} text="DNI, horario y secuencia se procesan únicamente en servidor." />
            <Info icon={Fingerprint} text="La Passkey valida identidad sin crear una contraseña del sistema." />
            <Info icon={Camera} text="MediaPipe valida un gesto facial aleatorio sin guardar foto o video." />
            <Info icon={MapPin} text="La ubicación debe estar dentro de la geocerca configurada para la tienda." />
          </div>
        </div>
      </section>
    </main>
  );
}

function Info({ icon: Icon, text }: { icon: typeof ShieldCheck; text: string }) {
  return (
    <div className="flex gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs leading-5 text-slate-600">
      <Icon className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
      <p>{text}</p>
    </div>
  );
}
