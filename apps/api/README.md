# @clinexa/api

NestJS Backend API for the Clinexa Platform.

## Quick start

From the repository root:

```bash
npm run dev:api
```

- Health: `GET /health`
- Swagger: `/api/docs`

## Structure

```text
src/
├── config/
├── common/              # cross-cutting API utilities (future)
├── health/
├── infrastructure/      # Prisma and other adapters
├── modules/             # domain modules (future features)
├── app.module.ts
└── main.ts
```

## Prisma

```bash
npm run prisma:generate -w @clinexa/api
```

Domain models are intentionally empty in the foundation.
