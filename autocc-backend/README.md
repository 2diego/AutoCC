# AutoCC Backend

Backend NestJS + TypeORM para AutoCC.

## Requisitos

- Node `20.x`
- pnpm (recomendado: `corepack enable` para respetar `packageManager` del monorepo)
- Base de datos según entorno:
  - desarrollo diario: MySQL
  - migraciones/produccion: Postgres (Neon)

## Convencion de archivos de entorno

- `.env.development` -> uso diario local (`pnpm run start:dev`)
- `.env.migrations` -> comandos `migration:*` (TypeORM CLI)
- `.env.example` -> guia
- `*.example` se versiona; `.env.*` reales no se versionan

Crear archivos locales desde los ejemplos:

```bash
cp .env.development.example .env.development
cp .env.migrations.example .env.migrations
```

En Windows PowerShell:

```powershell
Copy-Item .env.development.example .env.development
Copy-Item .env.migrations.example .env.migrations
```

## Comandos de uso diario

Instalacion (en el monorepo AutoCC, desde la raiz del repositorio):

```bash
pnpm install
```

Desarrollo local (usa `.env.development`):

```bash
pnpm run start:dev
```

Build:

```bash
pnpm run build
```

Tests:

```bash
pnpm run test
pnpm run test:e2e
```

## Flujo de migraciones (correcto para produccion)

Los comandos `migration:*` usan `.env.migrations` automaticamente.

Ver estado:

```bash
pnpm run migration:show
```

Generar migracion desde cambios en entidades:

```bash
pnpm run migration:generate
```

Crear migracion vacia/manual:

```bash
pnpm run migration:create
```

Aplicar migraciones pendientes:

```bash
pnpm run migration:run
```

Revertir ultima migracion:

```bash
pnpm run migration:revert
```

## Practicas recomendadas

- Produccion: `DB_SYNCHRONIZE=false`
- Cambios de schema solo via migraciones versionadas
- Revisar SQL de cada migracion antes de commit
- En Render, usar `Release Command` con:
  - `pnpm run migration:run`
- No guardar secretos reales en el repo

## Deploy (resumen)

- Render: variables del panel (no archivo `.env`)
- Vercel: frontend con `VITE_API_URL=<render-url>/api`
- CORS backend: origenes exactos del frontend (sin `/api`)
