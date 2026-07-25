# Clinexa Platform

Backend API and Internal Management application for the Clinexa healthcare ecosystem.

This repository is an **npm workspaces monorepo**. It does **not** include the public website, patient portal, or mobile app (those are separate repositories).

## Project overview

Clinexa is a care-commerce platform. The Platform repository owns:

1. **Backend API** (`apps/api`) — NestJS modular monolith, Prisma, PostgreSQL, Swagger, Jest
2. **Internal Management** (`apps/admin`) — Next.js App Router CRM/Admin UI (role-based Admin, Doctor, Pharmacy sections later)

Product and architecture documentation lives in [`docs/`](./docs/) and is the source of truth for domain behavior.

## Repository structure

```text
clinexa-platform/
├── apps/
│   ├── api/                 # NestJS Backend
│   └── admin/               # Next.js Internal CRM/Admin
├── docker/                  # Dockerfiles + Compose (PostgreSQL)
├── docs/                    # Product + engineering documentation
├── infrastructure/          # IaC placeholder
├── scripts/                 # Operator scripts (placeholder)
├── .github/workflows/       # CI
├── package.json             # npm workspaces root
└── README.md
```

## Workspace architecture

- **npm workspaces** with a single root `package-lock.json`
- Runnable applications live only under `apps/`
- V1 apps: `api` + `admin` only
- Designed so `apps/worker` and `packages/*` can be added later without restructuring

## Applications

| App | Package name | Port | Role |
| --- | --- | --- | --- |
| API | `@clinexa/api` | `3001` | Domain authority, REST, Prisma, Swagger at `/api/docs` |
| Admin | `@clinexa/admin` | `3000` | Internal management SPA (foundation only) |

## Prerequisites

- Node.js **20.19+** (`.nvmrc` pins **22** LTS)
- npm **10+**
- Docker (for PostgreSQL)

## Installation

```bash
npm install
cp apps/api/.env.example apps/api/.env
cp apps/admin/.env.example apps/admin/.env.local
```

Prisma Client is generated via the API `postinstall` / `prisma:generate` script.

## Docker setup (PostgreSQL)

```bash
docker compose -f docker/docker-compose.yml up -d
```

Default connection string:

```text
postgresql://clinexa:clinexa@localhost:5432/clinexa?schema=public
```

## Development commands

```bash
# Start API + Admin together
npm run dev

# Start individually
npm run dev:api
npm run dev:admin
```

- API: http://localhost:3001  
- Health: http://localhost:3001/health  
- Swagger: http://localhost:3001/api/docs  
- Admin: http://localhost:3000  

## Build / quality commands

```bash
npm run build
npm run build:api
npm run build:admin

npm run lint
npm run lint:api
npm run lint:admin

npm run test
npm run test:api

npm run typecheck
npm run format
```

## Running the applications

1. Start PostgreSQL with Docker Compose.
2. Ensure `apps/api/.env` has a valid `DATABASE_URL`.
3. Run `npm run dev` from the repository root.
4. Confirm `/health` and the admin default page load.

## Future expansion strategy

Without restructuring this repo, we can later add:

- `apps/worker` — background jobs (renewals, notifications, reports)
- `packages/contracts` — shared API contracts
- `packages/core` — shared domain logic for api + worker
- Redis, object storage, and richer CI/CD under `docker/` / `infrastructure/`

Public Store, Patient Portal, and Mobile remain separate repositories consuming the Backend API.

## Foundation scope

This scaffold intentionally excludes authentication, RBAC, domain models, and business features. Those will be added feature-by-feature after foundation approval.
