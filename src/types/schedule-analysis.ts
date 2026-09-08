import type { EmployeePosition, WorkerType } from "@/types/domain";

export type AnalysisDayStatus =
  | "off"
  | "missing"
  | "incomplete"
  | "ok"
  | "deficit"
  | "excess"
  | "unscheduled";

export type ScheduleAnalysisStore = {
  id: string;
  code: string;
  name: string;
};

export type ScheduleAnalysisDay = {
  date: string;
  shiftCode: string | null;
  plannedStart: string | null;
  plannedEnd: string | null;
  breakMinutes: number;
  plannedHours: number;
  checkIn: string | null;
  checkOut: string | null;
  attendanceStatus: string | null;
  presenceHours: number | null;
  effectiveHours: number | null;
  varianceHours: number | null;
  status: AnalysisDayStatus;
};

export type ScheduleAnalysisRow = {
  employeeId: string;
  fullName: string;
  dni: string | null;
  position: EmployeePosition | null;
  workerType: WorkerType | null;
  days: ScheduleAnalysisDay[];
  plannedHours: number;
  presenceHours: number;
  effectiveHours: number;
  varianceHours: number;
  compliancePercent: number | null;
  incompleteDays: number;
  missingDays: number;
};

export type ScheduleAnalysisTotals = {
  plannedHours: number;
  presenceHours: number;
  effectiveHours: number;
  varianceHours: number;
  compliancePercent: number | null;
  incompleteDays: number;
  missingDays: number;
};

export type ScheduleAnalysisModuleData = {
  stores: ScheduleAnalysisStore[];
  selectedStoreId: string | null;
  weekStart: string;
  rows: ScheduleAnalysisRow[];
  totals: ScheduleAnalysisTotals;
};
