import { BrandMark } from "@/components/layout/brand-mark";
import {
  CONTEXT_LABEL,
  type PlatformContext,
} from "@/lib/platform-context";

type LoginVisualPanelProps = {
  destination: PlatformContext;
};

/**
 * Quiet branded panel for large-screen login. Hidden below 1024px.
 * Uses sidebar tokens so login rhymes with the application shell.
 */
export function LoginVisualPanel({ destination }: LoginVisualPanelProps) {
  return (
    <div className="relative hidden overflow-hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex lg:flex-col lg:justify-center lg:px-10 xl:px-16">
      <div className="relative z-10 flex max-w-sm flex-col gap-4">
        <BrandMark size="lg" />
        <div className="flex flex-col gap-1">
          <p className="font-heading text-h1 font-semibold tracking-tight">
            Clinexa
          </p>
          <p className="text-sm text-sidebar-foreground/70">
            {CONTEXT_LABEL[destination]}
          </p>
        </div>
      </div>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 hidden xl:block"
      >
        <span className="absolute top-16 right-16 size-24 rounded-xl border border-sidebar-border bg-sidebar-accent/60" />
        <span className="absolute right-28 bottom-24 size-16 rounded-lg border border-sidebar-border" />
        <span className="absolute top-1/3 right-[28%] size-2.5 rounded-full bg-sidebar-primary/40" />
      </div>
    </div>
  );
}
