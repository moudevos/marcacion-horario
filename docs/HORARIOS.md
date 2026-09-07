# Módulo de Horarios

El módulo `/horarios` administra la planificación semanal por tienda.

## Estructura

- una fila por trabajador activo asignado a la tienda;
- siete columnas, de lunes a domingo;
- cada celda representa el horario de ese trabajador para una fecha;
- `Libre` se representa sin horario activo para ese día.

## Accesos rápidos

| Código | Turno | Ingreso | Salida | Almuerzo |
| --- | --- | --- | --- | --- |
| `A` | Apertura | 09:00 | 17:00 | 60 min |
| `C` | Cierre | 15:00 | 22:00 | 0 min preasignados |
| `AC` | Apertura / cierre | 09:00 | 22:00 | 120 min |
| `P` | Personalizado | editable | editable | editable |
| `L` | Libre | — | — | — |

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

Marcar `Libre` solo desactiva el horario activo perteneciente a la tienda que se está editando.

## Cambios sin guardar

Al cambiar de tienda o semana, si la matriz fue modificada, se muestra la confirmación reutilizable:

- `Cerrar sin guardar`;
- `Seguir editando`.

También aparece una barra inferior mientras haya cambios pendientes.

## SQL requerido

Ejecutar en Supabase SQL Editor, después de los scripts anteriores:

`supabase/sql/05_horarios_semanales.sql`

El script agrega a `schedules`:

- `shift_code`;
- `break_minutes`;
- índice de consulta semanal;
- función transaccional `save_weekly_schedule` disponible solo para `service_role`.
