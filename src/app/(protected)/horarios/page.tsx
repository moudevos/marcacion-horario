import { ModulePlaceholder } from "@/components/ui/module-placeholder";

export default function SchedulesPage() {
  return (
    <ModulePlaceholder
      title="Horarios"
      description="Gestión de horarios por colaborador y tienda, limitada al alcance asignado al usuario autenticado."
      actions={["Crear horario", "Editar horario", "Consultar horario", "Desactivar horario"]}
    />
  );
}
