# Módulo de Personal

El módulo `/personal` administra las cuentas internas del sistema y su alcance operativo.

## Datos gestionados

- nombre completo;
- correo de acceso de Supabase Auth;
- DNI de 8 dígitos;
- rol del sistema;
- cargo organizacional;
- tiendas asignadas;
- estado activo/inactivo;
- contraseña temporal al crear y cambio opcional de contraseña al editar.

Las contraseñas nunca se guardan en tablas propias ni en `audit_logs`.

## Operaciones

### Crear

La cuenta se crea mediante `supabase.auth.admin.createUser()` exclusivamente desde servidor. Después se guarda perfil, DNI, tiendas y auditoría mediante la función SQL `save_personal_record`.

Si la operación de base de datos falla, el sistema intenta eliminar la cuenta de Auth recién creada para evitar usuarios incompletos.

### Leer

La lista visible depende de rol, cargo y tiendas del usuario autenticado:

- `superuser`: todo el personal;
- `rh`: todo el personal permitido por su jerarquía;
- `zonal`: usuarios que comparten sus tiendas;
- `supervisor`: usuarios que comparten sus tiendas;
- `viewer`: lectura del alcance compartido, sin acceso completo a DNI cuando no tiene permiso de edición.

### Actualizar

Se puede actualizar nombre, correo, DNI, contraseña, rol/cargo y tiendas cuando la jerarquía lo permita.

Un usuario que se edita a sí mismo no puede modificar su propio rol, cargo, estado ni alcance de tiendas. Esto evita autoescalamiento o bloqueo accidental.

### Desactivar / reactivar

No se realiza borrado físico. `profiles.active` controla el acceso a las rutas protegidas. El layout protegido rechaza perfiles inactivos o sin rol/cargo configurado.

El borrado físico no forma parte del flujo normal porque un colaborador puede tener horarios, marcaciones y auditoría histórica.

## Jerarquía aplicada

- `superuser`: administra cualquier combinación válida.
- `admin + rh`: crea/administra zonales, supervisores y promotores.
- `admin + zonal`: crea/administra supervisores y promotores.
- `store_manager + supervisor`: crea/administra promotores.
- `viewer`: no crea ni modifica personal.

Combinaciones normales de cargo y rol:

| Cargo | Rol |
| --- | --- |
| Zonal | `admin` |
| Supervisor | `store_manager` |
| Visualizador | `viewer` |
| Promotor | `viewer` |
| RH | `admin` |

`superuser` es una excepción de privilegio y puede asociarse a cualquier cargo.

## SQL requerido

Ejecutar en Supabase SQL Editor, en orden:

1. `supabase/sql/01_esquema_inicial.sql`
2. `supabase/sql/02_modulo_personal.sql`

El script 02 agrega índices y la función transaccional `save_personal_record`. La función solo concede ejecución al rol de servidor `service_role`; `anon` y `authenticated` no pueden invocarla directamente.

## Variables requeridas

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
SUPABASE_SECRET_KEY=...
```

`SUPABASE_SECRET_KEY` debe contener la clave secreta moderna de Supabase y solo estar disponible en el entorno del servidor/Vercel.

## Auditoría

Cada alta, actualización, desactivación, reactivación o reversión técnica escribe un registro en `audit_logs` con:

- usuario que ejecutó la operación;
- acción;
- usuario afectado;
- rol;
- cargo;
- estado;
- tiendas asignadas.

Correo, DNI y contraseña no se incluyen en el payload de auditoría del módulo.
