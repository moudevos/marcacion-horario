import type { EmployeePosition, WorkerType } from "@/types/domain";

export type ShiftCode = "A" | "C" | "AC" | "CUSTOM";
export type ScheduleMode = "OFF" | ShiftCode;

export type ScheduleStoreOption = {
  id: string;
  code: string;
  name: string;
};

export type ScheduleEmployee = {
  id: string;
  fullName: string;
  dni: string;
  position: EmployeePosition | null;
  workerType: WorkerType | null;
};

export type WeeklyScheduleRecord = {
  id: string;
  employeeId: string;
  workDate: string;
  shiftCode: ShiftCode | null;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  toleranceMinutes: number;
};

export type WeeklySchedulesModuleData = {
  stores: ScheduleStoreOption[];
  selectedStoreId: string | null;
  weekStart: string;
  employees: ScheduleEmployee[];
  schedules: WeeklyScheduleRecord[];
  canEdit: boolean;
};

export type ScheduleDraftCell = {
  mode: ScheduleMode;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  toleranceMinutes: number;
};

export type ScheduleActionResult = {
  ok: boolean;
  message: string;
};
