import { ModulePlaceholder } from "@/components/ui/module-placeholder";

export default function AttendanceAdminPage() {
  return (
    <ModulePlaceholder
      title="Marcaciones"
      description="Consulta de asistencia y correcciones controladas. Toda corrección deberá generar un evento histórico para auditoría."
      actions={["Consultar marcaciones", "Actualizar marcación", "Ver historial"]}
    />
  );
}
