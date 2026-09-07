"use client";

import { useMemo, useState } from "react";
import { Copy, FileSpreadsheet, Loader2 } from "lucide-react";
import Swal from "sweetalert2";
import { copyWeeklyScheduleTable, exportWeeklyScheduleExcel } from "@/lib/schedules/export";
import { createCellForMode } from "@/lib/schedules/presets";
import type { ScheduleDraftCell, ScheduleMode, WeeklySchedulesModuleData } from "@/types/schedules";

function cellKey(employeeId: string, date: string) {
  return `${employeeId}_${date}`;
}

function buildSavedDrafts(data: WeeklySchedulesModuleData) {
  const result: Record<string, ScheduleDraftCell> = {};

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

export function ScheduleExportActions({ data }: { data: WeeklySchedulesModuleData }) {
  const [isExporting, setIsExporting] = useState(false);
  const drafts = useMemo(() => buildSavedDrafts(data), [data]);
  const store = data.stores.find((item) => item.id === data.selectedStoreId) ?? null;

  if (!store || data.employees.length === 0) return null;

  const exportInput = {
    store,
    weekStart: data.weekStart,
    employees: data.employees,
    drafts: Object.fromEntries(
      data.employees.flatMap((employee) =>
        Array.from({ length: 7 }, (_, day) => {
          const date = new Date(`${data.weekStart}T12:00:00`);
          date.setDate(date.getDate() + day);
          const workDate = [
            date.getFullYear(),
            String(date.getMonth() + 1).padStart(2, "0"),
            String(date.getDate()).padStart(2, "0"),
          ].join("-");
          const key = cellKey(employee.id, workDate);
          return [key, drafts[key] ?? createCellForMode("OFF")] as const;
        }),
      ),
    ),
  };

  async function copyTable() {
    try {
      await copyWeeklyScheduleTable(exportInput);
      await Swal.fire({
        title: "Horario copiado",
        text: "Se copió la última versión guardada. Puedes pegarla directamente en Excel o Google Sheets.",
        icon: "success",
        timer: 1500,
        showConfirmButton: false,
      });
    } catch {
      await Swal.fire({
        title: "No se pudo copiar",
        text: "El navegador bloqueó el acceso al portapapeles.",
        icon: "error",
      });
    }
  }

  async function exportExcel() {
    if (isExporting) return;
    setIsExporting(true);
    try {
      await exportWeeklyScheduleExcel(exportInput);
    } catch (error) {
      await Swal.fire({
        title: "No se pudo exportar",
        text: error instanceof Error ? error.message : "Ocurrió un error generando el archivo Excel.",
        icon: "error",
      });
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-semibold text-emerald-950">Formato para envío</p>
        <p className="mt-1 text-xs text-emerald-800">
          Copia o exporta la última versión guardada del horario. El Excel replica el formato operativo con WK, DNI/CE, cargo, turnos y horas efectivas.
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        <button
          type="button"
          onClick={copyTable}
          className="inline-flex items-center gap-2 rounded-xl border border-emerald-300 bg-white px-3 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-100"
        >
          <Copy className="h-4 w-4" />
          Copiar tabla
        </button>
        <button
          type="button"
          onClick={exportExcel}
          disabled={isExporting}
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
        >
          {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
          Exportar Excel
        </button>
      </div>
    </section>
  );
}
