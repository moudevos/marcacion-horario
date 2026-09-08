# Motor de marcación pública

La ruta `/marcacion` implementa el flujo público de asistencia sin iniciar sesión.

## Flujo

1. el trabajador ingresa su DNI;
2. el servidor busca el identificador privado y valida que el perfil esté activo;
3. se obtiene el horario activo del día usando `America/Lima`;
4. se resuelve automáticamente la siguiente acción;
5. se crea una sesión efímera de dos minutos y un reto aleatorio de presencia;
6. el navegador solicita la cámara frontal y muestra la instrucción del reto;
7. el trabajador realiza la acción y captura una fotografía;
8. al confirmar, el navegador intenta adjuntar también la ubicación del dispositivo;
9. la fotografía se almacena en el bucket privado `attendance-evidence`;
10. PostgreSQL vuelve a validar la sesión, el horario y la secuencia antes de registrar la marcación.

## Secuencia diaria

Cuando `break_minutes > 0`:

`Ingreso -> Salida a almuerzo -> Retorno de almuerzo -> Salida final`

Cuando `break_minutes = 0`:

`Ingreso -> Salida final`

La siguiente acción no la decide el navegador. Siempre se recalcula en servidor y nuevamente dentro de la función transaccional `register_public_attendance_mark`.

El script 07 crea `attendance_mark_type` con `check_in`, `break_out`, `break_in` y `check_out`. El historial existente `attendance_events.event_type` se mantiene compatible: ingreso/salida usan sus tipos originales y los eventos de almuerzo se registran como `manual_adjustment` con el `mark_type` exacto dentro de `metadata`.

## Reto de presencia

Cada sesión recibe un reto distinto del utilizado en la marcación pública anterior del trabajador cuando es posible:

- girar la cabeza a la izquierda;
- girar la cabeza a la derecha;
- mostrar una mano abierta;
- mostrar dos dedos.

El reto y la fotografía sirven como evidencia auditable de presencia. La implementación no compara rostros, no genera embeddings faciales y no crea plantillas biométricas automáticas.

## Evidencia

Las imágenes se guardan mediante `service_role` en el bucket privado `attendance-evidence`.

El nombre del objeto no contiene DNI. Utiliza fecha, UUID del trabajador, tipo de evento y un UUID aleatorio.

`attendance_events.metadata` registra:

- tipo funcional exacto de marcación (`mark_type`);
- ruta privada de la evidencia;
- reto asignado;
- ubicación si el navegador la entrega;
- hash del user-agent;
- método de captura;
- indicador explícito `biometric_matching: false`.

No se concede acceso directo al bucket desde la página pública.

## Protección contra abuso

`/api/marcacion/iniciar` aplica un límite de 8 intentos por ventana de 10 minutos para una combinación hash de dispositivo/red + DNI.

El token de la sesión:

- se genera con 32 bytes aleatorios;
- solo se devuelve una vez al navegador;
- en PostgreSQL se almacena únicamente su SHA-256;
- expira en dos minutos;
- solo puede utilizarse una vez;
- queda ligado a un hash de la huella de solicitud para completar el flujo en el mismo dispositivo.

Los mensajes de búsqueda son deliberadamente genéricos para reducir enumeración de DNI.

## Estado de asistencia

En el ingreso, el motor compara la hora actual en `America/Lima` con `start_time + tolerance_minutes`:

- dentro de tolerancia: `present`;
- después de tolerancia: `late`.

Las marcas de almuerzo y salida actualizan el mismo `attendance_record` y además generan un `attendance_event` histórico.

## Integración con análisis

A partir del script 07, `attendance_records` almacena también `break_out` y `break_in`.

`/analisis-horario` utiliza el tiempo real de almuerzo cuando ambas marcas existen. Para datos históricos anteriores al motor usa `break_minutes` planificado como fallback.

## SQL requerido

Ejecutar manualmente en Supabase SQL Editor:

`supabase/sql/07_motor_marcacion_publica.sql`

Debe ejecutarse después de `06_ubicacion_tiendas.sql`.

El script:

- crea el enum independiente `attendance_mark_type`;
- agrega salida/retorno de almuerzo a `attendance_records`;
- crea sesiones efímeras públicas;
- crea almacenamiento de rate limit;
- crea el bucket privado de evidencia;
- crea `consume_attendance_rate_limit`;
- crea `register_public_attendance_mark`;
- mantiene todas estas operaciones fuera del acceso SQL directo de `anon` y `authenticated`.

## Pendientes de política operativa

Antes de producción debe definirse una política organizacional para retención y eliminación de fotografías de evidencia. También puede agregarse posteriormente una geocerca por tienda usando las coordenadas almacenadas en `stores`; el motor actual registra la ubicación como evidencia, pero no rechaza una marcación por distancia.
