# @clinexa/api

NestJS Backend API for the Clinexa Platform.

## Quick start

From the repository root:

```bash
npm run dev:api
```

- Health (unversioned): `GET /health`
- Versioned API surface: `/v1/...` (domain routes land here)
- Swagger: `/api/docs`

Copy [`.env.example`](.env.example) to `.env` before starting. The API validates environment variables at boot and fails fast when required values are missing or invalid.

## Structure

```text
src/
├── bootstrap/
│   └── configure-app.ts  # shared HTTP setup (prod + e2e)
├── config/
│   ├── env.validation.ts   # Zod env schema (fail-fast at boot)
│   ├── app.config.ts       # registerAs('app') — port, CORS, prefix
│   ├── database.config.ts  # registerAs('database') — DATABASE_URL
│   ├── swagger.config.ts   # registerAs('swagger') — path + OpenAPI metadata
│   └── index.ts            # barrel: configurations + validateEnv
├── common/              # filters, interceptors, envelopes, decorators
├── health/
├── infrastructure/      # Prisma and other adapters
├── modules/             # domain modules (future features)
├── app.module.ts
└── main.ts
```

## HTTP adapter (Phase 3A)

Bootstrap applies shared configuration via `configureApp()` in [`src/bootstrap/configure-app.ts`](src/bootstrap/configure-app.ts) (also used by e2e):

- **ValidationPipe** — `whitelist`, `forbidNonWhitelisted`, `transform`, `transformOptions.enableImplicitConversion`
- **URI versioning** — Nest `VersioningType.URI`, default version `1` → `/v1`
- **Helmet** + disabled `X-Powered-By`
- **CORS** — allowlist from `CORS_ORIGINS`
- **Exception filter** — `{ code, message, details? }` (no stack traces in the body)
- **Response interceptor** — `{ data, meta }` (empty `meta` for now)

Health is version-neutral and skips the success envelope so probes receive the raw DTO.

`API_PREFIX` is an optional non-version path segment only. Do **not** set it to `v1`; versioning is Nest-managed.

Request correlation IDs (`correlationId` in envelopes / `X-Correlation-Id`) and structured logging (Pino) are deferred to a later infrastructure phase.

Prefer explicit `@Type()` from `class-transformer` on nested DTO properties when domain DTOs are introduced; `enableImplicitConversion` can coerce primitives unexpectedly.

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
