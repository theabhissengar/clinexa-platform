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
│   ├── app.config.ts       # registerAs('app') — port, CORS, prefix, logging
│   ├── database.config.ts  # registerAs('database') — DATABASE_URL
│   ├── swagger.config.ts   # registerAs('swagger') — path + OpenAPI metadata
│   └── index.ts            # barrel: configurations + validateEnv
├── common/              # filters, interceptors, middleware, envelopes
├── health/
├── infrastructure/      # Prisma and other adapters
├── modules/             # domain modules (future features)
├── app.module.ts
└── main.ts
```

## HTTP adapter

Bootstrap applies shared configuration via `configureApp()` in [`src/bootstrap/configure-app.ts`](src/bootstrap/configure-app.ts) (also used by e2e):

- **ValidationPipe** — `whitelist`, `forbidNonWhitelisted`, `transform`, `transformOptions.enableImplicitConversion`
- **URI versioning** — Nest `VersioningType.URI`, default version `1` → `/v1`
- **Helmet** + disabled `X-Powered-By`
- **CORS** — allowlist from `CORS_ORIGINS`
- **Correlation middleware** — `X-Correlation-Id` (see below)
- **Exception filter** — `{ code, message, correlationId, details? }` (no stack traces in the body)
- **Response interceptor** — `{ data, meta: { correlationId } }`
- **HTTP logging** — Nest `Logger` with a standard structured object (see below)

Health is version-neutral and skips the success envelope so probes receive the raw DTO. Health still receives `X-Correlation-Id`.

`API_PREFIX` is an optional non-version path segment only. Do **not** set it to `v1`; versioning is Nest-managed.

Prefer explicit `@Type()` from `class-transformer` on nested DTO properties when domain DTOs are introduced; `enableImplicitConversion` can coerce primitives unexpectedly.

### Correlation IDs (`X-Correlation-Id`)

- Clients may send `X-Correlation-Id`.
- Accepted values: printable ASCII (`0x20`–`0x7E`), max **128** characters.
- Missing, empty/whitespace-only, too long, or non-printable values are rejected; the server generates a new UUID.
- Valid client values are echoed unchanged on the response header, success `meta.correlationId`, and error `correlationId`.

`ApiResponseMeta` currently exposes only `correlationId` and is intentionally extensible for later fields (pagination, `requestId`, `executionTime`, etc.).

### Standard HTTP log object

Each logged HTTP request emits one Nest log (context `HTTP`) with:

| Field | Meaning |
| --- | --- |
| `type` | Always `'http'` |
| `method` | HTTP method |
| `url` | Request URL/path |
| `statusCode` | Response status |
| `durationMs` | Elapsed time |
| `correlationId` | Resolved correlation id |

Request/response bodies and sensitive headers are never included in this object.

- `LOG_LEVEL` — Nest levels: `error` \| `warn` \| `log` \| `debug` \| `verbose` (default `debug` in development, `log` otherwise)
- `LOG_HEALTH_REQUESTS` — when `false` (default), `/health` requests do not emit the HTTP log object; when `true`, they use the same shape as other routes

Pino and response compression are postponed until there is a concrete ops or payload-size need.

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
