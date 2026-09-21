import { cn } from "@/lib/utils";

type DashboardMetricGridProps = {
  children: React.ReactNode;
  className?: string;
};

export function DashboardMetricGrid({
  children,
  className,
}: DashboardMetricGridProps) {
  return (
    <section
      aria-label="Dashboard metrics"
      className={cn(
        "grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4",
        className,
      )}
    >
      {children}
    </section>
  );
}
