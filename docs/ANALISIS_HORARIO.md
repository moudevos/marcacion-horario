# Módulo de Análisis de Horario

El módulo `/analisis-horario` compara la planificación semanal contra las marcaciones reales por tienda y trabajador.

## Acceso

El módulo está disponible para perfiles de gestión y visualización:

- SuperUser;
- RH;
- Zonal;
- Supervisor;
- Visualizador.

Promotor no recibe acceso al análisis. El alcance de tiendas sigue respetando las asignaciones del usuario, salvo los perfiles con alcance global.

## Métricas

Por cada día se calculan:

- horas planificadas efectivas;
- presencia marcada entre entrada y salida;
- horas efectivas marcadas;
- diferencia contra lo planificado;
- estado del día.

Las horas planificadas efectivas se calculan como:

`salida planificada - ingreso planificado - almuerzo planificado`

Las horas efectivas marcadas se calculan como:

`salida marcada - entrada marcada - almuerzo planificado`

La presencia marcada también se muestra sin descuento para que el cálculo sea auditable.

## Estados

- `Cumplido`: diferencia dentro de ±15 minutos;
- `Déficit`: faltan más de 15 minutos;
- `Exceso`: supera lo planificado por más de 15 minutos;
- `Sin marcación`: existe horario pero no hay entrada/salida;
- `Incompleta`: falta entrada o salida;
- `No planificado`: existen marcaciones en un día sin horario;
- `Descanso`: no existe horario ni marcaciones.

Una marcación incompleta no genera horas trabajadas estimadas.

## Resumen semanal

El encabezado muestra:

- total de horas planificadas;
- presencia marcada;
- horas efectivas;
- diferencia global;
- porcentaje de cumplimiento;
- incidencias por días sin marcación o con marcación incompleta.

La tabla semanal muestra además el detalle de cada trabajador y cada día.

## Base de datos

No requiere un script SQL adicional. Usa `schedules` y `attendance_records`, que ya cuentan con índices por tienda y fecha desde los scripts existentes.
