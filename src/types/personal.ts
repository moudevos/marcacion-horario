import type { AppRole, EmployeePosition } from "@/types/domain";

export type StoreOption = {
  id: string;
  code: string;
  name: string;
  active: boolean;
};

export type RolePositionOption = {
  role: AppRole;
  position: EmployeePosition;
};

export type PersonalRecord = {
  id: string;
  fullName: string;
  email: string;
  dni: string;
  role: AppRole | null;
  position: EmployeePosition | null;
  active: boolean;
  stores: StoreOption[];
  createdAt: string;
  updatedAt: string;
  isSelf: boolean;
  canEdit: boolean;
  canToggleActive: boolean;
};

export type PersonalModuleData = {
  staff: PersonalRecord[];
  stores: StoreOption[];
  createOptions: RolePositionOption[];
  canCreate: boolean;
};

export type PersonalActionResult = {
  ok: boolean;
  message: string;
};
