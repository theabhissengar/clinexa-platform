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

export function customerLabel(order: {
  customerFirstName?: string | null;
  customerLastName?: string | null;
  customerEmail?: string | null;
}): string {
  const name = [order.customerFirstName, order.customerLastName]
    .filter(Boolean)
    .join(" ");
  return name || order.customerEmail || "—";
}

export function statusLabel(status: string): string {
  return status.replaceAll("_", " ");
}
