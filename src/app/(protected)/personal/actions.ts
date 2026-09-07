"use server";

import { revalidatePath } from "next/cache";
import { canCreateStaff } from "@/lib/auth/permissions";
import { AuthorizationError, assertPermission, getActorContext } from "@/lib/auth/require-permission";
import {
  createPersonalSchema,
  personalIdSchema,
  updatePersonalSchema,
  type CreatePersonalInput,
  type UpdatePersonalInput,
} from "@/lib/personal/schemas";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AppRole, EmployeePosition, StaffIdentity } from "@/types/domain";
import type { PersonalActionResult } from "@/types/personal";

type AdminClient = ReturnType<typeof createAdminClient>;

type PersonalSnapshot = {
  id: string;
  fullName: string;
  email: string;
  dni: string | null;
  role: AppRole | null;
  position: EmployeePosition | null;
  active: boolean;
  storeIds: string[];
};

function failure(message: string): PersonalActionResult {
  return { ok: false, message };
}

function success(message: string): PersonalActionResult {
  return { ok: true, message };
}

function firstValidationMessage(error: { issues: Array<{ message: string }> }) {
  return error.issues[0]?.message ?? "Datos inválidos";
}

function formatError(error: unknown) {
  if (error instanceof AuthorizationError) return error.message;
  if (error instanceof Error) {
    if (error.message.toLowerCase().includes("duplicate") || error.message.includes("23505")) {
      return "El correo o DNI ya pertenece a otro usuario";
    }
    return error.message;
  }
  return "Ocurrió un error inesperado";
}

function hasGlobalStoreScope(actor: StaffIdentity) {
  return actor.role === "superuser" || actor.position === "rh";
}

function normalizeStoreIds(storeIds: string[]) {
  return [...new Set(storeIds)].sort();
}

function sameStoreIds(left: string[], right: string[]) {
  const a = normalizeStoreIds(left);
  const b = normalizeStoreIds(right);
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function assertStoreScope(actor: StaffIdentity, storeIds: string[]) {
  if (hasGlobalStoreScope(actor)) return;
  if (!storeIds.every((storeId) => actor.storeIds.includes(storeId))) {
    throw new AuthorizationError("Una o más tiendas están fuera de tu alcance");
  }
}

async function assertStoresExist(admin: AdminClient, storeIds: string[]) {
  const uniqueIds = normalizeStoreIds(storeIds);
  if (uniqueIds.length === 0) return;

  const { data, error } = await admin.from("stores").select("id").in("id", uniqueIds).eq("active", true);
  if (error) throw new Error(`No se pudieron validar las tiendas: ${error.message}`);
  if ((data ?? []).length !== uniqueIds.length) {
    throw new Error("Una o más tiendas no existen o están inactivas");
  }
}

async function loadSnapshot(admin: AdminClient, userId: string): Promise<PersonalSnapshot> {
  const [profileResponse, identifierResponse, assignmentsResponse, authResponse] = await Promise.all([
    admin.from("profiles").select("id, full_name, role, position, active").eq("id", userId).single(),
    admin.from("employee_identifiers").select("dni").eq("profile_id", userId).maybeSingle(),
    admin.from("user_store_assignments").select("store_id").eq("user_id", userId),
    admin.auth.admin.getUserById(userId),
  ]);

  if (profileResponse.error || !profileResponse.data) throw new Error("El usuario no existe");
  if (identifierResponse.error) throw new Error(identifierResponse.error.message);
  if (assignmentsResponse.error) throw new Error(assignmentsResponse.error.message);
  if (authResponse.error || !authResponse.data.user) throw new Error("No se pudo consultar la cuenta de acceso");

  const profile = profileResponse.data as {
    id: string;
    full_name: string;
    role: AppRole | null;
    position: EmployeePosition | null;
    active: boolean;
  };

  return {
    id: profile.id,
    fullName: profile.full_name,
    email: authResponse.data.user.email ?? "",
    dni: (identifierResponse.data as { dni?: string } | null)?.dni ?? null,
    role: profile.role,
    position: profile.position,
    active: profile.active,
    storeIds: (assignmentsResponse.data ?? []).map((assignment) => assignment.store_id),
  };
}

async function saveDatabaseRecord(
  admin: AdminClient,
  data: {
    id: string;
    fullName: string;
    dni: string | null;
    role: AppRole | null;
    position: EmployeePosition | null;
    active: boolean;
    storeIds: string[];
  },
  actorId: string,
  auditAction: string,
) {
  const { error } = await admin.rpc("save_personal_record", {
    p_user_id: data.id,
    p_full_name: data.fullName,
    p_role: data.role,
    p_position: data.position,
    p_active: data.active,
    p_dni: data.dni,
    p_store_ids: normalizeStoreIds(data.storeIds),
    p_actor_id: actorId,
    p_audit_action: auditAction,
  });

  if (error) {
    if (error.code === "23505") throw new Error("El DNI ya está registrado en otro usuario");
    throw new Error(`No se pudo guardar el personal: ${error.message}`);
  }
}

function assertCanManageTarget(
  actor: StaffIdentity,
  snapshot: PersonalSnapshot,
  desired: { role: AppRole; position: EmployeePosition; active: boolean; storeIds: string[] },
) {
  assertPermission(actor, "personal", "update");

  if (snapshot.id === actor.id) {
    if (
      snapshot.role !== desired.role ||
      snapshot.position !== desired.position ||
      snapshot.active !== desired.active ||
      !sameStoreIds(snapshot.storeIds, desired.storeIds)
    ) {
      throw new AuthorizationError("No puedes cambiar tu propio rol, cargo, estado o alcance de tiendas");
    }
    return;
  }

  if (!hasGlobalStoreScope(actor)) {
    if (!snapshot.storeIds.every((storeId) => actor.storeIds.includes(storeId))) {
      throw new AuthorizationError("El usuario tiene tiendas fuera de tu alcance");
    }
  }

  if (snapshot.role === null || snapshot.position === null) {
    if (actor.role !== "superuser") {
      throw new AuthorizationError("Solo SuperUser puede configurar un perfil sin rol o cargo");
    }
  } else if (!canCreateStaff(actor, { role: snapshot.role, position: snapshot.position })) {
    throw new AuthorizationError("No puedes administrar este usuario");
  }

  if (!canCreateStaff(actor, { role: desired.role, position: desired.position })) {
    throw new AuthorizationError("No puedes asignar ese rol y cargo");
  }

  assertStoreScope(actor, desired.storeIds);
}

export async function createPersonalAction(input: unknown): Promise<PersonalActionResult> {
  const parsed = createPersonalSchema.safeParse(input);
  if (!parsed.success) return failure(firstValidationMessage(parsed.error));

  const data: CreatePersonalInput = parsed.data;

  try {
    const actor = await getActorContext();
    assertPermission(actor, "personal", "create");

    if (!canCreateStaff(actor, { role: data.role, position: data.position })) {
      throw new AuthorizationError("No puedes crear personal con ese rol y cargo");
    }

    assertStoreScope(actor, data.storeIds);

    const admin = createAdminClient();
    await assertStoresExist(admin, data.storeIds);

    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.fullName },
    });

    if (authError || !authData.user) {
      const message = authError?.message ?? "No se pudo crear la cuenta de acceso";
      if (message.toLowerCase().includes("already")) return failure("El correo ya está registrado");
      throw new Error(message);
    }

    try {
      await saveDatabaseRecord(
        admin,
        {
          id: authData.user.id,
          fullName: data.fullName,
          dni: data.dni,
          role: data.role,
          position: data.position,
          active: data.active,
          storeIds: data.storeIds,
        },
        actor.id,
        "personal.create",
      );
    } catch (error) {
      await admin.auth.admin.deleteUser(authData.user.id).catch(() => undefined);
      throw error;
    }

    revalidatePath("/personal");
    return success("Personal creado correctamente");
  } catch (error) {
    return failure(formatError(error));
  }
}

export async function updatePersonalAction(input: unknown): Promise<PersonalActionResult> {
  const parsed = updatePersonalSchema.safeParse(input);
  if (!parsed.success) return failure(firstValidationMessage(parsed.error));

  const data: UpdatePersonalInput = parsed.data;

  try {
    const actor = await getActorContext();
    const admin = createAdminClient();
    const snapshot = await loadSnapshot(admin, data.id);

    assertCanManageTarget(actor, snapshot, data);
    await assertStoresExist(admin, data.storeIds);

    await saveDatabaseRecord(
      admin,
      {
        id: data.id,
        fullName: data.fullName,
        dni: data.dni,
        role: data.role,
        position: data.position,
        active: data.active,
        storeIds: data.storeIds,
      },
      actor.id,
      "personal.update",
    );

    const authChanges: { email: string; password?: string; user_metadata: { full_name: string } } = {
      email: data.email,
      user_metadata: { full_name: data.fullName },
    };
    if (data.password) authChanges.password = data.password;

    const { error: authError } = await admin.auth.admin.updateUserById(data.id, authChanges);

    if (authError) {
      await saveDatabaseRecord(
        admin,
        {
          id: snapshot.id,
          fullName: snapshot.fullName,
          dni: snapshot.dni,
          role: snapshot.role,
          position: snapshot.position,
          active: snapshot.active,
          storeIds: snapshot.storeIds,
        },
        actor.id,
        "personal.rollback",
      );
      throw new Error(`No se pudo actualizar la cuenta de acceso: ${authError.message}`);
    }

    revalidatePath("/personal");
    return success("Personal actualizado correctamente");
  } catch (error) {
    return failure(formatError(error));
  }
}

export async function togglePersonalActiveAction(input: unknown): Promise<PersonalActionResult> {
  const parsedId = personalIdSchema.safeParse(input);
  if (!parsedId.success) return failure("Identificador de usuario inválido");

  try {
    const actor = await getActorContext();
    const admin = createAdminClient();
    const snapshot = await loadSnapshot(admin, parsedId.data);

    if (snapshot.id === actor.id) throw new AuthorizationError("No puedes desactivar tu propia cuenta");
    if (!snapshot.role || !snapshot.position) {
      if (actor.role !== "superuser") throw new AuthorizationError("No puedes administrar este perfil");
    } else if (!canCreateStaff(actor, { role: snapshot.role, position: snapshot.position })) {
      throw new AuthorizationError("No puedes administrar este usuario");
    }

    assertPermission(actor, "personal", "update");
    assertStoreScope(actor, snapshot.storeIds);

    await saveDatabaseRecord(
      admin,
      { ...snapshot, active: !snapshot.active },
      actor.id,
      snapshot.active ? "personal.deactivate" : "personal.reactivate",
    );

    revalidatePath("/personal");
    return success(snapshot.active ? "Personal desactivado" : "Personal reactivado");
  } catch (error) {
    return failure(formatError(error));
  }
}
