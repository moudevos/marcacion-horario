import "server-only";

import { can, canAccessStore } from "@/lib/auth/permissions";
import { assertPermission, getActorContext } from "@/lib/auth/require-permission";
import { createAdminClient } from "@/lib/supabase/admin";
import type { StoresModuleData, StoreRecord } from "@/types/stores";

type RawStore = {
  id: string;
  code: string;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  attendance_radius_meters: number;
  active: boolean;
  created_at: string;
  updated_at: string;
};

type StoreRef = { store_id: string };

function countByStore(rows: StoreRef[]) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    counts.set(row.store_id, (counts.get(row.store_id) ?? 0) + 1);
  }
  return counts;
}

export async function getStoresModuleData(): Promise<StoresModuleData> {
  const actor = await getActorContext();
  assertPermission(actor, "stores", "read");

  const admin = createAdminClient();
  const [storesResponse, assignmentsResponse, schedulesResponse, attendanceResponse] = await Promise.all([
    admin
      .from("stores")
      .select("id, code, name, address, latitude, longitude, attendance_radius_meters, active, created_at, updated_at")
      .order("name"),
    admin.from("user_store_assignments").select("store_id"),
    admin.from("schedules").select("store_id"),
    admin.from("attendance_records").select("store_id"),
  ]);

  if (storesResponse.error) throw new Error(storesResponse.error.message);
  if (assignmentsResponse.error) throw new Error(assignmentsResponse.error.message);
  if (schedulesResponse.error) throw new Error(schedulesResponse.error.message);
  if (attendanceResponse.error) throw new Error(attendanceResponse.error.message);

  const personnelCounts = countByStore((assignmentsResponse.data ?? []) as StoreRef[]);
  const scheduleCounts = countByStore((schedulesResponse.data ?? []) as StoreRef[]);
  const attendanceCounts = countByStore((attendanceResponse.data ?? []) as StoreRef[]);
  const globalScope = actor.role === "superuser" || actor.position === "rh";
  const canUpdate = can(actor.role, "stores", "update");

  const stores: StoreRecord[] = ((storesResponse.data ?? []) as RawStore[])
    .filter((store) => globalScope || actor.storeIds.includes(store.id))
    .map((store) => {
      const inScope = canAccessStore(actor, store.id);
      const personnelCount = personnelCounts.get(store.id) ?? 0;
      const schedulesCount = scheduleCounts.get(store.id) ?? 0;
      const attendanceCount = attendanceCounts.get(store.id) ?? 0;

      return {
        id: store.id,
        code: store.code,
        name: store.name,
        address: store.address,
        latitude: store.latitude,
        longitude: store.longitude,
        attendanceRadiusMeters: store.attendance_radius_meters ?? 100,
        active: store.active,
        personnelCount,
        schedulesCount,
        attendanceCount,
        createdAt: store.created_at,
        updatedAt: store.updated_at,
        canEdit: canUpdate && inScope,
        canToggleActive: canUpdate && inScope,
        canDelete:
          actor.role === "superuser" &&
          personnelCount === 0 &&
          schedulesCount === 0 &&
          attendanceCount === 0,
      };
    });

  return {
    stores,
    canCreate: can(actor.role, "stores", "create"),
  };
}
