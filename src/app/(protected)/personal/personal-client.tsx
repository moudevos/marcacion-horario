"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import Swal from "sweetalert2";
import {
  Ban,
  BriefcaseBusiness,
  CheckCircle2,
  Edit3,
  Loader2,
  Plus,
  Search,
  ShieldCheck,
  Store,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { createPersonalAction, togglePersonalActiveAction, updatePersonalAction } from "./actions";
import type { AppRole, EmployeePosition, WorkerType } from "@/types/domain";
import type { PersonalModuleData, PersonalRecord, RolePositionOption } from "@/types/personal";

type PersonalFormValues = {
  fullName: string;
  email: string;
  dni: string;
  password: string;
  role: AppRole;
  position: EmployeePosition;
  workerType: WorkerType | "";
  storeIds: string[];
};

type DialogState =
  | { mode: "create"; record: null }
  | { mode: "edit"; record: PersonalRecord }
  | null;

const ROLE_LABELS: Record<AppRole, string> = {
  superuser: "SuperUser",
  admin: "Administrador",
  store_manager: "Gestor de tienda",
  viewer: "Visualizador",
};

const POSITION_LABELS: Record<EmployeePosition, string> = {
  zonal: "Zonal",
  supervisor: "Supervisor",
  visualizador: "Visualizador",
  promotor: "Promotor",
  rh: "RH",
};

const WORKER_TYPE_LABELS: Record<WorkerType, string> = {
  full_time: "Full Time",
  part_time: "Part Time",
};

function uniquePositions(options: RolePositionOption[]) {
  return [...new Set(options.map((option) => option.position))];
}

function initialOption(options: RolePositionOption[]) {
  return options[0] ?? { role: "viewer" as AppRole, position: "promotor" as EmployeePosition };
}

export function PersonalClient({ initialData }: { initialData: PersonalModuleData }) {
  const router = useRouter();
  const [staff, setStaff] = useState(initialData.staff);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | AppRole>("all");
  const [workerTypeFilter, setWorkerTypeFilter] = useState<"all" | "undefined" | WorkerType>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [dialog, setDialog] = useState<DialogState>(null);
  const [isPending, startTransition] = useTransition();

  const defaultAssignment = initialOption(initialData.createOptions);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    setValue,
    control,
    formState: { errors },
  } = useForm<PersonalFormValues>({
    defaultValues: {
      fullName: "",
      email: "",
      dni: "",
      password: "",
      role: defaultAssignment.role,
      position: defaultAssignment.position,
      workerType: "full_time",
      storeIds: [],
    },
  });

  const selectedPosition = useWatch({ control, name: "position" });
  const selectedRole = useWatch({ control, name: "role" });
  const selectedStores = useWatch({ control, name: "storeIds" }) ?? [];

  useEffect(() => {
    setStaff(initialData.staff);
  }, [initialData.staff]);

  const allowedOptions = useMemo<RolePositionOption[]>(() => {
    if (dialog?.mode === "edit" && dialog.record.isSelf && dialog.record.role && dialog.record.position) {
      return [{ role: dialog.record.role, position: dialog.record.position }];
    }
    return initialData.createOptions;
  }, [dialog, initialData.createOptions]);

  const positionOptions = useMemo(() => uniquePositions(allowedOptions), [allowedOptions]);
  const roleOptions = useMemo(
    () => allowedOptions.filter((option) => option.position === selectedPosition).map((option) => option.role),
    [allowedOptions, selectedPosition],
  );

  useEffect(() => {
    if (roleOptions.length > 0 && !roleOptions.includes(selectedRole)) {
      setValue("role", roleOptions[0], { shouldValidate: true });
    }
  }, [roleOptions, selectedRole, setValue]);

  const filteredStaff = useMemo(() => {
    const term = search.trim().toLowerCase();

    return staff.filter((record) => {
      const workerLabel = record.workerType ? WORKER_TYPE_LABELS[record.workerType].toLowerCase() : "sin definir";
      const matchesSearch =
        !term ||
        record.fullName.toLowerCase().includes(term) ||
        record.email.toLowerCase().includes(term) ||
        record.dni.toLowerCase().includes(term) ||
        workerLabel.includes(term) ||
        record.stores.some((store) => `${store.code} ${store.name}`.toLowerCase().includes(term));

      const matchesRole = roleFilter === "all" || record.role === roleFilter;
      const matchesWorkerType =
        workerTypeFilter === "all" ||
        (workerTypeFilter === "undefined" ? record.workerType === null : record.workerType === workerTypeFilter);
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && record.active) ||
        (statusFilter === "inactive" && !record.active);

      return matchesSearch && matchesRole && matchesWorkerType && matchesStatus;
    });
  }, [roleFilter, search, staff, statusFilter, workerTypeFilter]);

  const activeCount = staff.filter((record) => record.active).length;
  const fullTimeCount = staff.filter((record) => record.workerType === "full_time").length;
  const partTimeCount = staff.filter((record) => record.workerType === "part_time").length;
  const undefinedWorkerTypeCount = staff.filter((record) => record.workerType === null).length;

  function openCreate() {
    const option = initialOption(initialData.createOptions);
    reset({
      fullName: "",
      email: "",
      dni: "",
      password: "",
      role: option.role,
      position: option.position,
      workerType: "full_time",
      storeIds: [],
    });
    setDialog({ mode: "create", record: null });
  }

  function openEdit(record: PersonalRecord) {
    if (!record.role || !record.position) return;
    reset({
      fullName: record.fullName,
      email: record.email,
      dni: /^\d{8}$/.test(record.dni) ? record.dni : "",
      password: "",
      role: record.role,
      position: record.position,
      workerType: record.workerType ?? (record.isSelf ? "" : "full_time"),
      storeIds: record.stores.map((store) => store.id),
    });
    setDialog({ mode: "edit", record });
  }

  function closeDialog() {
    if (!isPending) setDialog(null);
  }

  const submitForm = handleSubmit((values) => {
    const active = dialog?.mode === "edit" ? dialog.record.active : true;

    if (dialog?.mode === "create" && !values.workerType) {
      setError("workerType", { type: "manual", message: "Selecciona Full Time o Part Time" });
      return;
    }

    if (dialog?.mode === "edit" && !dialog.record.isSelf && !values.workerType) {
      setError("workerType", { type: "manual", message: "Selecciona Full Time o Part Time" });
      return;
    }

    if (values.role !== "superuser" && values.position !== "rh" && values.storeIds.length === 0) {
      setError("storeIds", { type: "manual", message: "Selecciona al menos una tienda" });
      return;
    }

    const editingSelf = dialog?.mode === "edit" && dialog.record.isSelf;
    const payload = {
      ...values,
      role: editingSelf && dialog.record.role ? dialog.record.role : values.role,
      position: editingSelf && dialog.record.position ? dialog.record.position : values.position,
      workerType: editingSelf ? dialog.record.workerType : values.workerType || null,
      storeIds: editingSelf ? dialog.record.stores.map((store) => store.id) : values.storeIds,
      active,
    };

    startTransition(async () => {
      const result =
        dialog?.mode === "edit"
          ? await updatePersonalAction({ ...payload, id: dialog.record.id })
          : await createPersonalAction(payload);

      if (!result.ok) {
        await Swal.fire({ title: "No se pudo guardar", text: result.message, icon: "error" });
        return;
      }

      setDialog(null);
      await Swal.fire({
        title: "Operación completada",
        text: result.message,
        icon: "success",
        timer: 1600,
        showConfirmButton: false,
      });
      router.refresh();
    });
  });

  async function toggleActive(record: PersonalRecord) {
    const confirmation = await Swal.fire({
      title: record.active ? "¿Desactivar personal?" : "¿Reactivar personal?",
      text: record.active
        ? `${record.fullName} dejará de tener acceso a los módulos protegidos.`
        : `${record.fullName} volverá a tener acceso según su rol y cargo.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: record.active ? "Sí, desactivar" : "Sí, reactivar",
      cancelButtonText: "Cancelar",
      reverseButtons: true,
    });

    if (!confirmation.isConfirmed) return;

    startTransition(async () => {
      const result = await togglePersonalActiveAction(record.id);
      if (!result.ok) {
        await Swal.fire({ title: "No se pudo cambiar el estado", text: result.message, icon: "error" });
        return;
      }

      await Swal.fire({
        title: "Estado actualizado",
        text: result.message,
        icon: "success",
        timer: 1400,
        showConfirmButton: false,
      });
      router.refresh();
    });
  }

  const storeRequired = selectedRole !== "superuser" && selectedPosition !== "rh";
  const editingSelf = dialog?.mode === "edit" && dialog.record.isSelf;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-blue-700">
            <Users className="h-4 w-4" />
            Gestión de personal
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">Personal</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            Administra cuentas, DNI, rol, cargo, tipo de trabajador, tiendas asignadas y estado de acceso.
          </p>
        </div>

        {initialData.canCreate && (
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            Nuevo personal
          </button>
        )}
      </header>

      {undefinedWorkerTypeCount > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Hay {undefinedWorkerTypeCount} trabajador{undefinedWorkerTypeCount === 1 ? "" : "es"} existente{undefinedWorkerTypeCount === 1 ? "" : "s"} sin tipo definido. Edítalos para indicar Full Time o Part Time.
        </div>
      )}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Total visible" value={staff.length} />
        <Metric label="Activos" value={activeCount} tone="green" />
        <Metric label="Full Time" value={fullTimeCount} tone="blue" />
        <Metric label="Part Time" value={partTimeCount} tone="violet" />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="grid gap-3 border-b border-slate-200 p-4 xl:grid-cols-[1fr_190px_180px_170px]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por nombre, correo, DNI, tienda o tipo..."
              className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-10 pr-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </label>

          <select
            value={roleFilter}
            onChange={(event) => setRoleFilter(event.target.value as "all" | AppRole)}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          >
            <option value="all">Todos los roles</option>
            <option value="superuser">SuperUser</option>
            <option value="admin">Administrador</option>
            <option value="store_manager">Gestor de tienda</option>
            <option value="viewer">Visualizador</option>
          </select>

          <select
            value={workerTypeFilter}
            onChange={(event) => setWorkerTypeFilter(event.target.value as "all" | "undefined" | WorkerType)}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          >
            <option value="all">Todos los tipos</option>
            <option value="full_time">Full Time</option>
            <option value="part_time">Part Time</option>
            <option value="undefined">Sin definir</option>
          </select>

          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as "all" | "active" | "inactive")}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          >
            <option value="all">Todos los estados</option>
            <option value="active">Activos</option>
            <option value="inactive">Inactivos</option>
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Personal</th>
                <th className="px-4 py-3">DNI</th>
                <th className="px-4 py-3">Rol / cargo</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Tiendas</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredStaff.map((record) => (
                <tr key={record.id} className="align-top hover:bg-slate-50/70">
                  <td className="px-4 py-4">
                    <div className="flex items-start gap-3">
                      <div className="rounded-xl bg-slate-100 p-2 text-slate-600">
                        <UserRound className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold text-slate-900">{record.fullName || "Sin nombre"}</p>
                          {record.isSelf && (
                            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">Tú</span>
                          )}
                        </div>
                        <p className="mt-1 max-w-64 truncate text-xs text-slate-500">{record.email || "Sin correo"}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4 font-mono text-xs text-slate-700">{record.dni || "—"}</td>
                  <td className="px-4 py-4">
                    {record.role && record.position ? (
                      <div>
                        <p className="font-medium text-slate-800">{ROLE_LABELS[record.role]}</p>
                        <p className="mt-1 text-xs text-slate-500">{POSITION_LABELS[record.position]}</p>
                      </div>
                    ) : (
                      <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">Sin configurar</span>
                    )}
                  </td>
                  <td className="px-4 py-4">
                    {record.workerType ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700">
                        <BriefcaseBusiness className="h-3.5 w-3.5" />
                        {WORKER_TYPE_LABELS[record.workerType]}
                      </span>
                    ) : (
                      <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">Sin definir</span>
                    )}
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex max-w-72 flex-wrap gap-1.5">
                      {record.stores.length > 0 ? (
                        record.stores.map((store) => (
                          <span key={store.id} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700">
                            <Store className="h-3 w-3" />
                            {store.code} · {store.name}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-slate-400">Sin tienda asignada</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${record.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                      {record.active ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Ban className="h-3.5 w-3.5" />}
                      {record.active ? "Activo" : "Inactivo"}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex justify-end gap-2">
                      {record.canEdit && record.role && record.position && (
                        <button
                          type="button"
                          onClick={() => openEdit(record)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                          Editar
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
                      {!record.canEdit && !record.canToggleActive && <span className="py-2 text-xs text-slate-400">Solo lectura</span>}
                    </div>
                  </td>
                </tr>
              ))}

              {filteredStaff.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center">
                    <UserRound className="mx-auto h-8 w-8 text-slate-300" />
                    <p className="mt-3 font-medium text-slate-700">No se encontró personal</p>
                    <p className="mt-1 text-xs text-slate-500">Modifica los filtros o el término de búsqueda.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {dialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 sm:p-6">
          <div className="max-h-[94vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-start justify-between border-b border-slate-200 bg-white px-5 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
                  {dialog.mode === "create" ? "Alta de personal" : "Edición de personal"}
                </p>
                <h2 className="mt-1 text-xl font-bold text-slate-950">
                  {dialog.mode === "create" ? "Nuevo personal" : dialog.record.fullName}
                </h2>
              </div>
              <button type="button" onClick={closeDialog} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Cerrar">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={submitForm} className="space-y-6 p-5">
              {editingSelf && (
                <div className="flex gap-3 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                  Puedes actualizar tus datos de acceso, pero no tu propio rol, cargo, tipo de trabajador, estado ni alcance de tiendas.
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Nombre completo" error={errors.fullName?.message} wide>
                  <input
                    {...register("fullName", {
                      required: "El nombre es obligatorio",
                      minLength: { value: 3, message: "Ingresa al menos 3 caracteres" },
                    })}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    placeholder="Nombres y apellidos"
                  />
                </Field>

                <Field label="Correo de acceso" error={errors.email?.message}>
                  <input type="email" {...register("email", { required: "El correo es obligatorio" })} className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" placeholder="usuario@empresa.com" />
                </Field>

                <Field label="DNI" error={errors.dni?.message}>
                  <input
                    inputMode="numeric"
                    maxLength={8}
                    {...register("dni", {
                      required: "El DNI es obligatorio",
                      pattern: { value: /^\d{8}$/, message: "El DNI debe tener 8 dígitos" },
                    })}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2.5 font-mono text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    placeholder="12345678"
                  />
                </Field>

                <Field label="Cargo">
                  <select {...register("position", { required: true })} disabled={editingSelf} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100 disabled:text-slate-500">
                    {positionOptions.map((position) => <option key={position} value={position}>{POSITION_LABELS[position]}</option>)}
                  </select>
                </Field>

                <Field label="Rol del sistema">
                  <select {...register("role", { required: true })} disabled={editingSelf} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100 disabled:text-slate-500">
                    {roleOptions.map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}
                  </select>
                </Field>

                <Field label="Tipo de trabajador" error={errors.workerType?.message} wide>
                  <select
                    {...register("workerType", { required: dialog.mode === "create" || !editingSelf ? "Selecciona Full Time o Part Time" : false })}
                    disabled={editingSelf}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100 disabled:text-slate-500"
                  >
                    {editingSelf && !dialog.record.workerType && <option value="">Sin definir</option>}
                    <option value="full_time">Full Time</option>
                    <option value="part_time">Part Time</option>
                  </select>
                  {dialog.mode === "edit" && !dialog.record.workerType && !editingSelf && (
                    <p className="mt-1 text-xs text-amber-700">Este registro existía antes de incorporar el tipo de trabajador. Debes definirlo al guardar.</p>
                  )}
                </Field>

                <Field label={dialog.mode === "create" ? "Contraseña temporal" : "Nueva contraseña"} error={errors.password?.message} wide>
                  <input
                    type="password"
                    autoComplete="new-password"
                    {...register("password", {
                      required: dialog.mode === "create" ? "La contraseña temporal es obligatoria" : false,
                      validate: (value) => !value || value.length >= 8 || "Usa al menos 8 caracteres",
                    })}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    placeholder={dialog.mode === "create" ? "Mínimo 8 caracteres" : "Déjala vacía para conservarla"}
                  />
                  <p className="mt-1 text-xs text-slate-500">La contraseña se envía directamente a Supabase Auth y nunca se guarda en nuestras tablas.</p>
                </Field>
              </div>

              <fieldset disabled={editingSelf} className="rounded-2xl border border-slate-200 p-4 disabled:opacity-60">
                <legend className="px-2 text-sm font-semibold text-slate-800">Tiendas asignadas</legend>
                <p className="mb-3 text-xs text-slate-500">
                  {storeRequired ? "Este cargo requiere al menos una tienda." : "La asignación de tiendas es opcional para este rol/cargo."}
                </p>

                {initialData.stores.length > 0 ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {initialData.stores.map((store) => (
                      <label key={store.id} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${selectedStores.includes(store.id) ? "border-blue-300 bg-blue-50" : "border-slate-200 hover:bg-slate-50"}`}>
                        <input type="checkbox" value={store.id} {...register("storeIds")} className="mt-1 h-4 w-4 rounded border-slate-300" />
                        <span>
                          <span className="block text-sm font-medium text-slate-800">{store.name}</span>
                          <span className="mt-0.5 block text-xs text-slate-500">{store.code}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
                    No hay tiendas activas disponibles dentro de tu alcance. Los cargos que requieren tienda no podrán crearse todavía.
                  </div>
                )}
                {errors.storeIds && <p className="mt-2 text-xs text-rose-600">{errors.storeIds.message}</p>}
              </fieldset>

              <div className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-4 sm:flex-row sm:justify-end">
                <button type="button" onClick={closeDialog} disabled={isPending} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                  Cancelar
                </button>
                <button type="submit" disabled={isPending} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60">
                  {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                  {dialog.mode === "create" ? "Crear personal" : "Guardar cambios"}
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

function Field({
  label,
  error,
  wide = false,
  children,
}: {
  label: string;
  error?: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={wide ? "sm:col-span-2" : undefined}>
      <span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span>
      {children}
      {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
    </label>
  );
}
