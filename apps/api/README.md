# @clinexa/api

NestJS Backend API for the Clinexa Platform.

## Quick start

From the repository root:

```bash
npm run dev:api
```

- Health: `GET /health`
- Swagger: `/api/docs`

Copy [`.env.example`](.env.example) to `.env` before starting. The API validates environment variables at boot and fails fast when required values are missing or invalid.

## Structure

```text
src/
├── config/
│   ├── env.validation.ts   # Zod env schema (fail-fast at boot)
│   ├── app.config.ts       # registerAs('app') — port, CORS, prefix
│   ├── database.config.ts  # registerAs('database') — DATABASE_URL
│   ├── swagger.config.ts   # registerAs('swagger') — path + OpenAPI metadata
│   └── index.ts            # barrel: configurations + validateEnv
├── common/              # cross-cutting API utilities (future)
├── health/
├── infrastructure/      # Prisma and other adapters
├── modules/             # domain modules (future features)
├── app.module.ts
└── main.ts
```

## Configuration

- Global `ConfigModule` loads namespaced `registerAs` factories from `src/config`.
- `validateEnv` (Zod) runs before the app starts (NFR-125).
- Application code reads config via `ConfigService.getOrThrow(...)` — not `process.env`.
- Exception: `prisma.config.ts` (Prisma CLI only) may read `process.env.DATABASE_URL`.

Optional: set `SWAGGER_VERSION` in CI/CD to override the OpenAPI document version without code changes.

## Prisma

```bash
npm run prisma:generate -w @clinexa/api
```

Domain models are intentionally empty in the foundation.
