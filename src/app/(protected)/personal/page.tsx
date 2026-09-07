import { ModulePlaceholder } from "@/components/ui/module-placeholder";

export default function PersonalPage() {
  return (
    <ModulePlaceholder
      title="Personal"
      description="CRUD de colaboradores, asignación de rol, cargo y tiendas. Las reglas jerárquicas ya están centralizadas en la capa de autorización."
      actions={["Crear personal", "Editar personal", "Consultar personal", "Desactivar personal"]}
    />
  );
}
