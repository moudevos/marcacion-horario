"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import Swal from "sweetalert2";
import {
  Ban,
  Building2,
  CalendarDays,
  CheckCircle2,
  Edit3,
  ExternalLink,
  Loader2,
  MapPin,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { confirmDiscardChanges } from "@/lib/ui/confirm-unsaved";
import { StoreLocationPicker } from "@/components/stores/store-location-picker";
import type { StoreRecord, StoresModuleData } from "@/types/stores";
import { createStoreAction, deleteStoreAction, toggleStoreActiveAction, updateStoreAction } from "./actions";

type StoreFormValues = {
  code: string;
  name: string;
  address: string;
  latitude: string;
  longitude: string;
};

type DialogState =
  | { mode: "create"; record: null }
  | { mode: "edit"; record: StoreRecord }
  | null;

function parseCoordinate(value: string) {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function mapUrl(latitude: number, longitude: number) {
  return `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=18/${latitude}/${longitude}`;
}

export function TiendasClient({ initialData }: { initialData: StoresModuleData }) {
  const router = useRouter();
  const stores = initialData.stores;
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [dialog, setDialog] = useState<DialogState>(null);
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    setError,
    clearErrors,
    control,
    formState: { errors, isDirty },
  } = useForm<StoreFormValues>({
    defaultValues: { code: "", name: "", address: "", latitude: "", longitude: "" },
  });

  const latitudeValue = useWatch({ control, name: "latitude" }) ?? "";
  const longitudeValue = useWatch({ control, name: "longitude" }) ?? "";
  const selectedLatitude = parseCoordinate(latitudeValue);
  const selectedLongitude = parseCoordinate(longitudeValue);

  const filteredStores = useMemo(() => {
    const term = search.trim().toLowerCase();

    return stores.filter((store) => {
      const coordinates =
        store.latitude !== null && store.longitude !== null
          ? `${store.latitude} ${store.longitude}`
          : "";
      const matchesSearch =
        !term ||
        store.code.toLowerCase().includes(term) ||
        store.name.toLowerCase().includes(term) ||
        (store.address ?? "").toLowerCase().includes(term) ||
        coordinates.includes(term);
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && store.active) ||
        (statusFilter === "inactive" && !store.active);

      return matchesSearch && matchesStatus;
    });
  }, [search, statusFilter, stores]);

  const activeCount = stores.filter((store) => store.active).length;
  const locatedCount = stores.filter((store) => store.latitude !== null && store.longitude !== null).length;
  const assignedPersonnel = stores.reduce((total, store) => total + store.personnelCount, 0);

  function openCreate() {
    reset({ code: "", name: "", address: "", latitude: "", longitude: "" });
    setDialog({ mode: "create", record: null });
  }

  function openEdit(record: StoreRecord) {
    reset({
      code: record.code,
      name: record.name,
      address: record.address ?? "",
      latitude: record.latitude?.toString() ?? "",
      longitude: record.longitude?.toString() ?? "",
    });
    setDialog({ mode: "edit", record });
  }

  function updateMapPoint(latitude: number | null, longitude: number | null) {
    clearErrors(["latitude", "longitude"]);
    setValue("latitude", latitude === null ? "" : latitude.toFixed(6), {
      shouldDirty: true,
      shouldValidate: true,
    });
    setValue("longitude", longitude === null ? "" : longitude.toFixed(6), {
      shouldDirty: true,
      shouldValidate: true,
    });
  }

  async function requestClose() {
    if (isPending) return;
    const canClose = await confirmDiscardChanges(isDirty);
    if (canClose) setDialog(null);
  }

  const submitForm = handleSubmit((values) => {
    const latitude = parseCoordinate(values.latitude);
    const longitude = parseCoordinate(values.longitude);

    if (values.latitude.trim() && latitude === null) {
      setError("latitude", { type: "manual", message: "Ingresa una latitud válida" });
      return;
    }
    if (values.longitude.trim() && longitude === null) {
      setError("longitude", { type: "manual", message: "Ingresa una longitud válida" });
      return;
    }
    if (latitude !== null && (latitude < -90 || latitude > 90)) {
      setError("latitude", { type: "manual", message: "La latitud debe estar entre -90 y 90" });
      return;
    }
    if (longitude !== null && (longitude < -180 || longitude > 180)) {
      setError("longitude", { type: "manual", message: "La longitud debe estar entre -180 y 180" });
      return;
    }
    if ((latitude === null) !== (longitude === null)) {
      const message = "Completa latitud y longitud, o deja ambas vacías";
      setError("latitude", { type: "manual", message });
      setError("longitude", { type: "manual", message });
      return;
    }

    const payload = {
      code: values.code,
      name: values.name,
      address: values.address,
      latitude,
      longitude,
    };

    startTransition(async () => {
      const result =
        dialog?.mode === "edit"
          ? await updateStoreAction({ ...payload, id: dialog.record.id, active: dialog.record.active })
          : await createStoreAction({ ...payload, active: true });

      if (!result.ok) {
        await Swal.fire({ title: "No se pudo guardar", text: result.message, icon: "error" });
        return;
      }

      setDialog(null);
      await Swal.fire({
        title: "Operación completada",
        text: result.message,
        icon: "success",
        timer: 1500,
        showConfirmButton: false,
      });
      router.refresh();
    });
  });

  async function toggleActive(record: StoreRecord) {
    const confirmation = await Swal.fire({
      title: record.active ? "¿Desactivar tienda?" : "¿Reactivar tienda?",
      text: record.active
        ? "La tienda dejará de estar disponible para nuevas asignaciones operativas. El historial se conservará."
        : "La tienda volverá a estar disponible según los permisos del sistema.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: record.active ? "Sí, desactivar" : "Sí, reactivar",
      cancelButtonText: "Cancelar",
      reverseButtons: true,
    });

    if (!confirmation.isConfirmed) return;

    startTransition(async () => {
      const result = await toggleStoreActiveAction(record.id);
      if (!result.ok) {
        await Swal.fire({ title: "No se pudo cambiar el estado", text: result.message, icon: "error" });
        return;
      }

      await Swal.fire({ title: "Estado actualizado", text: result.message, icon: "success", timer: 1400, showConfirmButton: false });
      router.refresh();
    });
  }

  async function deleteStore(record: StoreRecord) {
    const confirmation = await Swal.fire({
      title: "¿Eliminar tienda definitivamente?",
      html: `<strong>${record.code} · ${record.name}</strong><br/>Esta acción no se puede deshacer.`,
      icon: "error",
      showCancelButton: true,
      confirmButtonText: "Eliminar definitivamente",
      cancelButtonText: "Cancelar",
      reverseButtons: true,
      focusCancel: true,
    });

    if (!confirmation.isConfirmed) return;

    startTransition(async () => {
      const result = await deleteStoreAction(record.id);
      if (!result.ok) {
        await Swal.fire({ title: "No se pudo eliminar", text: result.message, icon: "error" });
        return;
      }

      await Swal.fire({ title: "Tienda eliminada", text: result.message, icon: "success", timer: 1400, showConfirmButton: false });
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-blue-700">
            <Building2 className="h-4 w-4" />
            Gestión de tiendas
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">Tiendas</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            Administra puntos de trabajo, ubicación geográfica, estado operativo y su relación con personal, horarios y marcaciones.
          </p>
        </div>

        {initialData.canCreate && (
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            Nueva tienda
          </button>
        )}
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Total visible" value={stores.length} />
        <Metric label="Activas" value={activeCount} tone="green" />
        <Metric label="Con ubicación" value={locatedCount} tone="violet" />
        <Metric label="Asignaciones de personal" value={assignedPersonnel} tone="blue" />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="grid gap-3 border-b border-slate-200 p-4 lg:grid-cols-[1fr_190px]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por código, nombre, dirección o coordenadas..."
              className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-10 pr-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </label>

          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as "all" | "active" | "inactive")}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          >
            <option value="all">Todos los estados</option>
            <option value="active">Activas</option>
            <option value="inactive">Inactivas</option>
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Tienda</th>
                <th className="px-4 py-3">Dirección / ubicación</th>
                <th className="px-4 py-3">Personal</th>
                <th className="px-4 py-3">Horarios</th>
                <th className="px-4 py-3">Marcaciones</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredStores.map((record) => {
                const located = record.latitude !== null && record.longitude !== null;
                return (
                  <tr key={record.id} className="align-top hover:bg-slate-50/70">
                    <td className="px-4 py-4">
                      <div className="flex items-start gap-3">
                        <div className="rounded-xl bg-slate-100 p-2 text-slate-600">
                          <Building2 className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="font-semibold text-slate-900">{record.name}</p>
                          <p className="mt-1 font-mono text-xs font-semibold text-blue-700">{record.code}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="max-w-80 space-y-2 text-xs text-slate-600">
                        <div className="flex items-start gap-1.5">
                          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          <span>{record.address || "Sin dirección registrada"}</span>
                        </div>
                        {located ? (
                          <div className="flex flex-wrap items-center gap-2 pl-5">
                            <span className="font-mono text-[11px] text-slate-500">
                              {record.latitude?.toFixed(6)}, {record.longitude?.toFixed(6)}
                            </span>
                            <a
                              href={mapUrl(record.latitude as number, record.longitude as number)}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 font-semibold text-blue-700 hover:underline"
                            >
                              Ver mapa <ExternalLink className="h-3 w-3" />
                            </a>
                          </div>
                        ) : (
                          <p className="pl-5 text-[11px] text-amber-700">Sin punto geográfico</p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4"><UsageBadge icon={UserRound} value={record.personnelCount} /></td>
                    <td className="px-4 py-4"><UsageBadge icon={CalendarDays} value={record.schedulesCount} /></td>
                    <td className="px-4 py-4"><span className="font-semibold text-slate-800">{record.attendanceCount}</span></td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${record.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                        {record.active ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Ban className="h-3.5 w-3.5" />}
                        {record.active ? "Activa" : "Inactiva"}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex justify-end gap-2">
                        {record.canEdit && (
                          <button type="button" onClick={() => openEdit(record)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100">
                            <Edit3 className="h-3.5 w-3.5" />Editar
                          </button>
                        )}
                        {record.canToggleActive && (
                          <button
                            type="button"
                            onClick={() => toggleActive(record)}
                            disabled={isPending}
                            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold transition disabled:opacity-50 ${record.active ? "border border-rose-200 text-rose-700 hover:bg-rose-50" : "border border-emerald-200 text-emerald-700 hover:bg-emerald-50"}`}
                          >
                            {record.active ? <Ban className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                            {record.active ? "Desactivar" : "Reactivar"}
                          </button>
                        )}
                        {record.canDelete && (
                          <button type="button" onClick={() => deleteStore(record)} disabled={isPending} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300 px-2.5 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-50 disabled:opacity-50">
                            <Trash2 className="h-3.5 w-3.5" />Eliminar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredStores.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center">
                    <Building2 className="mx-auto h-8 w-8 text-slate-300" />
                    <p className="mt-3 font-medium text-slate-700">No se encontraron tiendas</p>
                    <p className="mt-1 text-xs text-slate-500">Modifica los filtros o crea una nueva tienda si tienes permiso.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {dialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 sm:p-6"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) void requestClose();
          }}
        >
          <div className="max-h-[94vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
            <div className="sticky top-0 z-20 flex items-start justify-between border-b border-slate-200 bg-white px-5 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
                  {dialog.mode === "create" ? "Alta de tienda" : "Edición de tienda"}
                </p>
                <h2 className="mt-1 text-xl font-bold text-slate-950">
                  {dialog.mode === "create" ? "Nueva tienda" : dialog.record.name}
                </h2>
              </div>
              <button type="button" onClick={() => void requestClose()} disabled={isPending} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50" aria-label="Cerrar">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={submitForm} className="space-y-5 p-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Código" error={errors.code?.message}>
                  <input
                    {...register("code", {
                      required: "El código es obligatorio",
                      minLength: { value: 2, message: "Ingresa al menos 2 caracteres" },
                      maxLength: { value: 20, message: "Máximo 20 caracteres" },
                      pattern: { value: /^[A-Za-z0-9_-]+$/, message: "Usa letras, números, guion o guion bajo" },
                    })}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2.5 font-mono text-sm uppercase outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    placeholder="T001"
                  />
                </Field>

                <Field label="Nombre" error={errors.name?.message}>
                  <input
                    {...register("name", {
                      required: "El nombre es obligatorio",
                      minLength: { value: 2, message: "Ingresa al menos 2 caracteres" },
                    })}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    placeholder="Tienda San Isidro"
                  />
                </Field>

                <Field label="Dirección" error={errors.address?.message} wide>
                  <textarea
                    {...register("address", { maxLength: { value: 250, message: "Máximo 250 caracteres" } })}
                    rows={3}
                    className="w-full resize-none rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    placeholder="Dirección o referencia del punto de trabajo"
                  />
                </Field>
              </div>

              <section className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                <div>
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <MapPin className="h-4 w-4 text-blue-700" />
                    Ubicación geográfica
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    Puedes escribir las coordenadas o seleccionar el punto directamente en el mapa. Este dato podrá usarse más adelante para validar marcaciones por proximidad.
                  </p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Latitud" error={errors.latitude?.message}>
                    <input
                      type="number"
                      step="0.000001"
                      min={-90}
                      max={90}
                      {...register("latitude")}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 font-mono text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      placeholder="-12.046374"
                    />
                  </Field>
                  <Field label="Longitud" error={errors.longitude?.message}>
                    <input
                      type="number"
                      step="0.000001"
                      min={-180}
                      max={180}
                      {...register("longitude")}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 font-mono text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      placeholder="-77.042793"
                    />
                  </Field>
                </div>

                <StoreLocationPicker
                  latitude={selectedLatitude}
                  longitude={selectedLongitude}
                  disabled={isPending}
                  onChange={updateMapPoint}
                />
              </section>

              {isDirty && (
                <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                  Hay cambios sin guardar. Si intentas cerrar el modal se solicitará confirmación.
                </div>
              )}

              <div className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-4 sm:flex-row sm:justify-end">
                <button type="button" onClick={() => void requestClose()} disabled={isPending} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                  Cancelar
                </button>
                <button type="submit" disabled={isPending} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60">
                  {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                  {dialog.mode === "create" ? "Crear tienda" : "Guardar cambios"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, tone = "slate" }: { label: string; value: number; tone?: "slate" | "green" | "blue" | "violet" }) {
  const tones = {
    slate: "border-slate-200 bg-white text-slate-950",
    green: "border-emerald-200 bg-emerald-50 text-emerald-950",
    blue: "border-blue-200 bg-blue-50 text-blue-950",
    violet: "border-violet-200 bg-violet-50 text-violet-950",
  };

  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${tones[tone]}`}>
      <p className="text-xs font-semibold uppercase tracking-wide opacity-70">{label}</p>
      <p className="mt-2 text-2xl font-bold">{value}</p>
    </div>
  );
}

function UsageBadge({ icon: Icon, value }: { icon: typeof UserRound; value: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
      <Icon className="h-3.5 w-3.5" />
      {value}
    </span>
  );
}

function Field({ label, error, wide = false, children }: { label: string; error?: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <label className={wide ? "sm:col-span-2" : undefined}>
      <span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span>
      {children}
      {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
    </label>
  );
}
