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
import { TableSkeleton } from "@/components/patterns/table-skeleton";
import { cn } from "@/lib/utils";

type DataTableProps = {
  children: React.ReactNode;
  caption?: React.ReactNode;
  stickyFirstColumn?: boolean;
  density?: "standard" | "dense";
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
  loading = false,
  empty = false,
  emptyState,
  error,
  footer,
  className,
}: DataTableProps) {
  let body: React.ReactNode;

  if (error) {
    body = error;
  } else if (loading) {
    body = <TableSkeleton density={density} />;
  } else if (empty) {
    body = emptyState ?? null;
  } else {
    body = (
      <Table
        className={cn(
          density === "dense" &&
            "[&_th]:h-8 [&_td]:py-1.5 [&_th]:text-caption [&_td]:text-caption",
          stickyFirstColumn &&
            "[&_th:first-child]:sticky [&_th:first-child]:left-0 [&_th:first-child]:z-10 [&_th:first-child]:bg-muted [&_td:first-child]:sticky [&_td:first-child]:left-0 [&_td:first-child]:z-10 [&_td:first-child]:bg-background",
        )}
      >
        {caption ? <TableCaption>{caption}</TableCaption> : null}
        {children}
      </Table>
    );
  }

  return (
    <div className={cn("flex min-w-0 flex-col gap-3", className)}>
      {body}
      {footer && !error ? <div className="min-w-0">{footer}</div> : null}
    </div>
  );
}

export {
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
};
