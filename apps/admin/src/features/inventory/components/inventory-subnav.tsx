"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/guardian/inventory", label: "Dashboard", exact: true },
  { href: "/guardian/inventory/stock", label: "Stock" },
  { href: "/guardian/inventory/warehouses", label: "Warehouses" },
  { href: "/guardian/inventory/receiving", label: "Receiving" },
  { href: "/guardian/inventory/movements", label: "Movements" },
  { href: "/guardian/inventory/policies", label: "Policies" },
];

export function InventorySubnav() {
  const pathname = usePathname();
  return (
    <nav className="mb-6 flex flex-wrap gap-2 border-b border-border pb-3">
      {LINKS.map((link) => {
        const active = link.exact
          ? pathname === link.href
          : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`rounded-md px-3 py-1.5 text-sm ${
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
