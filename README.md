# Sistema de Marcación y Horarios

Aplicación web para gestión de personal, horarios y marcaciones de asistencia.

## Stack

- Next.js 16 + TypeScript + App Router
- Tailwind CSS 4
- Supabase: Auth + PostgreSQL + RLS
- Vercel: hosting y despliegue
- SweetAlert2: confirmaciones y alertas
- Lucide React: iconografía
- React Hook Form + Zod: formularios y validación

## Módulos iniciales

1. **Personal**: CRUD funcional de colaboradores, credenciales, rol, cargo, tiendas y estado.
2. **Horarios**: gestión de horarios por colaborador y tienda.
3. **Marcaciones**: consulta y corrección administrativa de asistencia.
4. **Marcación pública**: `/marcacion`, sin login; inicialmente solicita DNI. La estrategia final de validación se implementará después.

## Roles del sistema

- `superuser`: control total.
- `admin`: gestión dentro de su alcance.
- `store_manager`: rol técnico para supervisores con gestión de tienda.
- `viewer`: lectura y actualización limitada de marcaciones.

## Cargos

- `zonal`
- `supervisor`
- `visualizador`
- `promotor`
- `rh`

Cargo y rol son conceptos independientes. La autorización combina **rol + cargo + tiendas asignadas**.

## Desarrollo local

```bash
npm install
cp .env.example .env.local
npm run dev
```

Variables requeridas:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
```

`SUPABASE_SECRET_KEY` es exclusivamente de servidor. Nunca debe exponerse con prefijo `NEXT_PUBLIC_`.

## Supabase y SQL Editor

Los cambios de base de datos se administran mediante scripts SQL manuales en `supabase/sql/`.

Para configurar una base nueva:

1. abrir el proyecto en Supabase;
2. ir a **SQL Editor**;
3. ejecutar `supabase/sql/01_esquema_inicial.sql`;
4. ejecutar `supabase/sql/02_modulo_personal.sql`;
5. verificar tablas, funciones y políticas antes de continuar con scripts posteriores.

No se utilizará `supabase db push` ni se aplicarán migraciones automáticamente al proyecto remoto. Cada cambio posterior deberá agregarse como un nuevo archivo numerado, por ejemplo `03_...sql`, `04_...sql`, conservando el historial.

## Módulo de Personal

El CRUD de Personal está implementado en `/personal` e incluye:

- alta de usuarios en Supabase Auth;
- edición de nombre, correo y DNI;
- contraseña temporal y cambio opcional de contraseña;
- asignación controlada de rol y cargo;
- asignación de tiendas según alcance;
- activación y desactivación lógica;
- búsqueda y filtros;
- auditoría de operaciones;
- validación de jerarquía en servidor.

Consulta `docs/PERSONAL.md` para el detalle funcional y de seguridad.

## Vercel

Conecta este repositorio al proyecto de Vercel y registra las mismas variables de entorno para Preview y Production según corresponda.

## Seguridad

- Las páginas administrativas están protegidas por Supabase Auth.
- Los perfiles inactivos o sin rol/cargo no acceden a módulos protegidos.
- Las tablas usan Row Level Security.
- La ruta pública de marcación no tiene acceso directo anónimo a tablas.
- Las operaciones de Personal usan la clave secreta solo en servidor y validan rol, cargo y tiendas.
- La creación de usuarios privilegiados valida la jerarquía definida en `src/lib/auth/permissions.ts`.

Consulta `docs/AUTHORIZATION.md`, `docs/DATABASE.md` y `docs/PERSONAL.md` antes de ampliar los módulos.
