# Contributing to Clinexa Platform

Thank you for contributing to the Clinexa Platform repository.

## Scope of this repository

This monorepo contains:

- `apps/api` — NestJS Backend API
- `apps/admin` — Next.js Internal Management (CRM / Admin / Doctor / Pharmacy)

Public Store, Patient Portal, and Mobile apps are **out of scope** for this repository.

## Branching strategy

```text
feature/* | bugfix/* | hotfix/* | release/*
                 ↓
                dev          ← integration / ongoing development
                 ↓
             staging         ← QA, release validation, pre-production
                 ↓
               main          ← production-ready; tags & releases
```

| Branch | Purpose |
| --- | --- |
| `main` | Production. Protected. Releases and version tags originate here. |
| `staging` | Pre-production. QA and deployment testing after validation on `dev`. |
| `dev` | Main integration branch. Feature work merges here first. |
| `feature/<name>` | New features |
| `bugfix/<name>` | Bug fixes |
| `hotfix/<name>` | Urgent production fixes |
| `release/<version>` | Release preparation |

## Workflow

1. Create a focused branch from `dev` (e.g. `feature/<name>`).
2. Keep changes small and reviewable.
3. Run `npm run lint`, `npm run typecheck`, and relevant tests locally.
4. Open a pull request into `dev`.
5. After validation on `dev`, promote to `staging`, then to `main`.
6. Do not implement multiple large features in one PR.
7. Do not commit feature work directly to `main` or `staging`.

## Coding standards

- Follow the product documentation in `docs/` as the source of truth for domain behavior.
- Keep clients thin: clinical and payment gates belong in `apps/api`.
- Prefer clarity and maintainability over cleverness.
- Do not commit secrets (`.env`, credentials, keys).

## Commit messages

Use concise, imperative subjects (e.g. `add health endpoint to api foundation`).
