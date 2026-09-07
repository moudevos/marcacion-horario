import { Clock3 } from "lucide-react";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10">
      <section className="w-full max-w-md rounded-2xl border border-slate-800 bg-white p-7 shadow-2xl">
        <div className="mb-7 flex items-center gap-3">
          <div className="rounded-xl bg-blue-600 p-3 text-white">
            <Clock3 className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-blue-600">Administración</p>
            <h1 className="text-2xl font-semibold text-slate-950">Marcación y Horarios</h1>
          </div>
        </div>
        <p className="mb-6 text-sm leading-6 text-slate-600">
          Ingresa con tu cuenta administrativa. La página pública de marcación no requiere iniciar sesión.
        </p>
        <LoginForm />
      </section>
    </main>
  );
}
