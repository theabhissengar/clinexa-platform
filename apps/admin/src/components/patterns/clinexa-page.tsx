import { cn } from "@/lib/utils";

const PAGE_WIDTH = {
  standard: "max-w-5xl",
  wide: "max-w-7xl",
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
    <main
      className={cn(
        "mx-auto flex w-full min-w-0 flex-1 flex-col px-4 py-6 md:px-6 md:py-8",
        PAGE_WIDTH[width],
        className,
      )}
    >
      {children}
    </main>
  );
}
