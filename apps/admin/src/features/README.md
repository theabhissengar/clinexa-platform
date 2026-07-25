# Feature modules

Each domain feature (orders, clinical-review, pharmacy, catalog, etc.) will live here.

Suggested layout when implementing a feature:

```text
features/<feature-name>/
  components/
  hooks/
  api/
  types/
  index.ts
```

This application is a thin client of `apps/api`. Do not embed clinical or payment business rules here.
