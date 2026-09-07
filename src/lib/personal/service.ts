import "server-only";
import { can, canCreateStaff, getAssignableRolePositions } from "@/lib/auth/permissions";
import { assertPermission, getActorContext } from "@/lib/auth/require-permission";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AppRole, EmployeePosition, WorkerType } from "@/types/domain";
import type { PersonalModuleData, PersonalRecord, StoreOption } from "@/types/personal";

type RawProfile = {
  id: string;
  full_name: string;
  role: AppRole | null;
  position: EmployeePosition | null;
  worker_type: WorkerType | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

type RawIdentifier = { profile_id: string; dni: string };
type RawAssignment = { user_id: string; store_id: string; is_primary: boolean };
type RawStore = { id: string; code: string; name: string; active: boolean };

async function listAllAuthUsers() {
  const admin = createAdminClient();
  const users: Array<{ id: string; email?: string }> = [];

  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`No se pudieron consultar los usuarios de Auth: ${error.message}`);

    users.push(...data.users.map((user) => ({ id: user.id, email: user.email })));
    if (data.users.length < 1000) break;
  }

  return users;
}

function maskDni(dni: string) {
  if (!dni) return "—";
  return `••••••${dni.slice(-2)}`;
}

export async function getPersonalModuleData(): Promise<PersonalModuleData> {
  const actor = await getActorContext();
  assertPermission(actor, "personal", "read");

  const admin = createAdminClient();
  const [profilesResponse, identifiersResponse, assignmentsResponse, storesResponse, authUsers] = await Promise.all([
    admin
      .from("profiles")
      .select("id, full_name, role, position, worker_type, active, created_at, updated_at")
      .order("full_name"),
    admin.from("employee_identifiers").select("profile_id, dni"),
    admin.from("user_store_assignments").select("user_id, store_id, is_primary"),
    admin.from("stores").select("id, code, name, active").order("name"),
    listAllAuthUsers(),
  ]);

  if (profilesResponse.error) throw new Error(profilesResponse.error.message);
  if (identifiersResponse.error) throw new Error(identifiersResponse.error.message);
  if (assignmentsResponse.error) throw new Error(assignmentsResponse.error.message);
  if (storesResponse.error) throw new Error(storesResponse.error.message);

  const profiles = (profilesResponse.data ?? []) as RawProfile[];
  const identifiers = (identifiersResponse.data ?? []) as RawIdentifier[];
  const assignments = (assignmentsResponse.data ?? []) as RawAssignment[];
  const stores = (storesResponse.data ?? []) as RawStore[];

  const emailById = new Map(authUsers.map((user) => [user.id, user.email ?? ""]));
  const dniById = new Map(identifiers.map((identifier) => [identifier.profile_id, identifier.dni]));
  const storeById = new Map(stores.map((store) => [store.id, store]));
  const storeIdsByUser = new Map<string, string[]>();

  for (const assignment of assignments) {
    const current = storeIdsByUser.get(assignment.user_id) ?? [];
    current.push(assignment.store_id);
    storeIdsByUser.set(assignment.user_id, current);
  }

  const globalScope = actor.role === "superuser" || actor.position === "rh";
  const canUpdatePersonal = can(actor.role, "personal", "update");
  const canReadSensitive = globalScope || canUpdatePersonal;

  const staff: PersonalRecord[] = profiles
    .filter((profile) => {
      if (globalScope || profile.id === actor.id) return true;
      const targetStoreIds = storeIdsByUser.get(profile.id) ?? [];
      return targetStoreIds.some((storeId) => actor.storeIds.includes(storeId));
    })
    .map((profile) => {
      const targetStoreIds = storeIdsByUser.get(profile.id) ?? [];
      const targetStores = targetStoreIds
        .map((storeId) => storeById.get(storeId))
        .filter((store): store is RawStore => Boolean(store))
        .map<StoreOption>((store) => ({ ...store }));

      const targetWithinScope =
        globalScope ||
        (targetStoreIds.length > 0 && targetStoreIds.every((storeId) => actor.storeIds.includes(storeId)));

      const hierarchyAllowsEdit =
        profile.role !== null &&
        profile.position !== null &&
        canCreateStaff(actor, { role: profile.role, position: profile.position });

      const isSelf = profile.id === actor.id;
      const canEdit =
        canUpdatePersonal &&
        (isSelf || (targetWithinScope && (actor.role === "superuser" || hierarchyAllowsEdit)));

      const dni = dniById.get(profile.id) ?? "";

      return {
        id: profile.id,
        fullName: profile.full_name,
        email: emailById.get(profile.id) ?? "",
        dni: canReadSensitive || isSelf ? dni || "—" : maskDni(dni),
        role: profile.role,
        position: profile.position,
        workerType: profile.worker_type,
        active: profile.active,
        stores: targetStores,
        createdAt: profile.created_at,
        updatedAt: profile.updated_at,
        isSelf,
        canEdit,
        canToggleActive: canEdit && !isSelf,
      };
    });

  const availableStores = stores
    .filter((store) => store.active && (globalScope || actor.storeIds.includes(store.id)))
    .map<StoreOption>((store) => ({ ...store }));

  const createOptions = getAssignableRolePositions(actor);

  return {
    staff,
    stores: availableStores,
    createOptions,
    canCreate: can(actor.role, "personal", "create") && createOptions.length > 0,
  };
}
