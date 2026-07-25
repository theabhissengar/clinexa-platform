import { registerAs } from '@nestjs/config';

/**
 * Parses CORS_ORIGINS: split, trim, drop empties/duplicates, keep well-formed origins only.
 */
export function parseCorsOrigins(raw: string): string[] {
  const seen = new Set<string>();
  const origins: string[] = [];

  for (const part of raw.split(',')) {
    const candidate = part.trim();
    if (!candidate || seen.has(candidate)) {
      continue;
    }

    let url: URL;
    try {
      url = new URL(candidate);
    } catch {
      continue;
    }

    // Origin must be scheme + host [+ port] only (no path, query, or hash)
    const isOriginOnly =
      (url.pathname === '' || url.pathname === '/') &&
      url.search === '' &&
      url.hash === '' &&
      Boolean(url.protocol) &&
      Boolean(url.host);

    if (!isOriginOnly) {
      continue;
    }

    seen.add(candidate);
    origins.push(candidate);
  }

  return origins;
}

export default registerAs('app', () => {
  const corsOrigins = parseCorsOrigins(
    process.env.CORS_ORIGINS ?? 'http://localhost:3000',
  );

  if (corsOrigins.length === 0) {
    throw new Error(
      'CORS_ORIGINS must contain at least one well-formed origin (e.g. http://localhost:3000)',
    );
  }

  return {
    nodeEnv: process.env.NODE_ENV ?? 'development',
    port: parseInt(process.env.PORT ?? '3001', 10),
    apiPrefix: (process.env.API_PREFIX ?? '').replace(/^\/+|\/+$/g, ''),
    corsOrigins,
  };
});
