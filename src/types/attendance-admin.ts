import type { EmployeePosition, WorkerType } from "@/types/domain";
import type { PublicAttendanceEvent } from "@/types/public-attendance";

export type AttendanceAdminStore = {
  id: string;
  code: string;
  name: string;
};

export type AttendanceAdminRow = {
  employeeId: string;
  fullName: string;
  dni: string | null;
  position: EmployeePosition | null;
  workerType: WorkerType | null;
  storeId: string;
  storeCode: string;
  storeName: string;
  shiftCode: string | null;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  checkIn: string | null;
  breakOut: string | null;
  breakIn: string | null;
  checkOut: string | null;
  attendanceStatus: string | null;
  nextEvent: PublicAttendanceEvent | null;
  nextEventLabel: string;
  passkeyCount: number;
  canManage: boolean;
};

export type AttendanceAdminModuleData = {
  workDate: string;
  stores: AttendanceAdminStore[];
  rows: AttendanceAdminRow[];
  canManage: boolean;
};

export type AttendanceAdminActionResult = {
  ok: boolean;
  message: string;
  enrollmentCode?: string;
  expiresAt?: string;
};
