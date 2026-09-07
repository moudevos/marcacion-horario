# Módulo de Tiendas

El módulo `/tiendas` administra los puntos de trabajo utilizados por Personal, Horarios y Marcaciones.

## Datos gestionados

- código único normalizado en mayúsculas;
- nombre de la tienda;
- dirección o referencia;
- estado activo/inactivo;
- conteo de personal asignado;
- conteo de horarios relacionados;
- conteo de marcaciones relacionadas.

## Permisos

- `superuser`: crear, leer, actualizar, desactivar/reactivar y eliminar físicamente cuando no existen dependencias;
- `admin + rh`: alcance global para crear y administrar tiendas;
- `admin + zonal`: crea tiendas y queda autoasignado a las nuevas tiendas para mantener su alcance;
- `store_manager + supervisor`: lectura y actualización únicamente de sus tiendas asignadas;
- `viewer`: solo lectura de sus tiendas asignadas.

## Eliminación

La operación normal es desactivar/reactivar. La eliminación física es exclusiva de `superuser` y el SQL la rechaza si la tienda tiene:

- personal asignado;
- horarios;
- registros o eventos de marcación.

Esto evita perder integridad histórica.

## Cambios sin guardar

Los modales detectan modificaciones mediante el estado `isDirty` de React Hook Form. Al intentar cerrar un modal modificado mediante la X, botón Cancelar o clic en el fondo, SweetAlert2 muestra dos opciones:

- `Cerrar sin guardar`;
- `Seguir editando`.

La utilidad común está en `src/lib/ui/confirm-unsaved.ts` para reutilizar el mismo comportamiento en otros módulos.

## SQL requerido

Ejecutar en Supabase SQL Editor, en orden:

1. `supabase/sql/01_esquema_inicial.sql`
2. `supabase/sql/02_modulo_personal.sql`
3. `supabase/sql/03_tipo_trabajador.sql`
4. `supabase/sql/04_modulo_tiendas.sql`

El script 04 agrega índices y las funciones `save_store_record` y `delete_store_record`, ejecutables únicamente desde el servidor.
