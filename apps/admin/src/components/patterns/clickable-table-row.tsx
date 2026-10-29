"use client";

import { useRouter } from "next/navigation";
import type { KeyboardEvent, MouseEvent } from "react";

import { TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

const INTERACTIVE_SELECTOR =
  "a, button, input, textarea, select, label, [role='checkbox'], [role='button'], [data-row-ignore]";

type ClickableTableRowProps = React.ComponentProps<typeof TableRow> & {
  href: string;
};

/**
 * Navigates on row click / Enter / Space, but ignores clicks on links,
 * buttons, checkboxes, and other interactive controls inside the row.
 */
export function ClickableTableRow({
  href,
  className,
  onClick,
  onKeyDown,
  children,
  ...props
}: ClickableTableRowProps) {
  const router = useRouter();

  function navigate() {
    if (!href) return;
    router.push(href);
  }

  function handleClick(event: MouseEvent<HTMLTableRowElement>) {
    onClick?.(event);
    if (event.defaultPrevented) return;
    if (event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest(INTERACTIVE_SELECTOR)) return;
    navigate();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTableRowElement>) {
    onKeyDown?.(event);
    if (event.defaultPrevented) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    const target = event.target as HTMLElement | null;
    if (target !== event.currentTarget) return;
    event.preventDefault();
    navigate();
  }

  return (
    <TableRow
      {...props}
      role="link"
      tabIndex={0}
      className={cn("cursor-pointer", className)}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      {children}
    </TableRow>
  );
}
