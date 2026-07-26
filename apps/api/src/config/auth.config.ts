import { registerAs } from '@nestjs/config';

/**
 * Parses duration strings like `15m`, `12h`, `900s` into seconds.
 */
export function parseDurationToSeconds(raw: string): number {
  const match = /^(\d+)(s|m|h)$/i.exec(raw.trim());
  if (!match) {
    throw new Error(
      `Invalid duration "${raw}". Use formats like 15m, 12h, or 900s.`,
    );
  }

  const amount = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();

  switch (unit) {
    case 's':
      return amount;
    case 'm':
      return amount * 60;
    case 'h':
      return amount * 3600;
    default:
      throw new Error(`Unsupported duration unit in "${raw}"`);
  }
}

function parseBooleanFlag(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined || raw === '') {
    return fallback;
  }
  return raw === 'true' || raw === '1';
}

export default registerAs('auth', () => {
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  const accessTtlRaw = process.env.JWT_ACCESS_TTL ?? '15m';

  return {
    jwtAccessSecret: process.env.JWT_ACCESS_SECRET as string,
    jwtRefreshSecret: process.env.JWT_REFRESH_SECRET as string,
    jwtAccessTtlSeconds: parseDurationToSeconds(accessTtlRaw),
    idleTimeoutMinutes: parseInt(
      process.env.AUTH_IDLE_TIMEOUT_MINUTES ?? '30',
      10,
    ),
    absoluteTimeoutHours: parseInt(
      process.env.AUTH_ABSOLUTE_TIMEOUT_HOURS ?? '12',
      10,
    ),
    refreshCookieName:
      process.env.AUTH_REFRESH_COOKIE_NAME ?? 'clinexa_refresh',
    cookieSecure: parseBooleanFlag(
      process.env.AUTH_COOKIE_SECURE,
      nodeEnv === 'production',
    ),
    cookieSameSite: 'lax' as const,
    cookiePath: '/v1/auth',
    argon2: {
      memoryCost: parseInt(process.env.ARGON2_MEMORY_COST ?? '65536', 10),
      timeCost: parseInt(process.env.ARGON2_TIME_COST ?? '3', 10),
      parallelism: parseInt(process.env.ARGON2_PARALLELISM ?? '4', 10),
    },
  };
});
