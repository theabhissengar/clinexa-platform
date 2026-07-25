# Security Policy

## Reporting a vulnerability

If you discover a security issue in the Clinexa Platform, please report it privately to the maintainers. Do not open a public GitHub issue for vulnerabilities that expose patient data, credentials, or infrastructure access.

## Secure development expectations

- Never commit secrets, API keys, or production connection strings.
- Use `.env.example` files as templates only.
- Treat healthcare-related data as sensitive (HIPAA-aware patterns); this portfolio foundation does not claim formal certification.
- Prefer least-privilege access and server-side authorization for all privileged operations (to be implemented in the Auth/RBAC features).

## Dependencies

Keep dependencies up to date and review `npm audit` findings before releases.
