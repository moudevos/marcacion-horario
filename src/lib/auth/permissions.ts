import type { AppModule, AppRole, CrudAction, EmployeePosition, StaffIdentity } from "@/types/domain";

type PermissionMatrix = Record<AppRole, Record<AppModule, readonly CrudAction[]>>;

export const ROLE_PERMISSIONS: PermissionMatrix = {
  superuser: {
    personal: ["create", "read", "update", "delete"],
    stores: ["create", "read", "update", "delete"],
    schedules: ["create", "read", "update", "delete"],
    attendance: ["create", "read", "update", "delete"],
  },
  admin: {
    personal: ["create", "read", "update"],
    stores: ["create", "read", "update"],
    schedules: ["create", "read", "update"],
    attendance: ["read", "update"],
  },
  store_manager: {
    personal: ["create", "read", "update"],
    stores: ["read", "update"],
    schedules: ["create", "read", "update"],
    attendance: ["read", "update"],
  },
  viewer: {
    personal: ["read"],
    stores: ["read"],
    schedules: ["read"],
    attendance: ["read", "update"],
  },
};

export const DEFAULT_ROLE_BY_POSITION: Record<EmployeePosition, AppRole> = {
  zonal: "admin",
  supervisor: "store_manager",
  visualizador: "viewer",
  promotor: "viewer",
  rh: "admin",
};

export function can(role: AppRole | null, module: AppModule, action: CrudAction) {
  if (!role) return false;
  return ROLE_PERMISSIONS[role][module].includes(action);
}

export function canAccessStore(actor: StaffIdentity, storeId: string) {
  return actor.role === "superuser" || actor.position === "rh" || actor.storeIds.includes(storeId);
}

export function canCreateStaff(
  actor: Pick<StaffIdentity, "role" | "position">,
  target: { role: AppRole; position: EmployeePosition },
) {
  if (actor.role === "superuser") return true;

  if (actor.role === "admin" && actor.position === "rh") {
    return (
      (target.position === "zonal" && target.role === "admin") ||
      (target.position === "supervisor" && target.role === "store_manager") ||
      (target.position === "promotor" && target.role === "viewer")
    );
  }

  if (actor.role === "admin" && actor.position === "zonal") {
    return (
      (target.position === "supervisor" && target.role === "store_manager") ||
      (target.position === "promotor" && target.role === "viewer")
    );
  }

  if (actor.role === "store_manager" && actor.position === "supervisor") {
    return target.position === "promotor" && target.role === "viewer";
  }

  return false;
}
