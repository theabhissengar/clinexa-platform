import { cn } from "@/lib/utils";

type PageBodyProps = {
  children: React.ReactNode;
  dense?: boolean;
  className?: string;
};

export function PageBody({ children, dense = false, className }: PageBodyProps) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col",
        dense ? "gap-4" : "gap-6",
        className,
      )}
    >
      {children}
    </div>
  );
}
