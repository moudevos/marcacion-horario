export const APP_ROLES = ["superuser", "admin", "store_manager", "viewer"] as const;
export type AppRole = (typeof APP_ROLES)[number];

export const EMPLOYEE_POSITIONS = ["zonal", "supervisor", "visualizador", "promotor", "rh"] as const;
export type EmployeePosition = (typeof EMPLOYEE_POSITIONS)[number];

export const WORKER_TYPES = ["full_time", "part_time"] as const;
export type WorkerType = (typeof WORKER_TYPES)[number];

export type StaffIdentity = {
  id: string;
  role: AppRole | null;
  position: EmployeePosition | null;
  storeIds: string[];
};

export type AppModule = "personal" | "stores" | "schedules" | "attendance";
export type CrudAction = "create" | "read" | "update" | "delete";
