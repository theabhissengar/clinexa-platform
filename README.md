# Clinexa Platform

Backend API and Internal Platform application for the Clinexa healthcare ecosystem.

This repository is an **npm workspaces monorepo**. It does **not** include the public website, patient portal, or mobile app (those are separate repositories).

## Project overview

Clinexa is a care-commerce platform. The Platform repository owns:

1. **Backend API** (`apps/api`) — NestJS modular monolith, Prisma, PostgreSQL, Swagger, Jest
2. **Internal Platform** (`apps/admin`) — Next.js App Router application hosting two contexts: **CRM** (`/crm/*`, operational lifecycle) and **Guardian** (`/guardian/*`, administrative lifecycle)

CRM and Guardian are contexts inside one authenticated application—one login, one shell, one design system. The Backend API is **application-agnostic**: its modules are platform modules that every client (Store, Patient Portal, CRM, Guardian, future apps) consumes and none of them owns.

Product and architecture documentation lives in [`docs/`](./docs/) and is the source of truth for domain behavior. Start with [05 — System architecture](./docs/05-system-architecture.md), [18 — CRM](./docs/18-crm.md), [25 — Guardian](./docs/25-guardian.md), and [26 — Implementation tracker](./docs/26-implementation-tracker.md).

## Repository structure

```text
clinexa-platform/
├── apps/
│   ├── api/                 # NestJS Backend
│   └── admin/               # Next.js Internal Platform (CRM + Guardian contexts)
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
| Admin | `@clinexa/admin` | `3000` | Internal Platform shell hosting the CRM and Guardian contexts (foundation only) |

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

## Branching strategy

```text
feature/* | bugfix/* | hotfix/* | release/*
                 ↓
                dev
                 ↓
             staging
                 ↓
               main
```

| Branch | Purpose |
| --- | --- |
| `main` | Production-ready code; releases and version tags |
| `staging` | Pre-production QA and deployment validation |
| `dev` | Integration branch for ongoing development |
| `feature/<name>` | Feature work (merges into `dev` first) |
| `bugfix/<name>` | Bug fixes |
| `hotfix/<name>` | Urgent production fixes |
| `release/<version>` | Release preparation |

Day-to-day coding happens on `feature/*` → `dev`. Promote to `staging`, then `main`, after validation.

## Future expansion strategy

Without restructuring this repo, we can later add:

- `apps/worker` — background jobs (renewals, notifications, reports)
- `packages/contracts` — shared API contracts
- `packages/core` — shared domain logic for api + worker
- Redis, object storage, and richer CI/CD under `docker/` / `infrastructure/`

Public Store, Patient Portal, and Mobile remain separate repositories consuming the Backend API. Additional future clients (Admin Mobile, Vendor Portal, Partner Portal, Public APIs) attach the same way: new permissions and registry entries, not a new backend.

## Foundation scope

This scaffold intentionally excludes authentication, RBAC, domain models, and business features. Those will be added feature-by-feature after foundation approval.
