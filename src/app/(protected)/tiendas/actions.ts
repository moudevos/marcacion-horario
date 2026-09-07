"use server";

import { revalidatePath } from "next/cache";
import { assertPermission, AuthorizationError, getActorContext } from "@/lib/auth/require-permission";
import { createStoreSchema, storeIdSchema, updateStoreSchema, type CreateStoreInput, type UpdateStoreInput } from "@/lib/stores/schemas";
import { createAdminClient } from "@/lib/supabase/admin";
import type { StoreActionResult } from "@/types/stores";

type AdminClient = ReturnType<typeof createAdminClient>;

type StoreSnapshot = {
  id: string;
  code: string;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  active: boolean;
};

function success(message: string): StoreActionResult {
  return { ok: true, message };
}

function failure(message: string): StoreActionResult {
  return { ok: false, message };
}

function firstValidationMessage(error: { issues: Array<{ message: string }> }) {
  return error.issues[0]?.message ?? "Datos inválidos";
}

function formatError(error: unknown) {
  if (error instanceof AuthorizationError) return error.message;
  if (error instanceof Error) return error.message;
  return "Ocurrió un error inesperado";
}

async function loadStore(admin: AdminClient, id: string): Promise<StoreSnapshot> {
  const { data, error } = await admin
    .from("stores")
    .select("id, code, name, address, latitude, longitude, active")
    .eq("id", id)
    .single();

  if (error || !data) throw new Error("La tienda no existe");
  return data as StoreSnapshot;
}

async function saveStore(
  admin: AdminClient,
  data: {
    id: string | null;
    code: string;
    name: string;
    address: string;
    latitude: number | null;
    longitude: number | null;
    active: boolean;
    actorId: string;
    assignActor: boolean;
    auditAction: string;
  },
) {
  const { data: storeId, error } = await admin.rpc("save_store_record", {
    p_store_id: data.id,
    p_code: data.code,
    p_name: data.name,
    p_address: data.address,
    p_latitude: data.latitude,
    p_longitude: data.longitude,
    p_active: data.active,
    p_actor_id: data.actorId,
    p_assign_actor: data.assignActor,
    p_audit_action: data.auditAction,
  });

  if (error) {
    if (error.code === "23505") throw new Error("Ya existe una tienda con ese código");
    throw new Error(error.message);
  }

  return storeId as string;
}

export async function createStoreAction(input: unknown): Promise<StoreActionResult> {
  const parsed = createStoreSchema.safeParse(input);
  if (!parsed.success) return failure(firstValidationMessage(parsed.error));

  const data: CreateStoreInput = parsed.data;

  try {
    const actor = await getActorContext();
    assertPermission(actor, "stores", "create");

    const admin = createAdminClient();
    const assignActor = actor.role !== "superuser" && actor.position !== "rh";

    await saveStore(admin, {
      id: null,
      code: data.code,
      name: data.name,
      address: data.address,
      latitude: data.latitude,
      longitude: data.longitude,
      active: data.active,
      actorId: actor.id,
      assignActor,
      auditAction: "store.create",
    });

    revalidatePath("/tiendas");
    revalidatePath("/personal");
    revalidatePath("/horarios");
    return success("Tienda creada correctamente");
  } catch (error) {
    return failure(formatError(error));
  }
}

export async function updateStoreAction(input: unknown): Promise<StoreActionResult> {
  const parsed = updateStoreSchema.safeParse(input);
  if (!parsed.success) return failure(firstValidationMessage(parsed.error));

  const data: UpdateStoreInput = parsed.data;

  try {
    const actor = await getActorContext();
    assertPermission(actor, "stores", "update", data.id);

    const admin = createAdminClient();
    const snapshot = await loadStore(admin, data.id);

    await saveStore(admin, {
      id: data.id,
      code: data.code,
      name: data.name,
      address: data.address,
      latitude: data.latitude,
      longitude: data.longitude,
      active: snapshot.active,
      actorId: actor.id,
      assignActor: false,
      auditAction: "store.update",
    });

    revalidatePath("/tiendas");
    revalidatePath("/personal");
    revalidatePath("/horarios");
    return success("Tienda actualizada correctamente");
  } catch (error) {
    return failure(formatError(error));
  }
}

export async function toggleStoreActiveAction(input: unknown): Promise<StoreActionResult> {
  const parsed = storeIdSchema.safeParse(input);
  if (!parsed.success) return failure("Identificador de tienda inválido");

  try {
    const actor = await getActorContext();
    assertPermission(actor, "stores", "update", parsed.data);

    const admin = createAdminClient();
    const snapshot = await loadStore(admin, parsed.data);

    await saveStore(admin, {
      id: snapshot.id,
      code: snapshot.code,
      name: snapshot.name,
      address: snapshot.address ?? "",
      latitude: snapshot.latitude,
      longitude: snapshot.longitude,
      active: !snapshot.active,
      actorId: actor.id,
      assignActor: false,
      auditAction: snapshot.active ? "store.deactivate" : "store.reactivate",
    });

    revalidatePath("/tiendas");
    revalidatePath("/horarios");
    return success(snapshot.active ? "Tienda desactivada" : "Tienda reactivada");
  } catch (error) {
    return failure(formatError(error));
  }
}

export async function deleteStoreAction(input: unknown): Promise<StoreActionResult> {
  const parsed = storeIdSchema.safeParse(input);
  if (!parsed.success) return failure("Identificador de tienda inválido");

  try {
    const actor = await getActorContext();
    assertPermission(actor, "stores", "delete", parsed.data);

    if (actor.role !== "superuser") {
      throw new AuthorizationError("Solo SuperUser puede eliminar físicamente una tienda");
    }

    const admin = createAdminClient();
    const { error } = await admin.rpc("delete_store_record", {
      p_store_id: parsed.data,
      p_actor_id: actor.id,
    });

    if (error) throw new Error(error.message);

    revalidatePath("/tiendas");
    revalidatePath("/personal");
    revalidatePath("/horarios");
    return success("Tienda eliminada definitivamente");
  } catch (error) {
    return failure(formatError(error));
  }
}
