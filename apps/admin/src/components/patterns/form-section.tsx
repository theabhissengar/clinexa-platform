import { cn } from "@/lib/utils";

type FormSectionProps = {
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
};

export function FormSection({
  title,
  description,
  children,
  className,
}: FormSectionProps) {
  return (
    <section className={cn("flex flex-col gap-4", className)}>
      {title || description ? (
        <header className="flex flex-col gap-1">
          {title ? (
            <h2 className="font-heading text-h2 font-semibold text-foreground">
              {title}
            </h2>
          ) : null}
          {description ? (
            <p className="text-body text-muted-foreground">{description}</p>
          ) : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}
