# AutoCC Backend

Backend NestJS + TypeORM para AutoCC.

## Requisitos

- Node `20.x`
- npm
- Base de datos según entorno:
  - desarrollo diario: MySQL
  - migraciones/produccion: Postgres (Neon)

## Convencion de archivos de entorno

- `.env.development` -> uso diario local (`npm run start:dev`)
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

Instalacion:

```bash
npm install
```

Desarrollo local (usa `.env.development`):

```bash
npm run start:dev
```

Build:

```bash
npm run build
```

Tests:

```bash
npm run test
npm run test:e2e
```

## Flujo de migraciones (correcto para produccion)

Los comandos `migration:*` usan `.env.migrations` automaticamente.

Ver estado:

```bash
npm run migration:show
```

Generar migracion desde cambios en entidades:

```bash
npm run migration:generate
```

Crear migracion vacia/manual:

```bash
npm run migration:create
```

Aplicar migraciones pendientes:

```bash
npm run migration:run
```

Revertir ultima migracion:

```bash
npm run migration:revert
```

## Practicas recomendadas

- Produccion: `DB_SYNCHRONIZE=false`
- Cambios de schema solo via migraciones versionadas
- Revisar SQL de cada migracion antes de commit
- En Render, usar `Release Command` con:
  - `npm run migration:run`
- No guardar secretos reales en el repo

## Deploy (resumen)

- Render: variables del panel (no archivo `.env`)
- Vercel: frontend con `VITE_API_URL=<render-url>/api`
- CORS backend: origenes exactos del frontend (sin `/api`)
