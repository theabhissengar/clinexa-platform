import { BrandMark } from "@/components/layout/brand-mark";
import { LoginAtmosphere } from "@/features/auth/components/login-atmosphere";
import {
  CONTEXT_LABEL,
  type PlatformContext,
} from "@/lib/platform-context";

type LoginVisualPanelProps = {
  destination: PlatformContext;
};

/**
 * Branded panel for large-screen login. Hidden below 1024px.
 * Uses sidebar tokens so login rhymes with the application shell.
 */
export function LoginVisualPanel({ destination }: LoginVisualPanelProps) {
  return (
    <div className="relative hidden overflow-hidden border-r border-sidebar-border bg-[color-mix(in_oklch,var(--accent)_48%,var(--primary)_32%)] text-sidebar-foreground dark:bg-sidebar lg:flex lg:flex-col lg:justify-center lg:px-10 xl:px-16">
      <LoginAtmosphere variant="brand" />
      <div className="login-enter-brand relative z-10 flex max-w-sm flex-col gap-4">
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
    </div>
  );
}
