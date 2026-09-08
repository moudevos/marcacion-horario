# Motor de marcación

La ruta pública `/marcacion` registra asistencia sin iniciar sesión y el módulo protegido `/marcaciones` permite supervisión operativa, enrolamiento de dispositivos y excepciones administrativas.

## Validaciones de una marcación pública

La confirmación final exige, en este orden lógico:

1. DNI válido y trabajador activo;
2. fecha de trabajo en `America/Lima`;
3. horario activo del trabajador para la tienda;
4. secuencia correcta de evento (`Ingreso`, `Salida a almuerzo`, `Retorno de almuerzo`, `Salida final`);
5. Passkey WebAuthn válida con `userVerification: required`;
6. firma de vida interactiva aleatoria;
7. ubicación GPS dentro de la geocerca de la tienda;
8. nueva validación transaccional en PostgreSQL justo antes de escribir la asistencia.

## Passkeys y biometría local

El sistema no almacena huellas, rostros, embeddings ni plantillas biométricas en Supabase.

WebAuthn permite que el autenticador local del dispositivo solicite Face ID, huella, Windows Hello o PIN. Esa verificación sucede dentro del sistema operativo/autenticador. El servidor recibe una prueba criptográfica firmada y conserva únicamente:

- identificador de credencial;
- clave pública;
- contador;
- transportes;
- tipo de dispositivo y estado de respaldo cuando el autenticador los reporta.

La autenticación usa `userVerification: required` y `requireUserVerification: true`.

## Primer enrolamiento

Conocer un DNI no permite registrar una nueva Passkey.

El flujo es:

1. Supervisor/Admin abre `/marcaciones`;
2. genera un código de enrolamiento de 8 dígitos para el trabajador;
3. el código dura 10 minutos y sustituye cualquier código anterior pendiente del mismo trabajador;
4. el trabajador abre `/marcacion` desde su propio dispositivo;
5. ingresa DNI + código temporal;
6. el navegador crea la Passkey usando el autenticador local;
7. el servidor verifica la ceremonia WebAuthn y guarda solo la credencial pública;
8. el código queda consumido y no puede reutilizarse.

## Secuencia diaria

Cuando `break_minutes > 0`:

`Ingreso -> Salida a almuerzo -> Retorno de almuerzo -> Salida final`

Cuando `break_minutes = 0`:

`Ingreso -> Salida final`

La siguiente acción nunca se decide únicamente en el navegador. Se vuelve a resolver en PostgreSQL antes de escribir.

## Firma de vida interactiva

Cada sesión utiliza una acción diferente a la anterior cuando es posible:

- mantener presionado durante aproximadamente 2 segundos;
- pulsar tres veces;
- escribir un código aleatorio de tres dígitos.

Esta prueba demuestra interacción activa con la sesión. No realiza análisis facial ni debe describirse como detección biométrica de vida.

## Geocerca

Las tiendas usan `latitude`, `longitude` y `attendance_radius_meters`.

El script 08 establece inicialmente un radio de 100 metros, con validación de base de datos entre 20 y 1000 metros.

Al confirmar:

1. el navegador solicita ubicación precisa;
2. PostgreSQL calcula distancia mediante fórmula Haversine;
3. si la distancia supera el radio configurado, la marcación pública no se registra;
4. la distancia calculada queda en metadata del evento si la marcación es válida.

Una falla de GPS/geocerca no marca automáticamente al trabajador como ausente. Un Supervisor/Admin puede resolver la excepción desde `/marcaciones` mediante una marcación administrativa con motivo obligatorio.

## Protección contra abuso

`/api/marcacion/iniciar` aplica rate limit a los intentos de DNI.

Las sesiones públicas:

- usan tokens aleatorios;
- almacenan solo el SHA-256 del token;
- duran pocos minutos;
- se consumen una sola vez;
- quedan ligadas a la huella técnica de la solicitud;
- mantienen el challenge WebAuthn y los estados de validación únicamente en servidor.

Las respuestas con tokens/challenges usan `Cache-Control: no-store`.

## Dashboard `/marcaciones`

El dashboard muestra el personal programado del día dentro del alcance del usuario:

- tienda y horario;
- ingreso;
- salida/retorno de almuerzo;
- salida final;
- estado de asistencia;
- siguiente evento esperado;
- cantidad de Passkeys activas.

Perfiles de gestión pueden:

- generar código temporal de enrolamiento;
- registrar la siguiente marcación de forma administrativa.

La marcación administrativa exige motivo de al menos 5 caracteres, genera `attendance_event` con `source = admin` y agrega un registro a `audit_logs`.

## Fotografías históricas

El script 07 creó el bucket privado `attendance-evidence`. A partir del modelo del script 08, el flujo nuevo no sube fotografías y no utiliza ese bucket.

No se elimina automáticamente el bucket en el script 08 para evitar destruir evidencias históricas que pudieran existir. Su eliminación/retención puede definirse posteriormente como una política de datos.

## SQL requerido

Ejecutar manualmente, en orden:

- `supabase/sql/07_motor_marcacion_publica.sql`;
- `supabase/sql/08_passkeys_geocerca_y_marcacion_dashboard.sql`.

El script 08 agrega:

- `stores.attendance_radius_meters`;
- `employee_passkeys`;
- `passkey_enrollment_tokens`;
- estado WebAuthn/geocerca/firma de vida en `attendance_marking_sessions`;
- `register_public_attendance_mark_v2`;
- `register_admin_attendance_mark`.
