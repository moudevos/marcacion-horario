import "server-only";
import { can, canAccessStore, canCreateStaff } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import type { AppModule, AppRole, CrudAction, EmployeePosition, StaffIdentity } from "@/types/domain";

export class AuthorizationError extends Error {
  constructor(message = "No autorizado") {
    super(message);
    this.name = "AuthorizationError";
  }
}

export async function getActorContext(): Promise<StaffIdentity> {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;

  if (!userId) throw new AuthorizationError("Sesión inválida");

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role, position, active")
    .eq("id", userId)
    .single();

  if (profileError || !profile?.active || !profile.role || !profile.position) {
    throw new AuthorizationError("Perfil sin permisos activos");
  }

  const { data: assignments, error: assignmentError } = await supabase
    .from("user_store_assignments")
    .select("store_id")
    .eq("user_id", userId);

  if (assignmentError) throw new AuthorizationError("No se pudo resolver el alcance del usuario");

  return {
    id: userId,
    role: profile.role as AppRole,
    position: profile.position as EmployeePosition,
    storeIds: (assignments ?? []).map((assignment) => assignment.store_id),
  };
}

export function assertPermission(
  actor: StaffIdentity,
  module: AppModule,
  action: CrudAction,
  storeId?: string,
) {
  if (!can(actor.role, module, action)) throw new AuthorizationError();
  if (storeId && !canAccessStore(actor, storeId)) throw new AuthorizationError("Tienda fuera del alcance");
}

export function assertCanCreateStaff(
  actor: StaffIdentity,
  target: { role: AppRole; position: EmployeePosition },
) {
  if (!canCreateStaff(actor, target)) throw new AuthorizationError("No puede crear ese rol/cargo");
}
