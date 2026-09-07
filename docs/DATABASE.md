# Modelo de datos inicial

## `profiles`

Extiende `auth.users`. Contiene nombre, rol, cargo y estado. No contiene DNI ni credenciales sensibles.

## `employee_identifiers`

Contiene el DNI asociado al colaborador. No se concede acceso directo a `anon` ni a `authenticated`; solo debe consultarse desde operaciones seguras de servidor. Esto reduce la exposición de identificadores personales y facilita aplicar medidas anti-enumeración en la marcación pública.

## `stores`

Tiendas o puntos de trabajo.

## `user_store_assignments`

Relaciona usuarios con las tiendas que forman su alcance operativo.

## `schedules`

Horario de un colaborador en una fecha y tienda determinada. Permite tolerancia en minutos y desactivación lógica.

## `attendance_records`

Estado consolidado de asistencia por colaborador y fecha: entrada, salida, estado y notas.

## `attendance_events`

Historial inmutable de eventos de asistencia. Conserva la trazabilidad de entradas, salidas y correcciones.

## `audit_logs`

Base para auditoría administrativa futura.

## Política de escritura

RLS habilita lectura por alcance, pero la migración no concede mutaciones operativas directas a clientes autenticados. Personal, tiendas, horarios y correcciones de marcación deben pasar por Server Actions/Route Handlers que:

1. validen sesión;
2. resuelvan rol, cargo y tiendas;
3. apliquen `src/lib/auth/require-permission.ts`;
4. usen la clave secreta únicamente en servidor;
5. escriban auditoría cuando corresponda.

La ruta pública tampoco obtiene acceso SQL anónimo.
