import { cn } from "@/lib/utils";

type DetailSectionProps = {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  id?: string;
};

export function DetailSection({
  title,
  description,
  actions,
  children,
  className,
  id,
}: DetailSectionProps) {
  return (
    <section
      id={id}
      className={cn(
        "rounded-xl border border-border bg-card p-4 text-card-foreground",
        className,
      )}
    >
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="font-heading text-h2 font-semibold">{title}</h2>
          {description ? (
            <p className="mt-1 text-body text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {actions}
          </div>
        ) : null}
      </header>
      <div className="mt-3">{children}</div>
    </section>
  );
}
