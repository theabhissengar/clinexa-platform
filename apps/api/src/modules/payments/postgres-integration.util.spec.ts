import { shouldRunPostgresIntegration } from './postgres-integration.util';

describe('shouldRunPostgresIntegration', () => {
  const localUrl = 'postgresql://clinexa:clinexa@127.0.0.1:5432/clinexa';

  it('runs locally when DATABASE_URL is set and CI is unset', () => {
    expect(
      shouldRunPostgresIntegration({
        DATABASE_URL: localUrl,
      }),
    ).toBe(true);
  });

  it('skips in CI even when a placeholder DATABASE_URL is present', () => {
    expect(
      shouldRunPostgresIntegration({
        CI: 'true',
        DATABASE_URL:
          'postgresql://clinexa:clinexa@127.0.0.1:5432/clinexa_ci?schema=public',
      }),
    ).toBe(false);
  });

  it('runs in CI only when RUN_POSTGRES_INTEGRATION is opted in', () => {
    expect(
      shouldRunPostgresIntegration({
        CI: 'true',
        DATABASE_URL: localUrl,
        RUN_POSTGRES_INTEGRATION: '1',
      }),
    ).toBe(true);
  });

  it('skips when DATABASE_URL is missing', () => {
    expect(shouldRunPostgresIntegration({})).toBe(false);
  });
});
