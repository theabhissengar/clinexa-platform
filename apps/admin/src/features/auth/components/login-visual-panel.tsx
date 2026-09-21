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
    <div className="relative hidden overflow-hidden border-r border-black/8 bg-[linear-gradient(160deg,#1c1c1c_0%,#2a2418_55%,#3a3018_100%)] text-white dark:border-white/10 dark:bg-[linear-gradient(160deg,#121417_0%,#1a1814_55%,#2a2418_100%)] lg:flex lg:flex-col lg:justify-center lg:px-10 xl:px-16">
      <LoginAtmosphere variant="brand" />
      <div className="login-enter-brand relative z-10 flex max-w-md flex-col gap-5 sm:gap-6">
        <BrandMark
          size="xl"
          className="bg-[#efd56a] text-[#1c1c1c] shadow-md"
        />
        <div className="flex flex-col gap-1.5 sm:gap-2">
          <p className="font-heading text-4xl font-semibold tracking-tight text-white xl:text-5xl">
            Clinexa
          </p>
          <p className="text-lg font-semibold uppercase tracking-[0.18em] text-[#efd56a]/90 xl:text-xl">
            {CONTEXT_LABEL[destination]}
          </p>
        </div>
      </div>
    </div>
  );
}
