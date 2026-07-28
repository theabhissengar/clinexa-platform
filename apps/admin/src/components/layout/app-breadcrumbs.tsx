"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment } from "react";

import {
  GUARDIAN_GROUP_LABEL,
  NAV_ITEMS,
} from "@/components/layout/nav-config";
import { findNavItemByPath } from "@/components/layout/nav-filter";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  CONTEXT_LABEL,
  CONTEXT_LANDING,
  resolveContextFromPathname,
} from "@/lib/platform-context";

/**
 * Breadcrumbs derived solely from nav-config (NAV-080–084).
 * Root segment is the context name linking to that context's landing page.
 */
export function AppBreadcrumbs() {
  const pathname = usePathname();
  const context = resolveContextFromPathname(pathname);
  const current = findNavItemByPath(
    NAV_ITEMS.filter((item) => item.context === context),
    pathname,
  );

  if (!context) {
    return null;
  }

  const contextLabel = CONTEXT_LABEL[context];
  const contextHref = CONTEXT_LANDING[context];
  const isContextRoot = pathname === contextHref;

  const segments: { label: string; href?: string }[] = [
    { label: contextLabel, href: isContextRoot ? undefined : contextHref },
  ];

  if (isContextRoot) {
    segments.push({ label: "Dashboard" });
  } else if (current) {
    if (
      context === "guardian" &&
      current.group &&
      current.group !== "dashboard"
    ) {
      segments.push({ label: GUARDIAN_GROUP_LABEL[current.group] });
    }
    segments.push({ label: current.title });
  } else {
    const tail = pathname.split("/").filter(Boolean).at(-1) ?? "Page";
    segments.push({
      label: tail.charAt(0).toUpperCase() + tail.slice(1).replace(/-/g, " "),
    });
  }

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {segments.map((segment, index) => {
          const isLast = index === segments.length - 1;
          return (
            <Fragment key={`${segment.label}-${index}`}>
              {index > 0 ? <BreadcrumbSeparator /> : null}
              <BreadcrumbItem>
                {isLast || !segment.href ? (
                  <BreadcrumbPage>{segment.label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink render={<Link href={segment.href} />}>
                    {segment.label}
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
