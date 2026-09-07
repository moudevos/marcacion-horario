"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addDays, format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarDays, ChevronLeft, ChevronRight, Loader2, Save, Store, Users } from "lucide-react";
import Swal from "sweetalert2";
import { confirmDiscardChanges } from "@/lib/ui/confirm-unsaved";
import { createCellForMode, SHIFT_PRESETS } from "@/lib/schedules/presets";
import { saveWeeklyScheduleAction } from "./actions";
import type {
  ScheduleDraftCell,
  ScheduleMode,
  WeeklySchedulesModuleData,
} from "@/types/schedules";

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

function cellKey(employeeId: string, date: string) {
  return `${employeeId}_${date}`;
}

function weekDates(weekStart: string) {
  const start = parseISO(weekStart);
  return Array.from({ length: 7 }, (_, index) => format(addDays(start, index), "yyyy-MM-dd"));
}

function buildDrafts(data: WeeklySchedulesModuleData) {
  const dates = weekDates(data.weekStart);
  const result: Record<string, ScheduleDraftCell> = {};

  for (const employee of data.employees) {
    for (const date of dates) {
      result[cellKey(employee.id, date)] = createCellForMode("OFF");
    }
  }

  for (const schedule of data.schedules) {
    const mode: ScheduleMode = schedule.shiftCode ?? "CUSTOM";
    result[cellKey(schedule.employeeId, schedule.workDate)] = {
      mode,
      startTime: schedule.startTime,
      endTime: schedule.endTime,
      breakMinutes: schedule.breakMinutes,
      toleranceMinutes: schedule.toleranceMinutes,
    };
  }

  return result;
}

export function WeeklyScheduleClient({ initialData }: { initialData: WeeklySchedulesModuleData }) {
  const router = useRouter();
  const dates = useMemo(() => weekDates(initialData.weekStart), [initialData.weekStart]);
  const initialDrafts = useMemo(() => buildDrafts(initialData), [initialData]);
  const [drafts, setDrafts] = useState<Record<string, ScheduleDraftCell>>(initialDrafts);
  const [savedSnapshot, setSavedSnapshot] = useState(() => JSON.stringify(initialDrafts));
  const [isPending, startTransition] = useTransition();

  const dirty = JSON.stringify(drafts) !== savedSnapshot;
  const selectedStore = initialData.stores.find((store) => store.id === initialData.selectedStoreId) ?? null;

  function setMode(employeeId: string, date: string, mode: ScheduleMode) {
    const key = cellKey(employeeId, date);
    setDrafts((current) => ({
      ...current,
      [key]: createCellForMode(mode, current[key]),
    }));
  }

  function patchCell(employeeId: string, date: string, patch: Partial<ScheduleDraftCell>) {
    const key = cellKey(employeeId, date);
    setDrafts((current) => ({
      ...current,
      [key]: { ...current[key], ...patch },
    }));
  }

  async function navigate(storeId: string, weekStart: string) {
    const canNavigate = await confirmDiscardChanges(dirty);
    if (!canNavigate) return;
    router.push(`/horarios?store=${encodeURIComponent(storeId)}&week=${weekStart}`);
  }

  async function moveWeek(days: number) {
    if (!initialData.selectedStoreId) return;
    const target = format(addDays(parseISO(initialData.weekStart), days), "yyyy-MM-dd");
    await navigate(initialData.selectedStoreId, target);
  }

  function saveWeek() {
    if (!initialData.selectedStoreId || !initialData.canEdit) return;

    const entries = initialData.employees.flatMap((employee) =>
      dates.map((date) => {
        const cell = drafts[cellKey(employee.id, date)] ?? createCellForMode("OFF");
        return {
          employeeId: employee.id,
          workDate: date,
          mode: cell.mode,
          startTime: cell.startTime,
          endTime: cell.endTime,
          breakMinutes: cell.breakMinutes,
          toleranceMinutes: cell.toleranceMinutes,
        };
      }),
    );

    startTransition(async () => {
      const result = await saveWeeklyScheduleAction({
        storeId: initialData.selectedStoreId,
        weekStart: initialData.weekStart,
        entries,
      });

      if (!result.ok) {
        await Swal.fire({ title: "No se pudo guardar", text: result.message, icon: "error" });
        return;
      }

      setSavedSnapshot(JSON.stringify(drafts));
      await Swal.fire({
        title: "Semana guardada",
        text: result.message,
        icon: "success",
        timer: 1500,
        showConfirmButton: false,
      });
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-blue-700">
            <CalendarDays className="h-4 w-4" />
            Planificación semanal
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">Horarios</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            Define una semana completa por tienda. Usa A, C o AC para horarios rápidos, o P para personalizar ingreso, salida y almuerzo.
          </p>
        </div>

        {initialData.canEdit && initialData.selectedStoreId && (
          <button
            type="button"
            onClick={saveWeek}
            disabled={isPending || !dirty}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Guardar semana
          </button>
        )}
      </header>

      <section className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:grid-cols-[minmax(260px,1fr)_auto] lg:items-end">
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Tienda</label>
          <select
            value={initialData.selectedStoreId ?? ""}
            onChange={(event) => navigate(event.target.value, initialData.weekStart)}
            disabled={initialData.stores.length === 0}
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100"
          >
            {initialData.stores.length === 0 && <option value="">Sin tiendas disponibles</option>}
            {initialData.stores.map((store) => (
              <option key={store.id} value={store.id}>{store.code} · {store.name}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center justify-between gap-2 lg:justify-end">
          <button type="button" onClick={() => moveWeek(-7)} disabled={!initialData.selectedStoreId} className="rounded-xl border border-slate-300 p-2.5 text-slate-700 hover:bg-slate-50 disabled:opacity-40" aria-label="Semana anterior">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="min-w-52 rounded-xl bg-slate-50 px-4 py-2 text-center">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Semana</p>
            <p className="mt-0.5 text-sm font-semibold text-slate-900">
              {format(parseISO(initialData.weekStart), "d MMM", { locale: es })} – {format(addDays(parseISO(initialData.weekStart), 6), "d MMM yyyy", { locale: es })}
            </p>
          </div>
          <button type="button" onClick={() => moveWeek(7)} disabled={!initialData.selectedStoreId} className="rounded-xl border border-slate-300 p-2.5 text-slate-700 hover:bg-slate-50 disabled:opacity-40" aria-label="Semana siguiente">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </section>

      <section className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
        <Legend code="A" text={`Apertura ${SHIFT_PRESETS.A.startTime}–${SHIFT_PRESETS.A.endTime} · 1 h almuerzo`} />
        <Legend code="C" text={`Cierre ${SHIFT_PRESETS.C.startTime}–${SHIFT_PRESETS.C.endTime}`} />
        <Legend code="AC" text={`Apertura/cierre ${SHIFT_PRESETS.AC.startTime}–${SHIFT_PRESETS.AC.endTime} · 2 h almuerzo`} />
        <Legend code="P" text="Personalizado" />
        <Legend code="L" text="Libre" />
      </section>

      {!selectedStore ? (
        <EmptyState title="No hay tiendas disponibles" text="Crea o asigna una tienda antes de planificar horarios." />
      ) : initialData.employees.length === 0 ? (
        <EmptyState title="No hay trabajadores en esta tienda" text="Asigna personal activo a la tienda para generar la matriz semanal." />
      ) : (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-[1780px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="sticky left-0 z-20 w-64 min-w-64 border-r border-slate-200 bg-slate-50 px-4 py-3">Trabajador</th>
                  {dates.map((date) => (
                    <th key={date} className="w-52 min-w-52 border-r border-slate-200 px-3 py-3 text-center last:border-r-0">
                      <p className="font-semibold capitalize text-slate-900">{format(parseISO(date), "EEEE", { locale: es })}</p>
                      <p className="mt-0.5 text-xs font-normal text-slate-500">{format(parseISO(date), "dd/MM")}</p>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {initialData.employees.map((employee) => (
                  <tr key={employee.id} className="border-b border-slate-100 last:border-b-0">
                    <td className="sticky left-0 z-10 border-r border-slate-200 bg-white px-4 py-4 align-top">
                      <div className="flex items-start gap-3">
                        <div className="rounded-xl bg-blue-50 p-2 text-blue-700"><Users className="h-4 w-4" /></div>
                        <div>
                          <p className="font-semibold text-slate-900">{employee.fullName || "Sin nombre"}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {employee.position ? POSITION_LABELS[employee.position] : "Sin cargo"}
                            {employee.workerType ? ` · ${WORKER_LABELS[employee.workerType]}` : ""}
                          </p>
                        </div>
                      </div>
                    </td>
                    {dates.map((date) => {
                      const cell = drafts[cellKey(employee.id, date)] ?? createCellForMode("OFF");
                      return (
                        <td key={date} className="border-r border-slate-100 p-2 align-top last:border-r-0">
                          <ScheduleCell
                            cell={cell}
                            disabled={!initialData.canEdit || isPending}
                            onMode={(mode) => setMode(employee.id, date, mode)}
                            onPatch={(patch) => patchCell(employee.id, date, patch)}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {dirty && initialData.canEdit && (
        <div className="sticky bottom-3 z-30 mx-auto flex max-w-xl items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 shadow-lg">
          <p className="text-sm font-medium text-amber-900">Hay cambios sin guardar en esta semana.</p>
          <button type="button" onClick={saveWeek} disabled={isPending} className="shrink-0 rounded-lg bg-amber-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Guardar</button>
        </div>
      )}
    </div>
  );
}

function ScheduleCell({
  cell,
  disabled,
  onMode,
  onPatch,
}: {
  cell: ScheduleDraftCell;
  disabled: boolean;
  onMode: (mode: ScheduleMode) => void;
  onPatch: (patch: Partial<ScheduleDraftCell>) => void;
}) {
  return (
    <div className={`rounded-xl border p-2 ${cell.mode === "OFF" ? "border-slate-200 bg-slate-50" : "border-blue-200 bg-blue-50/50"}`}>
      <div className="grid grid-cols-5 gap-1">
        <ModeButton label="L" active={cell.mode === "OFF"} disabled={disabled} onClick={() => onMode("OFF")} />
        <ModeButton label="A" active={cell.mode === "A"} disabled={disabled} onClick={() => onMode("A")} />
        <ModeButton label="C" active={cell.mode === "C"} disabled={disabled} onClick={() => onMode("C")} />
        <ModeButton label="AC" active={cell.mode === "AC"} disabled={disabled} onClick={() => onMode("AC")} />
        <ModeButton label="P" active={cell.mode === "CUSTOM"} disabled={disabled} onClick={() => onMode("CUSTOM")} />
      </div>

      {cell.mode === "OFF" ? (
        <p className="py-5 text-center text-xs font-medium text-slate-400">Día libre</p>
      ) : cell.mode === "CUSTOM" ? (
        <div className="mt-2 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <TimeField label="Ingreso" value={cell.startTime} disabled={disabled} onChange={(value) => onPatch({ startTime: value })} />
            <TimeField label="Salida" value={cell.endTime} disabled={disabled} onChange={(value) => onPatch({ endTime: value })} />
          </div>
          <label className="block">
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Almuerzo (min)</span>
            <input
              type="number"
              min={0}
              max={240}
              step={15}
              value={cell.breakMinutes}
              disabled={disabled}
              onChange={(event) => onPatch({ breakMinutes: Math.max(0, Math.min(240, Number(event.target.value) || 0)) })}
              className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs outline-none focus:border-blue-500 disabled:bg-slate-100"
            />
          </label>
        </div>
      ) : (
        <div className="mt-3 text-center">
          <p className="text-sm font-bold text-slate-900">{cell.startTime} – {cell.endTime}</p>
          <p className="mt-1 text-[11px] text-slate-500">
            {cell.breakMinutes > 0 ? `${cell.breakMinutes} min de almuerzo` : "Sin almuerzo preasignado"}
          </p>
        </div>
      )}
    </div>
  );
}

function ModeButton({ label, active, disabled, onClick }: { label: string; active: boolean; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-md px-1 py-1.5 text-[10px] font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${active ? "bg-blue-600 text-white" : "bg-white text-slate-600 hover:bg-slate-100"}`}
    >
      {label}
    </button>
  );
}

function TimeField({ label, value, disabled, onChange }: { label: string; value: string; disabled: boolean; onChange: (value: string) => void }) {
  return (
    <label>
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      <input type="time" value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-1.5 py-1.5 text-xs outline-none focus:border-blue-500 disabled:bg-slate-100" />
    </label>
  );
}

function Legend({ code, text }: { code: string; text: string }) {
  return <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1.5"><strong>{code}</strong>{text}</span>;
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
