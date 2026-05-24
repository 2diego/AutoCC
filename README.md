Proyecto para automatizar el mantenimiento de cuenta corriente



Stack del proyecto AutoCC:
Capa	           Tecnología
Frontend	       React 19 + TypeScript + Vite + React Router
Backend	           NestJS 11 + TypeScript
Base de datos	   MySQL (mysql2) + PostgreSQL (pg) vía TypeORM
ORM	               TypeORM
Autenticación      JWT (@nestjs/jwt) + bcrypt
Validación	       class-validator + class-transformer
Testing	           Jest + Supertest
Deploy	           Vercel, Render, Neon
Excel	           ExcelJS

## Desarrollo (pnpm)

Monorepo con [pnpm workspaces](https://pnpm.io/workspaces). En la raiz del repo:

```bash
corepack enable
pnpm install
pnpm run start:dev
pnpm run dev
```

`start:dev` levanta el backend NestJS; `dev` el frontend Vite. Tambien puedes entrar en `autocc-backend` o `autocc-frontend` y ejecutar los mismos scripts con `pnpm`.