import { cn } from "@/lib/utils";

type PageCanvasProps = {
  children: React.ReactNode;
  className?: string;
};

/**
 * Login-aligned application canvas for modernized product screens.
 * It owns presentation only; the application shell remains the main landmark.
 */
export function PageCanvas({ children, className }: PageCanvasProps) {
  return (
    <div
      className={cn(
        "flex min-h-full min-w-0 flex-1 flex-col bg-[color-mix(in_oklch,var(--muted)_58%,var(--info)_24%)] dark:bg-background",
        className,
      )}
    >
      {children}
    </div>
  );
}
