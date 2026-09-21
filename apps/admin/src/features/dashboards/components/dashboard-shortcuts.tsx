import type { LucideIcon } from "lucide-react";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

export type DashboardShortcut = {
  label: string;
  href: string;
  icon: LucideIcon;
};

type DashboardShortcutsProps = {
  items: DashboardShortcut[];
};

export function DashboardShortcuts({ items }: DashboardShortcutsProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <section aria-labelledby="dashboard-shortcuts-title">
      <h2
        id="dashboard-shortcuts-title"
        className="font-heading text-h2 font-semibold text-foreground"
      >
        Quick access
      </h2>
      <div className="mt-3 flex flex-wrap gap-2">
        {items.map(({ label, href, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={buttonVariants({ variant: "outline" })}
          >
            <Icon data-icon="inline-start" aria-hidden />
            {label}
          </Link>
        ))}
      </div>
    </section>
  );
}
