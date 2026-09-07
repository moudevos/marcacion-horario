# Modelo de datos inicial

## `profiles`

Extiende `auth.users`. Contiene DNI, nombre, rol, cargo y estado. Los roles/cargos no se aceptan automáticamente desde metadata de registro para evitar escalamiento de privilegios.

## `stores`

Tiendas o puntos de trabajo.

## `user_store_assignments`

Relaciona usuarios con las tiendas que forman su alcance operativo.

## `schedules`

Horario de un colaborador en una fecha y tienda determinada. Permite tolerancia en minutos y desactivación lógica.

## `attendance_records`

Estado consolidado de asistencia por colaborador y fecha: entrada, salida, estado y notas.

## `attendance_events`

Historial inmutable de eventos de asistencia. Se utilizará para conservar la trazabilidad de entradas, salidas y correcciones.

## `audit_logs`

Base para auditoría administrativa futura.

## RLS

La migración habilita RLS desde el inicio. No se otorga acceso a `anon` para marcaciones. Las políticas iniciales permiten lectura y actualización según rol/cargo/tiendas, pero las operaciones sensibles de creación de usuarios y marcación pública deberán ejecutarse en servidor con validaciones explícitas.
