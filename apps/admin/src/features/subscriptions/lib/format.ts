export function formatMoneyCents(cents: number, currency = "USD"): string {
  const amount = (cents / 100).toFixed(2);
  return currency === "USD" ? `$${amount}` : `${amount} ${currency}`;
}

export function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function customerLabel(row: {
  customerFirstName?: string | null;
  customerLastName?: string | null;
  customerEmail?: string | null;
}): string {
  const name = [row.customerFirstName, row.customerLastName]
    .filter(Boolean)
    .join(" ");
  return name || row.customerEmail || "—";
}

export function statusLabel(status: string): string {
  return status.replaceAll("_", " ");
}

export function intervalLabel(
  interval?: string | null,
  count?: number | null,
): string {
  if (!interval) return "—";
  const unit = statusLabel(interval).toLowerCase();
  const n = count ?? 1;
  return n === 1 ? `Every ${unit}` : `Every ${n} ${unit}s`;
}

export function parseJsonObject(
  text: string,
  label: string,
): { ok: true; value: Record<string, unknown> | null } | { ok: false; error: string } {
  if (!text.trim()) return { ok: true, value: null };
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, error: `${label} must be a JSON object.` };
    }
    return { ok: true, value: parsed as Record<string, unknown> };
  } catch {
    return { ok: false, error: `${label} must be valid JSON.` };
  }
}

export function getErrorMessage(error: unknown, fallback: string): string {
  if (
    error &&
    typeof error === "object" &&
    "response" in error &&
    error.response &&
    typeof error.response === "object" &&
    "data" in error.response &&
    error.response.data &&
    typeof error.response.data === "object" &&
    "message" in error.response.data
  ) {
    const message = (error.response.data as { message?: unknown }).message;
    if (typeof message === "string") return message;
    if (Array.isArray(message)) return message.join(", ");
  }
  return fallback;
}
