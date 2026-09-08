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
7. `supabase/sql/07_motor_marcacion_publica.sql`;
8. `supabase/sql/08_passkeys_geocerca_y_marcacion_dashboard.sql`.

## `profiles`

Extiende `auth.users`. Contiene nombre, rol, cargo, tipo de trabajador y estado. No contiene DNI ni credenciales sensibles.

`worker_type` usa el enum `public.worker_type` con los valores `full_time` y `part_time`. Puede ser `NULL` únicamente para registros existentes pendientes de clasificación; las nuevas altas del módulo de Personal exigen un tipo definido.

## `employee_identifiers`

Contiene el DNI asociado al colaborador. No se concede acceso directo a `anon` ni a `authenticated`; solo debe consultarse desde operaciones seguras de servidor. Esto reduce la exposición de identificadores personales y facilita aplicar medidas anti-enumeración en la marcación pública.

## `stores`

Tiendas o puntos de trabajo. Además de código, nombre, dirección y estado, almacena opcionalmente ubicación WGS84 mediante `latitude` y `longitude`.

Las coordenadas deben existir como pareja. PostgreSQL valida latitud entre -90 y 90 y longitud entre -180 y 180.

Desde el script 08 existe `attendance_radius_meters`, inicialmente 100 m y validado entre 20 y 1000 m. La marcación pública exige que la tienda tenga coordenadas y rechaza el autoservicio cuando el GPS del dispositivo está fuera de este radio.

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

## `attendance_events`

Historial de eventos de asistencia. Conserva ingreso, salida/retorno de almuerzo, salida final y correcciones.

A partir del script 08 las nuevas marcaciones públicas ya no almacenan fotografías. La metadata conserva información de trazabilidad como tipo de marca, credencial pública utilizada, reto interactivo, distancia calculada y radio de tienda.

## `attendance_marking_sessions`

Sesiones efímeras utilizadas por `/marcacion`. Contienen hash del token, trabajador, tienda, horario, fecha, evento esperado, reto, expiración y estado de uso.

El script 08 agrega challenge WebAuthn y estados de validación de Passkey, firma de vida interactiva y geocerca. Al aplicar el script se invalidan las sesiones efímeras del motor 07 para evitar mezclar ambos protocolos.

No se concede acceso directo a `anon` ni `authenticated`.

## `employee_passkeys`

Credenciales WebAuthn asociadas al trabajador. Almacena únicamente material criptográfico y metadatos necesarios para verificar una Passkey:

- `credential_id`;
- clave pública;
- contador;
- transportes;
- tipo de dispositivo y estado de respaldo cuando están disponibles;
- última utilización y revocación.

No almacena huella, rostro, fotografía, embedding ni plantilla biométrica. La verificación local puede ser realizada por Face ID, huella, Windows Hello o PIN según el autenticador del dispositivo.

## `passkey_enrollment_tokens`

Autorizaciones temporales para registrar una nueva Passkey. El Supervisor/Admin genera un código desde `/marcaciones`; la base almacena solo su hash, challenge de registro, expiración y uso.

## `attendance_public_rate_limits`

Control interno de intentos de la página pública. Las claves son hashes y no se exponen al cliente.

## Storage `attendance-evidence`

El script 07 creó un bucket privado para el primer diseño con fotografías. El motor del script 08 ya no escribe nuevas imágenes en este bucket.

El bucket no se elimina automáticamente para no destruir posibles evidencias históricas generadas antes de la migración.

## Marcación administrativa

El script 08 agrega `register_admin_attendance_mark`. Se utiliza desde `/marcaciones` cuando un perfil autorizado necesita resolver una excepción operativa.

La acción exige motivo, respeta alcance de tienda en la capa de servidor y crea tanto un `attendance_event` con origen administrativo como un registro de auditoría.

## `audit_logs`

Base de auditoría administrativa.

## Política de escritura

RLS habilita lectura por alcance, pero el esquema no concede mutaciones operativas directas a clientes. Personal, tiendas, horarios y marcaciones pasan por Server Actions/Route Handlers que:

1. validan sesión cuando la operación es administrativa;
2. resuelven rol, cargo y tiendas;
3. aplican autorización de servidor;
4. usan la clave secreta únicamente en servidor;
5. escriben auditoría cuando corresponde.

La ruta pública tampoco obtiene acceso SQL anónimo. El motor público valida DNI, fecha/horario, Passkey, firma interactiva y geocerca antes de confirmar transaccionalmente la asistencia.
