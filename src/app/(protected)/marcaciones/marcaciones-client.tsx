"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Clock3,
  Fingerprint,
  KeyRound,
  Loader2,
  Search,
  ShieldCheck,
  Store,
  UserCheck,
} from "lucide-react";
import Swal from "sweetalert2";
import {
  createPasskeyEnrollmentAction,
  registerAdminAttendanceAction,
} from "./actions";
import type { AttendanceAdminModuleData, AttendanceAdminRow } from "@/types/attendance-admin";

const POSITION_LABELS: Record<string, string> = {
  zonal: "Zonal",
  supervisor: "Supervisor",
  visualizador: "Visualizador",
  promotor: "Promotor",
  rh: "RH",
};

const WORKER_LABELS: Record<string, string> = {
  full_time: "Full Time",
  part_time: "Part Time",
};

function timeLabel(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function statusLabel(status: string | null) {
  if (!status) return "Pendiente";
  const labels: Record<string, string> = {
    pending: "Pendiente",
    present: "Presente",
    late: "Tardanza",
    absent: "Ausente",
    justified: "Justificado",
  };
  return labels[status] ?? status;
}

export function AttendanceAdminClient({ data }: { data: AttendanceAdminModuleData }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [storeId, setStoreId] = useState("all");
  const [isPending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return data.rows.filter((row) => {
      if (storeId !== "all" && row.storeId !== storeId) return false;
      if (!normalized) return true;
      return [row.fullName, row.dni ?? "", row.storeCode, row.storeName]
        .some((value) => value.toLowerCase().includes(normalized));
    });
  }, [data.rows, query, storeId]);

  function createEnrollment(row: AttendanceAdminRow) {
    startTransition(async () => {
      const result = await createPasskeyEnrollmentAction(row.employeeId);
      if (!result.ok || !result.enrollmentCode) {
        await Swal.fire({ icon: "error", title: "No se pudo generar", text: result.message });
        return;
      }

      const expiry = result.expiresAt
        ? new Intl.DateTimeFormat("es-PE", {
            timeZone: "America/Lima",
            hour: "2-digit",
            minute: "2-digit",
          }).format(new Date(result.expiresAt))
        : "10 minutos";

      await Swal.fire({
        icon: "success",
        title: "Código de enrolamiento",
        html: `<p style="margin-bottom:8px">${row.fullName}</p><div style="font-size:30px;font-weight:800;letter-spacing:.18em">${result.enrollmentCode}</div><p style="margin-top:12px;font-size:13px">Válido hasta ${expiry}. Debe usarse desde el dispositivo del trabajador.</p>`,
        confirmButtonText: "Cerrar",
      });
    });
  }

  async function adminMark(row: AttendanceAdminRow) {
    if (!row.nextEvent) return;
    const prompt = await Swal.fire({
      title: `Registrar ${row.nextEventLabel}`,
      text: `${row.fullName} · ${row.storeCode}`,
      input: "textarea",
      inputLabel: "Motivo de la marcación administrativa",
      inputPlaceholder: "Ej.: falla del dispositivo del trabajador...",
      inputAttributes: { maxlength: "300" },
      showCancelButton: true,
      confirmButtonText: "Registrar",
      cancelButtonText: "Cancelar",
      preConfirm: (value) => {
        const reason = String(value ?? "").trim();
        if (reason.length < 5) {
          Swal.showValidationMessage("Ingresa un motivo de al menos 5 caracteres");
          return false;
        }
        return reason;
      },
    });

    if (!prompt.isConfirmed || typeof prompt.value !== "string") return;
    startTransition(async () => {
      const result = await registerAdminAttendanceAction({
        employeeId: row.employeeId,
        storeId: row.storeId,
        reason: prompt.value,
      });

      if (!result.ok) {
        await Swal.fire({ icon: "error", title: "No se pudo registrar", text: result.message });
        return;
      }

      await Swal.fire({ icon: "success", title: "Marcación registrada", text: result.message, timer: 1400, showConfirmButton: false });
      router.refresh();
    });
  }

  const completed = data.rows.filter((row) => !row.nextEvent).length;
  const withPasskey = data.rows.filter((row) => row.passkeyCount > 0).length;
  const started = data.rows.filter((row) => row.checkIn).length;

  return (
    <div className="space-y-5">
      <header>
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-blue-700">
          <Clock3 className="h-4 w-4" />
          Operación diaria · {data.workDate}
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">Marcaciones</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Consulta la secuencia del día, enrola Passkeys y registra excepciones administrativas con auditoría.
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        <Metric label="Jornadas iniciadas" value={`${started}/${data.rows.length}`} icon={UserCheck} />
        <Metric label="Jornadas completas" value={`${completed}/${data.rows.length}`} icon={ShieldCheck} />
        <Metric label="Con Passkey" value={`${withPasskey}/${data.rows.length}`} icon={Fingerprint} />
      </section>

      <section className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-[1fr_280px]">
        <label className="relative block">
          <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar nombre, DNI o tienda"
            className="w-full rounded-xl border border-slate-300 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
        </label>
        <select value={storeId} onChange={(event) => setStoreId(event.target.value)} className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500">
          <option value="all">Todas las tiendas</option>
          {data.stores.map((store) => <option key={store.id} value={store.id}>{store.code} · {store.name}</option>)}
        </select>
      </section>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
          No hay trabajadores programados que coincidan con los filtros.
        </div>
      ) : (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-[1180px] w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Trabajador</th>
                  <th className="px-4 py-3">Tienda / horario</th>
                  <th className="px-4 py-3">Ingreso</th>
                  <th className="px-4 py-3">Almuerzo</th>
                  <th className="px-4 py-3">Salida</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3">Passkey</th>
                  <th className="px-4 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((row) => (
                  <tr key={`${row.employeeId}_${row.storeId}`} className="align-top">
                    <td className="px-4 py-4">
                      <p className="font-semibold text-slate-950">{row.fullName}</p>
                      <p className="mt-1 text-xs text-slate-500">{row.dni ?? "Sin DNI"} · {row.position ? POSITION_LABELS[row.position] : "Sin cargo"}{row.workerType ? ` · ${WORKER_LABELS[row.workerType]}` : ""}</p>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2 font-medium text-slate-900"><Store className="h-4 w-4 text-slate-400" />{row.storeCode}</div>
                      <p className="mt-1 text-xs text-slate-500">{row.shiftCode ?? "P"} · {row.startTime}–{row.endTime}</p>
                    </td>
                    <td className="px-4 py-4 font-medium text-slate-800">{timeLabel(row.checkIn)}</td>
                    <td className="px-4 py-4 text-xs text-slate-600">
                      <p>Sale: {timeLabel(row.breakOut)}</p>
                      <p className="mt-1">Vuelve: {timeLabel(row.breakIn)}</p>
                    </td>
                    <td className="px-4 py-4 font-medium text-slate-800">{timeLabel(row.checkOut)}</td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${row.attendanceStatus === "late" ? "bg-amber-100 text-amber-800" : row.checkIn ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>{statusLabel(row.attendanceStatus)}</span>
                      <p className="mt-2 text-xs font-medium text-blue-700">{row.nextEventLabel}</p>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${row.passkeyCount > 0 ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-700"}`}>
                        <Fingerprint className="h-3.5 w-3.5" />
                        {row.passkeyCount > 0 ? `${row.passkeyCount} activa${row.passkeyCount > 1 ? "s" : ""}` : "Sin enrolar"}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex justify-end gap-2">
                        {row.canManage && (
                          <button type="button" onClick={() => createEnrollment(row)} disabled={isPending} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                            <KeyRound className="h-3.5 w-3.5" /> Código
                          </button>
                        )}
                        {row.canManage && row.nextEvent && (
                          <button type="button" onClick={() => adminMark(row)} disabled={isPending} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-950 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50">
                            {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserCheck className="h-3.5 w-3.5" />}
                            Marcar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function Metric({ label, value, icon: Icon }: { label: string; value: string; icon: typeof UserCheck }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        <Icon className="h-4 w-4 text-blue-600" />
      </div>
      <p className="mt-2 text-2xl font-bold text-slate-950">{value}</p>
    </div>
  );
}
