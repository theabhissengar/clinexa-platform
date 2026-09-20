import { cn } from "@/lib/utils";

type FieldGridProps = {
  children: React.ReactNode;
  columns?: 1 | 2 | 3;
  className?: string;
};

const COLUMN_CLASS = {
  1: "grid gap-4",
  2: "grid gap-4 sm:grid-cols-2",
  3: "grid gap-4 sm:grid-cols-2 md:grid-cols-3",
} as const;

export function FieldGrid({
  children,
  columns = 2,
  className,
}: FieldGridProps) {
  return <div className={cn(COLUMN_CLASS[columns], className)}>{children}</div>;
}
