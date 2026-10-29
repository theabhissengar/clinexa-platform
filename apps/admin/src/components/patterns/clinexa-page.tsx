import { cn } from "@/lib/utils";

const PAGE_WIDTH = {
  standard: "max-w-5xl",
  /**
   * List / detail canvas. Caps when the desktop sidebar is open; fills the
   * inset when the rail collapses so tables and filter panels expand.
   * Below the shell breakpoint the sidebar is overlay-only, so width stays fluid.
   */
  wide: cn(
    "max-w-7xl",
    "transition-[max-width] duration-[380ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
    "max-lg:max-w-none",
    "group-data-[sidebar-state=collapsed]/sidebar-wrapper:max-w-none",
  ),
  form: "max-w-3xl",
} as const;

export type ClinexaPageWidth = keyof typeof PAGE_WIDTH;

type ClinexaPageProps = {
  children: React.ReactNode;
  width?: ClinexaPageWidth;
  className?: string;
};

/**
 * Shared page canvas: padding, max-width, and overflow containment.
 * Does not own navigation, permissions, fetching, or page chrome.
 */
export function ClinexaPage({
  children,
  width = "standard",
  className,
}: ClinexaPageProps) {
  return (
    <div
      className={cn(
        "mx-auto flex w-full min-w-0 flex-1 flex-col px-3 py-5 sm:px-4 sm:py-6 md:px-6 md:py-8",
        PAGE_WIDTH[width],
        className,
      )}
    >
      {children}
    </div>
  );
}
