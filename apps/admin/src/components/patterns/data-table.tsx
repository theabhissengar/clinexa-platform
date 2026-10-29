import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ListSurface } from "@/components/patterns/list-surface";
import { TableSkeleton } from "@/components/patterns/table-skeleton";
import { cn } from "@/lib/utils";

type DataTableProps = {
  children: React.ReactNode;
  caption?: React.ReactNode;
  stickyFirstColumn?: boolean;
  density?: "standard" | "dense";
  /** Opaque card frame so page atmosphere does not show through. */
  framed?: boolean;
  loading?: boolean;
  empty?: boolean;
  emptyState?: React.ReactNode;
  error?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
};

/**
 * Presentation table pattern. Does not own fetching, query, filter,
 * pagination, sorting, selection, permissions, or routing.
 */
export function DataTable({
  children,
  caption,
  stickyFirstColumn = false,
  density = "standard",
  framed = false,
  loading = false,
  empty = false,
  emptyState,
  error,
  footer,
  className,
}: DataTableProps) {
  let body: React.ReactNode;

  if (error) {
    body = <div className={cn(framed && "p-3 sm:p-4")}>{error}</div>;
  } else if (loading) {
    body = (
      <div className={cn(framed && "p-3 sm:p-4")}>
        <TableSkeleton density={density} />
      </div>
    );
  } else if (empty) {
    body = <div className={cn(framed && "p-3 sm:p-4")}>{emptyState}</div>;
  } else {
    body = (
      <Table
        className={cn(
          density === "dense" &&
            "[&_th]:h-8 [&_td]:py-1.5 [&_th]:text-caption [&_td]:text-caption",
          framed &&
            "[&_thead]:bg-muted/50 [&_th]:h-11 [&_th]:px-3 [&_td]:px-3 [&_td]:py-3",
          stickyFirstColumn &&
            [
              // Sticky first column
              "[&_th:first-child]:sticky [&_th:first-child]:left-0 [&_th:first-child]:z-20 [&_th:first-child]:bg-muted",
              "[&_td:first-child]:sticky [&_td:first-child]:left-0 [&_td:first-child]:z-10",
              // Paint every body cell the same (no tr-only hover). Sticky first
              // col used to keep opaque bg-card while siblings showed tr hover,
              // which flickered when moving between rows.
              "[&_tbody_tr]:!bg-transparent [&_tbody_tr:hover]:!bg-transparent [&_tbody_tr[data-state=selected]]:!bg-transparent [&_tbody_tr]:transition-none",
              "[&_tbody_tr>td]:bg-card [&_tbody_tr>td]:transition-none",
              "[&_tbody_tr:hover>td]:bg-muted/50",
              "[&_tbody_tr[data-state=selected]>td]:bg-muted",
            ].join(" "),
        )}
      >
        {caption ? <TableCaption>{caption}</TableCaption> : null}
        {children}
      </Table>
    );
  }

  const content = (
    <div className={cn("flex min-w-0 flex-col gap-3", !framed && className)}>
      {body}
      {footer && !error ? (
        <div className={cn("min-w-0", framed && "border-t border-border px-3 py-2.5 sm:px-4")}>
          {footer}
        </div>
      ) : null}
    </div>
  );

  if (framed) {
    return <ListSurface className={className}>{content}</ListSurface>;
  }

  return content;
}

export {
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
};
