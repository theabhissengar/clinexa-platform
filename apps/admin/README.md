# @clinexa/admin

Next.js Internal Management application (CRM / Admin / Doctor / Pharmacy — role-based sections).

## Quick start

From the repository root:

```bash
npm run dev:admin
```

Open http://localhost:3000

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
├── features/
├── hooks/
├── lib/
├── providers/
├── services/
├── styles/
├── types/
└── utils/
```

This app is a thin client of `@clinexa/api`. No business features are implemented in the foundation.
