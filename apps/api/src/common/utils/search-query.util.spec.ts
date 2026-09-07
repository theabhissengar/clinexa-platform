import { buildUuidOrContainsOr, isUuid } from './search-query.util';

describe('search-query.util', () => {
  it('recognizes canonical UUIDs', () => {
    expect(isUuid('11111111-1111-4111-8111-111111111111')).toBe(true);
    expect(isUuid('not-a-uuid')).toBe(false);
    expect(isUuid(undefined)).toBe(false);
  });

  it('buildUuidOrContainsOr prepends id match for UUID queries', () => {
    const id = '22222222-2222-4222-8222-222222222222';
    const clauses = buildUuidOrContainsOr<Record<string, unknown>>(
      id,
      [(term) => ({ name: { contains: term, mode: 'insensitive' as const } })],
      (value) => ({ id: value }),
    );
    expect(clauses).toHaveLength(2);
    expect(clauses[0]).toEqual({ id });
  });
});
