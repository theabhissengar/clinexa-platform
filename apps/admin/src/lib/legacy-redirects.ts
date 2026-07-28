/**
 * Legacy un-prefixed routes → context-prefixed targets (NAV-019–021).
 * Kept free of path aliases so next.config.ts can import it.
 */
export const LEGACY_PATH_REDIRECTS: ReadonlyArray<{
  source: string;
  destination: string;
}> = [
  { source: "/users", destination: "/guardian/users" },
  { source: "/orders", destination: "/crm/orders" },
  { source: "/prescriptions", destination: "/crm/prescriptions" },
  { source: "/questionnaires", destination: "/crm/questionnaires" },
  { source: "/reports", destination: "/crm/reports" },
  { source: "/activity-log", destination: "/guardian/activity-log" },
  { source: "/settings", destination: "/guardian/settings" },
  { source: "/administration", destination: "/guardian/administration" },
];
