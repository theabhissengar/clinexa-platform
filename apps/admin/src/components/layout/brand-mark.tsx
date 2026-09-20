import { cn } from "@/lib/utils";

type BrandMarkProps = {
  className?: string;
  size?: "sm" | "md";
};

/**
 * Minimal Clinexa "C" brand mark for shell chrome.
 * Uses Phase 5A sidebar-primary tokens (light/dark). Login usage deferred to 5D.
 */
export function BrandMark({ className, size = "md" }: BrandMarkProps) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-md bg-sidebar-primary font-semibold text-sidebar-primary-foreground",
        size === "sm" ? "size-7 text-xs" : "size-8 text-sm",
        className,
      )}
    >
      C
    </span>
  );
}
