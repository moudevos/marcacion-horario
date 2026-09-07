export type StoreRecord = {
  id: string;
  code: string;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  active: boolean;
  personnelCount: number;
  schedulesCount: number;
  attendanceCount: number;
  createdAt: string;
  updatedAt: string;
  canEdit: boolean;
  canToggleActive: boolean;
  canDelete: boolean;
};

export type StoresModuleData = {
  stores: StoreRecord[];
  canCreate: boolean;
};

export type StoreActionResult = {
  ok: boolean;
  message: string;
};
