# @clinexa/admin

Next.js Internal Management application (CRM / Admin / Doctor / Pharmacy — role-based sections).

## Quick start

From the repository root:

```bash
npm run dev:admin
```

Open http://localhost:3000

Copy [`.env.example`](.env.example) to `.env.local` before starting. Public environment variables are validated when the config module loads; missing required values fail the build/dev process.

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- shadcn/ui
- TanStack Query
- React Hook Form + Zod
- Axios
- Lucide React
- next-themes

## Structure

```text
src/
├── app/
├── components/
├── config/
│   └── env.ts           # Zod-validated publicEnv (+ isDevelopment / isProduction)
├── features/
├── hooks/
├── lib/
├── providers/
├── services/
├── styles/
├── types/
└── utils/
```

## Configuration

- `src/config/env.ts` exports camelCase `publicEnv` (`apiBaseUrl`, `appName`) for `NEXT_PUBLIC_*` variables only.
- Also exports `isDevelopment` and `isProduction`.
- Future server-only secrets must live in a separate module (e.g. `server-env.ts`) with **no** `NEXT_PUBLIC_` prefix and must never be imported from Client Components.

This app is a thin client of `@clinexa/api`. No business features are implemented in the foundation.
