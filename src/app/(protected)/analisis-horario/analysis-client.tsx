"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { addDays, format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import {
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Store,
  TriangleAlert,
  Users,
} from "lucide-react";
import type {
  AnalysisDayStatus,
  ScheduleAnalysisDay,
  ScheduleAnalysisModuleData,
} from "@/types/schedule-analysis";

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

const STATUS_LABELS: Record<AnalysisDayStatus, string> = {
  off: "Descanso",
  missing: "Sin marcación",
  incomplete: "Incompleta",
  ok: "Cumplido",
  deficit: "Déficit",
  excess: "Exceso",
  unscheduled: "No planificado",
};

const STATUS_STYLES: Record<AnalysisDayStatus, string> = {
  off: "bg-slate-100 text-slate-600",
  missing: "bg-rose-50 text-rose-700",
  incomplete: "bg-amber-50 text-amber-700",
  ok: "bg-emerald-50 text-emerald-700",
  deficit: "bg-rose-50 text-rose-700",
  excess: "bg-blue-50 text-blue-700",
  unscheduled: "bg-violet-50 text-violet-700",
};

function hours(value: number | null) {
  if (value === null) return "—";
  return `${value.toFixed(2)} h`;
}

function signedHours(value: number | null) {
  if (value === null) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(2)} h`;
}

function markTime(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

export function ScheduleAnalysisClient({ data }: { data: ScheduleAnalysisModuleData }) {
  const router = useRouter();
  const dates = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addDays(parseISO(data.weekStart), index)),
    [data.weekStart],
  );
  const selectedStore = data.stores.find((store) => store.id === data.selectedStoreId) ?? null;

  function navigate(storeId: string, weekStart: string) {
    router.push(`/analisis-horario?store=${encodeURIComponent(storeId)}&week=${weekStart}`);
  }

  function moveWeek(days: number) {
    if (!data.selectedStoreId) return;
    navigate(data.selectedStoreId, format(addDays(parseISO(data.weekStart), days), "yyyy-MM-dd"));
  }

  return (
    <div className="space-y-5">
      <header>
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-blue-700">
          <BarChart3 className="h-4 w-4" />
          Control de horas
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">Análisis de horario</h1>
        <p className="mt-2 max-w-4xl text-sm text-slate-600">
          Compara las horas efectivas planificadas con la presencia registrada por las marcaciones. Las horas efectivas marcadas descuentan el almuerzo definido en el horario planificado.
        </p>
      </header>

      <section className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:grid-cols-[minmax(260px,1fr)_auto] lg:items-end">
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Tienda</label>
          <select
            value={data.selectedStoreId ?? ""}
            onChange={(event) => navigate(event.target.value, data.weekStart)}
            disabled={data.stores.length === 0}
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100"
          >
            {data.stores.length === 0 && <option value="">Sin tiendas disponibles</option>}
            {data.stores.map((store) => (
              <option key={store.id} value={store.id}>{store.code} · {store.name}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center justify-between gap-2 lg:justify-end">
          <button type="button" onClick={() => moveWeek(-7)} disabled={!data.selectedStoreId} className="rounded-xl border border-slate-300 p-2.5 text-slate-700 hover:bg-slate-50 disabled:opacity-40" aria-label="Semana anterior">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="min-w-52 rounded-xl bg-slate-50 px-4 py-2 text-center">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Semana</p>
            <p className="mt-0.5 text-sm font-semibold text-slate-900">
              {format(parseISO(data.weekStart), "d MMM", { locale: es })} – {format(addDays(parseISO(data.weekStart), 6), "d MMM yyyy", { locale: es })}
            </p>
          </div>
          <button type="button" onClick={() => moveWeek(7)} disabled={!data.selectedStoreId} className="rounded-xl border border-slate-300 p-2.5 text-slate-700 hover:bg-slate-50 disabled:opacity-40" aria-label="Semana siguiente">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric icon={CalendarDays} label="Horas planificadas" value={hours(data.totals.plannedHours)} />
        <Metric icon={Clock3} label="Presencia marcada" value={hours(data.totals.presenceHours)} />
        <Metric icon={CheckCircle2} label="Horas efectivas" value={hours(data.totals.effectiveHours)} />
        <Metric icon={BarChart3} label="Diferencia" value={signedHours(data.totals.varianceHours)} tone={data.totals.varianceHours < -0.25 ? "danger" : "default"} />
        <Metric icon={Users} label="Cumplimiento" value={data.totals.compliancePercent === null ? "—" : `${data.totals.compliancePercent.toFixed(1)}%`} />
      </section>

      {(data.totals.missingDays > 0 || data.totals.incompleteDays > 0) && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Se detectaron <strong>{data.totals.missingDays}</strong> días planificados sin marcación y <strong>{data.totals.incompleteDays}</strong> días con entrada o salida incompleta.
          </p>
        </div>
      )}

      {!selectedStore ? (
        <EmptyState title="No hay tiendas disponibles" text="No existen tiendas dentro del alcance del usuario." />
      ) : data.rows.length === 0 ? (
        <EmptyState title="Sin datos para analizar" text="No hay personal, horarios ni marcaciones relacionadas con esta tienda y semana." />
      ) : (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-[2350px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="sticky left-0 z-20 w-64 min-w-64 border-r border-slate-200 bg-slate-50 px-4 py-3">Trabajador</th>
                  {dates.map((date) => (
                    <th key={date.toISOString()} className="w-60 min-w-60 border-r border-slate-200 px-3 py-3 text-center">
                      <p className="font-semibold capitalize text-slate-900">{format(date, "EEEE", { locale: es })}</p>
                      <p className="mt-0.5 font-normal text-slate-500">{format(date, "dd/MM")}</p>
                    </th>
                  ))}
                  <th className="min-w-28 px-3 py-3 text-right">Plan</th>
                  <th className="min-w-28 px-3 py-3 text-right">Efectivas</th>
                  <th className="min-w-28 px-3 py-3 text-right">Diferencia</th>
                  <th className="min-w-28 px-3 py-3 text-right">Cumpl.</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr key={row.employeeId} className="border-b border-slate-100 last:border-b-0">
                    <td className="sticky left-0 z-10 border-r border-slate-200 bg-white px-4 py-4 align-top">
                      <p className="text-sm font-semibold text-slate-900">{row.fullName || "Sin nombre"}</p>
                      <p className="mt-1 text-slate-500">DNI/CE: {row.dni ?? "—"}</p>
                      <p className="mt-1 text-slate-500">
                        {row.position ? POSITION_LABELS[row.position] : "Sin cargo"}
                        {row.workerType ? ` · ${WORKER_LABELS[row.workerType]}` : ""}
                      </p>
                      {(row.missingDays > 0 || row.incompleteDays > 0) && (
                        <p className="mt-2 font-semibold text-amber-700">{row.missingDays + row.incompleteDays} incidencia(s)</p>
                      )}
                    </td>
                    {row.days.map((day) => <DayCell key={day.date} day={day} />)}
                    <td className="px-3 py-4 text-right font-semibold text-slate-900">{hours(row.plannedHours)}</td>
                    <td className="px-3 py-4 text-right font-semibold text-slate-900">{hours(row.effectiveHours)}</td>
                    <td className={`px-3 py-4 text-right font-bold ${row.varianceHours < -0.25 ? "text-rose-700" : row.varianceHours > 0.25 ? "text-blue-700" : "text-emerald-700"}`}>
                      {signedHours(row.varianceHours)}
                    </td>
                    <td className="px-3 py-4 text-right font-semibold text-slate-900">
                      {row.compliancePercent === null ? "—" : `${row.compliancePercent.toFixed(1)}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs leading-5 text-slate-600">
        <strong className="text-slate-800">Criterio:</strong> plan efectivo = salida planificada − ingreso planificado − almuerzo. Presencia = salida marcada − entrada marcada. Horas efectivas marcadas = presencia − almuerzo planificado. Una diferencia de hasta ±15 minutos se considera cumplida. Una marcación incompleta no genera horas calculadas.
      </section>
    </div>
  );
}

function DayCell({ day }: { day: ScheduleAnalysisDay }) {
  const plannedLabel = day.plannedStart && day.plannedEnd
    ? `${day.shiftCode ?? "P"} · ${day.plannedStart}–${day.plannedEnd}`
    : "D · Descanso";

  return (
    <td className="border-r border-slate-100 p-2 align-top">
      <div className="rounded-xl border border-slate-200 bg-white p-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${STATUS_STYLES[day.status]}`}>{STATUS_LABELS[day.status]}</span>
          <span className="font-semibold text-slate-700">{signedHours(day.varianceHours)}</span>
        </div>
        <div className="mt-2 space-y-1 text-slate-600">
          <p><strong className="text-slate-800">Plan:</strong> {plannedLabel}</p>
          <p><strong className="text-slate-800">Plan efectivo:</strong> {hours(day.plannedHours)}</p>
          <p><strong className="text-slate-800">Marcación:</strong> {markTime(day.checkIn)} – {markTime(day.checkOut)}</p>
          <p><strong className="text-slate-800">Presencia:</strong> {hours(day.presenceHours)}</p>
          <p><strong className="text-slate-800">Efectivas:</strong> {hours(day.effectiveHours)}</p>
        </div>
      </div>
    </td>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  tone = "default",
}: {
  icon: typeof Clock3;
  label: string;
  value: string;
  tone?: "default" | "danger";
}) {
  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${tone === "danger" ? "border-rose-200 bg-rose-50" : "border-slate-200 bg-white"}`}>
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        <Icon className="h-4 w-4" /> {label}
      </div>
      <p className="mt-2 text-2xl font-bold text-slate-950">{value}</p>
    </div>
  );
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
      <Store className="mx-auto h-9 w-9 text-slate-300" />
      <p className="mt-3 font-semibold text-slate-800">{title}</p>
      <p className="mt-1 text-sm text-slate-500">{text}</p>
    </div>
  );
}
