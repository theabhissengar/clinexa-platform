import { cn } from "@/lib/utils";

type BrandMarkProps = {
  className?: string;
  size?: "sm" | "md" | "lg";
};

/**
 * Minimal Clinexa "C" brand mark for shell chrome and login.
 * Uses Phase 5A sidebar-primary tokens (light/dark).
 */
export function BrandMark({ className, size = "md" }: BrandMarkProps) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-md bg-sidebar-primary font-semibold text-sidebar-primary-foreground",
        size === "lg"
          ? "size-12 text-lg"
          : size === "sm"
            ? "size-7 text-xs"
            : "size-8 text-sm",
        className,
      )}
    >
      C
    </span>
  );
}
