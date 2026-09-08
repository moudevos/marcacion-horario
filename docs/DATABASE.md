# Modelo de datos inicial

## Forma de aplicar cambios

La base de datos se administra con scripts SQL versionados dentro de `supabase/sql/` y ejecutados manualmente desde el **SQL Editor de Supabase**.

Reglas de trabajo:

1. cada cambio nuevo se agrega en un archivo SQL nuevo y numerado;
2. no se modifica un script que ya haya sido ejecutado en producción, salvo correcciones previas a su primera ejecución;
3. los scripts se ejecutan en orden;
4. antes de ejecutar un script se revisa su impacto en tablas, datos y políticas RLS;
5. no utilizaremos `supabase db push` para aplicar cambios automáticamente al proyecto remoto.

Los scripts actuales son:

1. `supabase/sql/01_esquema_inicial.sql`;
2. `supabase/sql/02_modulo_personal.sql`;
3. `supabase/sql/03_tipo_trabajador.sql`;
4. `supabase/sql/04_modulo_tiendas.sql`;
5. `supabase/sql/05_horarios_semanales.sql`;
6. `supabase/sql/06_ubicacion_tiendas.sql`;
7. `supabase/sql/07_motor_marcacion_publica.sql`.

## `profiles`

Extiende `auth.users`. Contiene nombre, rol, cargo, tipo de trabajador y estado. No contiene DNI ni credenciales sensibles.

`worker_type` usa el enum `public.worker_type` con los valores `full_time` y `part_time`. Puede ser `NULL` únicamente para registros existentes pendientes de clasificación; las nuevas altas del módulo de Personal exigen un tipo definido.

## `employee_identifiers`

Contiene el DNI asociado al colaborador. No se concede acceso directo a `anon` ni a `authenticated`; solo debe consultarse desde operaciones seguras de servidor. Esto reduce la exposición de identificadores personales y facilita aplicar medidas anti-enumeración en la marcación pública.

## `stores`

Tiendas o puntos de trabajo. Además de código, nombre, dirección y estado, puede almacenar una ubicación geográfica WGS84 mediante `latitude` y `longitude`.

Las coordenadas son opcionales para mantener compatibilidad con tiendas existentes, pero si se registra una debe registrarse también la otra. PostgreSQL valida latitud entre -90 y 90 y longitud entre -180 y 180.

El CRUD permite escribir las coordenadas manualmente o seleccionar el punto en un mapa OpenStreetMap. Esta ubicación queda disponible para una futura validación de marcaciones por proximidad/geocerca; por ahora el motor público registra la posición del dispositivo como evidencia cuando está disponible, pero no rechaza por distancia.

## `user_store_assignments`

Relaciona usuarios con las tiendas que forman su alcance operativo.

## `schedules`

Horario de un colaborador en una fecha y tienda determinada. Permite tolerancia en minutos y desactivación lógica. Desde el script 05 también almacena código de turno y minutos de almuerzo.

## `attendance_records`

Estado consolidado de asistencia por colaborador y fecha. Desde el script 07 contiene:

- `check_in`: ingreso;
- `break_out`: salida a almuerzo;
- `break_in`: retorno de almuerzo;
- `check_out`: salida final;
- estado y notas.

La secuencia temporal se valida con una restricción PostgreSQL.

## `attendance_events`

Historial de eventos de asistencia. Conserva la trazabilidad de ingreso, salida/retorno de almuerzo, salida final y correcciones. Las marcaciones públicas guardan en `metadata` la ruta privada de evidencia, reto de presencia y ubicación disponible.

## `attendance_marking_sessions`

Sesiones efímeras utilizadas por `/marcacion`. Cada sesión contiene únicamente el hash del token, trabajador, tienda, horario, fecha, evento esperado, reto aleatorio, expiración y estado de uso.

No tiene permisos directos para `anon` ni `authenticated`. La sesión expira a los dos minutos y se consume una sola vez.

## `attendance_public_rate_limits`

Control interno de intentos de la página pública. Las claves son hashes y no se expone la tabla al cliente.

## Storage `attendance-evidence`

Bucket privado creado por el script 07 para fotografías de evidencia de marcación. La aplicación no almacena el DNI en la ruta del objeto ni concede acceso directo desde la página pública.

No se implementa comparación facial ni generación de plantillas biométricas automáticas.

## `audit_logs`

Base para auditoría administrativa.

## Política de escritura

RLS habilita lectura por alcance, pero el esquema no concede mutaciones operativas directas a clientes autenticados. Personal, tiendas, horarios y correcciones de marcación deben pasar por Server Actions/Route Handlers que:

1. validen sesión;
2. resuelvan rol, cargo y tiendas;
3. apliquen `src/lib/auth/require-permission.ts`;
4. usen la clave secreta únicamente en servidor;
5. escriban auditoría cuando corresponda.

La ruta pública tampoco obtiene acceso SQL anónimo. La búsqueda de DNI, creación de sesiones, subida de evidencia y registro de eventos se realizan desde rutas de servidor y funciones accesibles únicamente con privilegios de servidor.
