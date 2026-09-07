"use client";

import { addDays, format, getISOWeek, parseISO } from "date-fns";
import type {
  ScheduleDraftCell,
  ScheduleEmployee,
  ScheduleStoreOption,
} from "@/types/schedules";

type ExportScheduleInput = {
  store: ScheduleStoreOption;
  weekStart: string;
  employees: ScheduleEmployee[];
  drafts: Record<string, ScheduleDraftCell>;
};

const DAY_LABELS = ["L", "M", "M", "J", "V", "S", "D"] as const;

function cellKey(employeeId: string, date: string) {
  return `${employeeId}_${date}`;
}

function datesForWeek(weekStart: string) {
  const start = parseISO(weekStart);
  return Array.from({ length: 7 }, (_, index) => format(addDays(start, index), "yyyy-MM-dd"));
}

function formatTime12(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return value;
  const hour = Number(match[1]);
  const minute = match[2];
  const suffix = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;
  return `${hour12}:${minute} ${suffix}`;
}

function scheduleText(cell: ScheduleDraftCell) {
  if (cell.mode === "OFF") return "D";
  return `${formatTime12(cell.startTime)} - ${formatTime12(cell.endTime)}`;
}

function scheduleCode(cell: ScheduleDraftCell) {
  if (cell.mode === "OFF") return "D";
  if (cell.mode === "CUSTOM") return "P";
  return cell.mode;
}

function effectiveHours(cell: ScheduleDraftCell) {
  if (cell.mode === "OFF") return 0;
  const [startHour, startMinute] = cell.startTime.split(":").map(Number);
  const [endHour, endMinute] = cell.endTime.split(":").map(Number);
  if (![startHour, startMinute, endHour, endMinute].every(Number.isFinite)) return 0;
  const minutes = endHour * 60 + endMinute - (startHour * 60 + startMinute) - cell.breakMinutes;
  return Math.max(0, Math.round((minutes / 60) * 100) / 100);
}

function sanitizeFilename(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
}

function buildRows(input: ExportScheduleInput, kind: "time" | "code" | "hours") {
  const dates = datesForWeek(input.weekStart);
  return input.employees.map((employee) => [
    employee.fullName,
    employee.dni,
    employee.position ?? "",
    ...dates.map((date) => {
      const cell = input.drafts[cellKey(employee.id, date)] ?? {
        mode: "OFF" as const,
        startTime: "",
        endTime: "",
        breakMinutes: 0,
        toleranceMinutes: 0,
      };
      if (kind === "time") return scheduleText(cell);
      if (kind === "code") return scheduleCode(cell);
      return effectiveHours(cell);
    }),
  ]);
}

export async function copyWeeklyScheduleTable(input: ExportScheduleInput) {
  const week = getISOWeek(parseISO(input.weekStart));
  const dates = datesForWeek(input.weekStart);
  const rows: Array<Array<string | number>> = [
    [input.store.name, "", "", `WK${week}`, "", "", "", "", "", ""],
    [input.store.code, "DNI / CE", "CARGO", ...DAY_LABELS],
    ["", "", "", ...dates.map((date) => format(parseISO(date), "d/M/yyyy"))],
    ...buildRows(input, "time"),
  ];

  const text = rows.map((row) => row.join("\t")).join("\n");
  await navigator.clipboard.writeText(text);
}

export async function exportWeeklyScheduleExcel(input: ExportScheduleInput) {
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Sistema de Marcación y Horarios";
  workbook.created = new Date();

  const week = getISOWeek(parseISO(input.weekStart));
  const dates = datesForWeek(input.weekStart);
  const worksheet = workbook.addWorksheet(`WK${week}`, {
    views: [{ state: "frozen", xSplit: 3, ySplit: 3 }],
    pageSetup: {
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      paperSize: 9,
    },
  });

  worksheet.columns = [
    { width: 34 },
    { width: 14 },
    { width: 24 },
    { width: 22 },
    { width: 22 },
    { width: 22 },
    { width: 22 },
    { width: 22 },
    { width: 22 },
    { width: 22 },
  ];

  const darkBlue = "FF002060";
  const lightBlue = "FFD9EAF7";
  const supervisorYellow = "FFFFE699";
  const black = "FF000000";
  const red = "FFFF0000";
  const white = "FFFFFFFF";
  const thinBorder = {
    top: { style: "thin" as const, color: { argb: black } },
    left: { style: "thin" as const, color: { argb: black } },
    bottom: { style: "thin" as const, color: { argb: black } },
    right: { style: "thin" as const, color: { argb: black } },
  };

  function styleRange(startRow: number, endRow: number) {
    for (let row = startRow; row <= endRow; row += 1) {
      for (let col = 1; col <= 10; col += 1) {
        const cell = worksheet.getCell(row, col);
        cell.border = thinBorder;
        cell.alignment = { vertical: "middle", horizontal: col >= 4 ? "center" : "left" };
        cell.font = { name: "Arial", size: 10 };
      }
    }
  }

  function writeHeader(startRow: number) {
    worksheet.mergeCells(startRow, 4, startRow, 10);
    const weekCell = worksheet.getCell(startRow, 4);
    weekCell.value = `WK${week}`;
    weekCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: darkBlue } };
    weekCell.font = { name: "Arial", size: 11, bold: true, color: { argb: white } };
    weekCell.alignment = { horizontal: "center", vertical: "middle" };

    worksheet.getCell(startRow + 1, 1).value = input.store.name.toUpperCase();
    DAY_LABELS.forEach((label, index) => {
      worksheet.getCell(startRow + 1, index + 4).value = label;
    });

    worksheet.getCell(startRow + 2, 1).value = input.store.code.toUpperCase();
    worksheet.getCell(startRow + 2, 2).value = "DNI / CE";
    worksheet.getCell(startRow + 2, 3).value = "CARGO";
    dates.forEach((date, index) => {
      worksheet.getCell(startRow + 2, index + 4).value = format(parseISO(date), "d/M/yyyy");
    });

    for (let row = startRow + 1; row <= startRow + 2; row += 1) {
      for (let col = 1; col <= 10; col += 1) {
        const cell = worksheet.getCell(row, col);
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: lightBlue } };
        cell.font = { name: "Arial", size: 10, bold: true, color: { argb: black } };
        cell.alignment = { vertical: "middle", horizontal: col >= 4 ? "center" : "left" };
      }
    }
  }

  function writeBlock(startRow: number, kind: "time" | "code" | "hours") {
    writeHeader(startRow);
    const rows = buildRows(input, kind);
    const endRow = startRow + 2 + rows.length;
    styleRange(startRow + 1, endRow);

    rows.forEach((values, employeeIndex) => {
      const rowNumber = startRow + 3 + employeeIndex;
      values.forEach((value, colIndex) => {
        worksheet.getCell(rowNumber, colIndex + 1).value = value;
      });

      const employee = input.employees[employeeIndex];
      if (employee.position === "supervisor") {
        for (let col = 1; col <= 10; col += 1) {
          worksheet.getCell(rowNumber, col).fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: supervisorYellow },
          };
        }
      }

      if (kind !== "hours") {
        for (let col = 4; col <= 10; col += 1) {
          const cell = worksheet.getCell(rowNumber, col);
          if (cell.value === "D") {
            cell.font = { name: "Arial", size: 10, bold: true, color: { argb: red } };
          }
        }
      }
    });

    worksheet.getRow(startRow).height = 22;
    worksheet.getRow(startRow + 1).height = 21;
    worksheet.getRow(startRow + 2).height = 21;
    for (let row = startRow + 3; row <= endRow; row += 1) worksheet.getRow(row).height = 21;
    return endRow;
  }

  const firstEnd = writeBlock(1, "time");
  const secondStart = firstEnd + 4;
  const secondEnd = writeBlock(secondStart, "code");
  const hoursStart = secondEnd + 4;
  writeBlock(hoursStart, "hours");

  worksheet.headerFooter.oddFooter = `&L${input.store.code} - ${input.store.name}&C WK${week}&R&P / &N`;
  worksheet.properties.defaultRowHeight = 20;

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `Horario_${sanitizeFilename(input.store.code)}_WK${week}_${input.weekStart}.xlsx`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
