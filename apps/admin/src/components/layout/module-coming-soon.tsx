import type { LucideIcon } from "lucide-react";

type ModuleComingSoonProps = {
  title: string;
  description: string;
  icon: LucideIcon;
};

/**
 * Shared placeholder for modules not yet implemented.
 */
export function ModuleComingSoon({
  title,
  description,
  icon: Icon,
}: ModuleComingSoonProps) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-start px-6 py-10">
      <div className="flex size-12 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Icon className="size-6" aria-hidden />
      </div>
      <h1 className="mt-6 text-2xl font-semibold tracking-tight text-foreground">
        {title}
      </h1>
      <p className="mt-2 max-w-xl text-sm text-muted-foreground">{description}</p>
    </main>
  );
}
