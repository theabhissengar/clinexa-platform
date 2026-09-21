import { cn } from "@/lib/utils";

type PageCanvasProps = {
  children: React.ReactNode;
  className?: string;
};

/**
 * Transparent page canvas over the shared Login-aligned shell atmosphere.
 * Presentation only; the application shell remains the main landmark.
 */
export function PageCanvas({ children, className }: PageCanvasProps) {
  return (
    <div
      className={cn(
        "relative flex min-h-full min-w-0 flex-1 flex-col bg-transparent",
        className,
      )}
    >
      {children}
    </div>
  );
}
