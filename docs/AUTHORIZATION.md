# Autorización

La autorización del sistema no se basa únicamente en el rol. Se evalúan tres dimensiones:

1. **Rol**: permisos técnicos.
2. **Cargo**: posición organizacional.
3. **Alcance**: tiendas asignadas.

## Roles técnicos

| Rol | Personal | Tiendas | Horarios | Marcaciones |
| --- | --- | --- | --- | --- |
| `superuser` | CRUD global | CRUD global | CRUD global | CRUD global |
| `admin` | CRU | CRU | CRU | RU |
| `store_manager` | CRU | RU | CRU | RU |
| `viewer` | R | R | R | RU |

`D` se reserva inicialmente para `superuser`; para el resto se favorece desactivación lógica y auditoría.

## Cargos

- `zonal`
- `supervisor`
- `visualizador`
- `promotor`
- `rh`

## Jerarquía inicial de creación de personal

- `superuser`: puede crear cualquier combinación de rol/cargo.
- `RH` con rol `admin`:
  - Zonal → `admin`
  - Supervisor → `store_manager`
  - Promotor → `viewer`
- `Zonal` con rol `admin`:
  - Supervisor → `store_manager`
  - Promotor → `viewer`
- `Supervisor` con rol `store_manager`:
  - Promotor → `viewer`

Estas reglas están centralizadas en `src/lib/auth/permissions.ts` y deberán repetirse en la capa segura de servidor antes de usar la clave secreta de Supabase.

## Alcance por tienda

`user_store_assignments` define a qué tiendas puede acceder un usuario. Un rol administrativo no implica acceso global automáticamente.

Excepciones iniciales:

- `superuser`: alcance global.
- cargo `rh`: lectura global de personal y alcance administrativo especial.

## Decisión pendiente

La frase “Admin puede crear tiendas de las que tenga asignado” necesita un modelo territorial adicional para ser estrictamente verificable: una tienda nueva todavía no puede estar asignada. Hasta definir zonas/territorios, la migración restringe la creación directa de tiendas y la lógica final deberá pasar por una operación segura de servidor.

## Marcación pública

`/marcacion` es pública, pero no tiene permisos `anon` sobre tablas. El endpoint futuro de marcación deberá:

1. recibir DNI;
2. aplicar rate limit y anti-enumeración;
3. validar identidad según las reglas que definamos;
4. resolver trabajador, tienda y horario en servidor;
5. registrar evento y asistencia en una transacción/RPC;
6. devolver un mensaje que no exponga datos innecesarios.
