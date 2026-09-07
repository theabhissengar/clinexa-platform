const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string | undefined | null): boolean {
  if (!value?.trim()) {
    return false;
  }
  return UUID_RE.test(value.trim());
}

/**
 * Build Prisma OR clauses: exact id match when q is a UUID, plus contains
 * matches on the supplied field builders.
 */
export function buildUuidOrContainsOr<T extends Record<string, unknown>>(
  q: string,
  fields: Array<(term: string) => T>,
  idClause?: (id: string) => T,
): T[] {
  const term = q.trim();
  const clauses = fields.map((build) => build(term));
  if (isUuid(term) && idClause) {
    clauses.unshift(idClause(term));
  }
  return clauses;
}
