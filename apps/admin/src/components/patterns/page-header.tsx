import { cn } from "@/lib/utils";

type SlotProps = {
  children: React.ReactNode;
  className?: string;
};

export function PageHeader({ children, className }: SlotProps) {
  return (
    <header
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between",
        className,
      )}
    >
      {children}
    </header>
  );
}

export function PageHeaderCopy({ children, className }: SlotProps) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      {children}
    </div>
  );
}

export function PageHeaderTitle({ children, className }: SlotProps) {
  return (
    <h1
      className={cn(
        "font-heading text-h1 font-semibold tracking-tight text-foreground",
        className,
      )}
    >
      {children}
    </h1>
  );
}

export function PageHeaderDescription({ children, className }: SlotProps) {
  return (
    <p className={cn("text-body text-muted-foreground", className)}>
      {children}
    </p>
  );
}

export function PageHeaderMeta({ children, className }: SlotProps) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {children}
    </div>
  );
}

export function PageHeaderActions({ children, className }: SlotProps) {
  return (
    <div
      className={cn(
        "flex shrink-0 flex-wrap items-center gap-2",
        className,
      )}
    >
      {children}
    </div>
  );
}
