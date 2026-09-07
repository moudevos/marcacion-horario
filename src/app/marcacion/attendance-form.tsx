"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ScanLine } from "lucide-react";
import { useForm } from "react-hook-form";
import Swal from "sweetalert2";
import { z } from "zod";

const attendanceSchema = z.object({
  dni: z.string().regex(/^\d{8}$/, "El DNI debe contener exactamente 8 dígitos"),
});

type AttendanceInput = z.infer<typeof attendanceSchema>;

export function AttendanceForm() {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<AttendanceInput>({ resolver: zodResolver(attendanceSchema) });

  async function onSubmit() {
    await Swal.fire({
      icon: "info",
      title: "Validación pendiente",
      text: "La interfaz está lista. Implementaremos el flujo seguro de validación antes de registrar asistencia real.",
      confirmButtonText: "Entendido",
    });
    reset();
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
      <div>
        <label className="mb-2 block text-sm font-semibold text-slate-800" htmlFor="dni">
          DNI
        </label>
        <input
          id="dni"
          inputMode="numeric"
          autoComplete="off"
          maxLength={8}
          placeholder="00000000"
          className="w-full rounded-xl border border-slate-300 px-4 py-3 text-lg tracking-widest text-slate-950 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          {...register("dni")}
        />
        {errors.dni && <p className="mt-1 text-xs text-red-600">{errors.dni.message}</p>}
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
      >
        <ScanLine className="h-5 w-5" />
        Continuar
      </button>
    </form>
  );
}
