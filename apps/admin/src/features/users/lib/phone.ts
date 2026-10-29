/**
 * Phone display / input masking for CRM + Guardian.
 * Stored value is digits only (optional leading country code).
 */

export function toPhoneDigits(value: string): string {
  return value.replace(/\D/g, "").slice(0, 15);
}

/** Mask while typing / editing (NANP local, country code when longer). */
export function formatPhoneMask(digitsOrRaw: string): string {
  const d = toPhoneDigits(digitsOrRaw);
  if (!d) return "";

  if (d.length <= 10) {
    if (d.length < 4) return d;
    if (d.length < 7) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
    return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  }

  // 11+ digits: treat trailing 10 as local NANP, remainder as country code
  const local = d.slice(-10);
  const country = d.slice(0, -10);
  return `+${country} (${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6)}`;
}

/** Read-only display in tables / summaries. */
export function formatPhoneDisplay(
  phone: string | null | undefined,
  empty = "—",
): string {
  if (!phone?.trim()) return empty;
  const d = toPhoneDigits(phone);
  if (!d) return empty;
  return formatPhoneMask(d);
}
