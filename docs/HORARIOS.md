# Módulo de Horarios

El módulo `/horarios` administra la planificación semanal por tienda y replica el formato operativo que se utiliza para compartir horarios en Excel.

## Estructura

- una fila por trabajador activo asignado a la tienda;
- siete columnas, de lunes a domingo;
- cada celda representa el horario de ese trabajador para una fecha;
- `D` representa descanso y se guarda sin horario activo para ese día.

## Modo seguro de edición

La matriz se abre siempre en modo consulta. En ese estado las celdas no contienen controles interactivos y un clic accidental no puede modificar el horario.

Para cambiar una semana se debe pulsar `Editar horario`. Mientras el modo edición está activo se habilitan los botones A/C/AC/P/D y los campos de horario personalizado.

- `Guardar semana` persiste los cambios y vuelve a modo consulta;
- `Cancelar edición` restaura la última versión guardada;
- si existen cambios pendientes, cancelar o cambiar de tienda/semana solicita confirmación antes de descartarlos.

## Accesos rápidos

| Código | Turno | Ingreso | Salida | Almuerzo | Horas efectivas |
| --- | --- | --- | --- | --- | --- |
| `A` | Apertura | 09:00 | 17:00 | 60 min | 7 h |
| `C` | Cierre | 15:00 | 22:00 | 0 min preasignados | 7 h |
| `AC` | Apertura / cierre | 09:00 | 22:00 | 120 min | 11 h |
| `P` | Personalizado | editable | editable | editable | calculadas |
| `D` | Descanso | — | — | — | 0 h |

El turno C no preasigna almuerzo porque no se definió una duración específica. Puede convertirse a `P` para personalizarlo.

## Permisos

La autorización usa rol + cargo + alcance de tiendas:

- `superuser`: consulta y modifica cualquier tienda;
- `admin`: crea y modifica semanas dentro de su alcance;
- `store_manager` / Supervisor: crea y modifica únicamente sus tiendas;
- `viewer`: consulta horarios, sin edición;
- RH mantiene alcance global según el modelo actual.

Toda escritura se valida nuevamente en servidor y se ejecuta con la clave secreta de Supabase.

## Guardado

`save_weekly_schedule` recibe la matriz semanal completa y la procesa dentro de una sola transacción PostgreSQL. Valida:

- tienda activa;
- trabajador activo y asignado a la tienda;
- fecha dentro de la semana seleccionada;
- tipo de turno permitido;
- salida posterior al ingreso;
- almuerzo entre 0 y 240 minutos;
- tolerancia entre 0 y 180 minutos;
- que no exista otro horario activo del trabajador en otra tienda para la misma fecha.

Marcar descanso solo desactiva el horario activo perteneciente a la tienda que se está editando.

## Copiar y exportar

Después de guardar la semana, el módulo muestra un bloque `Formato para envío` con dos acciones:

- `Copiar tabla`: copia al portapapeles la última versión guardada con tienda, código, DNI/CE, cargo, días, fechas y horarios; puede pegarse directamente en Excel o Google Sheets.
- `Exportar Excel`: genera un archivo `.xlsx` listo para compartir.

El Excel contiene tres bloques en una misma hoja:

1. horario detallado con rangos de hora y `D` en descansos;
2. equivalencia por códigos `A`, `C`, `AC`, `P` y `D`;
3. horas efectivas por trabajador y día, descontando los minutos de almuerzo.

El archivo incluye el número de semana ISO (`WKxx`), encabezado azul, columnas de DNI/CE y cargo, días/fechas, bordes, fila de Supervisor resaltada y nombre de archivo por tienda y semana.

La exportación usa la última versión persistida en Supabase para que el archivo enviado coincida con el horario oficial guardado.

## SQL requerido

Ejecutar en Supabase SQL Editor, después de los scripts anteriores:

`supabase/sql/05_horarios_semanales.sql`

El script agrega a `schedules`:

- `shift_code`;
- `break_minutes`;
- índice de consulta semanal;
- función transaccional `save_weekly_schedule` disponible solo para `service_role`.
