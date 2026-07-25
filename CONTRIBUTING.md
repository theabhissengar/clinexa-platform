# Contributing to Clinexa Platform

Thank you for contributing to the Clinexa Platform repository.

## Scope of this repository

This monorepo contains:

- `apps/api` — NestJS Backend API
- `apps/admin` — Next.js Internal Management (CRM / Admin / Doctor / Pharmacy)

Public Store, Patient Portal, and Mobile apps are **out of scope** for this repository.

## Branching

- `develop` — integration branch
- `main` — production-ready releases
- `feature/<name>` — feature work
- `fix/<name>` / `hotfix/<name>` — fixes

## Workflow

1. Create a focused feature branch from `develop`.
2. Keep changes small and reviewable.
3. Run `npm run lint`, `npm run typecheck`, and relevant tests locally.
4. Open a pull request into `develop`.
5. Do not implement multiple large features in one PR.

## Coding standards

- Follow the product documentation in `docs/` as the source of truth for domain behavior.
- Keep clients thin: clinical and payment gates belong in `apps/api`.
- Prefer clarity and maintainability over cleverness.
- Do not commit secrets (`.env`, credentials, keys).

## Commit messages

Use concise, imperative subjects (e.g. `add health endpoint to api foundation`).
