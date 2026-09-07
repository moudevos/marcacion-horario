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

1. **Personal**: gestión de colaboradores.
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
3. abrir `supabase/sql/01_esquema_inicial.sql` del repositorio;
4. copiar todo el contenido;
5. ejecutarlo una sola vez;
6. verificar las tablas y políticas creadas antes de continuar con el siguiente script.

No se utilizará `supabase db push` ni se aplicarán migraciones automáticamente al proyecto remoto. Cada cambio posterior deberá agregarse como un nuevo archivo numerado, por ejemplo `02_...sql`, `03_...sql`, conservando el historial.

## Vercel

Conecta este repositorio al proyecto de Vercel y registra las mismas variables de entorno para Preview y Production según corresponda.

## Seguridad

- Las páginas administrativas están protegidas por Supabase Auth.
- Las tablas usan Row Level Security.
- La ruta pública de marcación no tiene acceso directo anónimo a tablas.
- La creación de usuarios privilegiados deberá ejecutarse desde servidor y validar la jerarquía definida en `src/lib/auth/permissions.ts`.

Consulta `docs/AUTHORIZATION.md` y `docs/DATABASE.md` antes de implementar los CRUD.
