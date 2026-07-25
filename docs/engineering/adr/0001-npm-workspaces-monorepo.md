# ADR 0001 — npm workspaces monorepo

| Field | Value |
| --- | --- |
| Status | Accepted |
| Date | 2026-07-25 |

## Decision

Use a single npm workspaces monorepo with `apps/api` (NestJS) and `apps/admin` (Next.js). Defer `packages/*` and `apps/worker` until needed.

## Consequences

- One lockfile and coordinated CI
- Additive expansion path for worker/shared packages
- No Turborepo/pnpm required for V1
