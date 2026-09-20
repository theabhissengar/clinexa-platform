import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type TableSkeletonProps = {
  rows?: number;
  columns?: number;
  density?: "standard" | "dense";
  className?: string;
};

export function TableSkeleton({
  rows = 8,
  columns = 5,
  density = "standard",
  className,
}: TableSkeletonProps) {
  const cellHeight = density === "dense" ? "h-3" : "h-4";

  return (
    <div
      role="status"
      aria-label="Loading table"
      className={cn(
        "overflow-x-auto rounded-lg border border-border",
        className,
      )}
    >
      <span className="sr-only">Loading</span>
      <div className="min-w-[40rem]">
        <div className="flex gap-4 border-b border-border bg-muted/40 px-3 py-2">
          {Array.from({ length: columns }, (_, index) => (
            <Skeleton
              key={`head-${index}`}
              className={cn(cellHeight, index === 0 ? "w-32" : "w-24")}
            />
          ))}
        </div>
        {Array.from({ length: rows }, (_, rowIndex) => (
          <div
            key={`row-${rowIndex}`}
            className="flex gap-4 border-b border-border px-3 py-2 last:border-b-0"
          >
            {Array.from({ length: columns }, (_, colIndex) => (
              <Skeleton
                key={`cell-${rowIndex}-${colIndex}`}
                className={cn(cellHeight, colIndex === 0 ? "w-32" : "w-24")}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
