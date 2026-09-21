import { cn } from "@/lib/utils";

type LoginAtmosphereProps = {
  variant: "brand" | "form";
};

function OrbitRing({
  className,
  spinClass,
}: {
  className: string;
  spinClass: string;
}) {
  return (
    <div className={cn(spinClass, "absolute", className)}>
      <svg className="size-full" viewBox="0 0 400 400" fill="none">
        <circle
          cx="200"
          cy="200"
          r="70"
          stroke="currentColor"
          strokeWidth="1"
        />
        <circle
          cx="200"
          cy="200"
          r="118"
          stroke="currentColor"
          strokeWidth="1"
          strokeDasharray="6 10"
        />
        <circle
          cx="200"
          cy="200"
          r="168"
          stroke="currentColor"
          strokeWidth="1"
        />
        <path
          d="M200 32 L200 86 M200 314 L200 368 M32 200 L86 200 M314 200 L368 200"
          stroke="currentColor"
          strokeWidth="1"
        />
      </svg>
    </div>
  );
}

function Diamond({ className, tone }: { className: string; tone: string }) {
  return (
    <span className={cn("absolute", className)}>
      <span className={cn("block rotate-45 border", tone)} />
    </span>
  );
}

function Dot({ className, tone }: { className: string; tone: string }) {
  return (
    <span className={cn("absolute rounded-full", className, tone)} />
  );
}

/**
 * Decorative login backdrop. Token-only (primary/accent/info/border).
 * pointer-events-none so it never blocks the form or theme toggle.
 */
export function LoginAtmosphere({ variant }: LoginAtmosphereProps) {
  const brand = variant === "brand";

  return (
    <div
      aria-hidden
      className="login-enter-atmosphere pointer-events-none absolute inset-0 overflow-hidden"
    >
      <div
        className={cn(
          "login-grid-pan absolute inset-0",
          brand
            ? "bg-[linear-gradient(var(--sidebar-border)_1px,transparent_1px),linear-gradient(90deg,var(--sidebar-border)_1px,transparent_1px)] opacity-80 dark:opacity-30"
            : "bg-[linear-gradient(var(--border)_1px,transparent_1px),linear-gradient(90deg,var(--border)_1px,transparent_1px)] opacity-70 dark:opacity-20",
        )}
        style={{ backgroundSize: brand ? "56px 56px" : "72px 72px" }}
      />

      <div
        className={cn(
          "login-float absolute rounded-full blur-3xl",
          brand
            ? "-top-28 -left-20 size-88 bg-primary/40 dark:bg-primary/25"
            : "-top-32 -right-24 size-80 bg-info/30 dark:bg-primary/18",
        )}
      />
      <div
        className={cn(
          "login-float-delayed absolute rounded-full blur-3xl",
          brand
            ? "-right-16 -bottom-16 size-72 bg-accent dark:bg-accent/35"
            : "-left-20 -bottom-20 size-64 bg-accent dark:bg-accent/25",
        )}
      />
      <div
        className={cn(
          "login-float-drift absolute rounded-full blur-3xl",
          brand
            ? "top-1/3 right-[18%] size-40 bg-sidebar-primary/35 dark:bg-sidebar-primary/20"
            : "top-[55%] right-[8%] size-40 bg-info/30 dark:bg-info/15",
        )}
      />
      <div
        className={cn(
          "login-float-slow absolute rounded-full blur-3xl",
          brand
            ? "bottom-[18%] left-[8%] size-52 bg-sidebar-primary/20 dark:bg-primary/10"
            : "top-[12%] left-[6%] size-48 bg-primary/15 dark:bg-primary/10",
        )}
      />

      <OrbitRing
        spinClass={brand ? "login-spin" : "login-spin-reverse"}
        className={cn(
          "text-primary/50 dark:text-primary/20",
          brand
            ? "-right-10 top-8 size-112 xl:size-136"
            : "-left-24 -bottom-20 size-88 opacity-90 dark:opacity-70",
        )}
      />
      <OrbitRing
        spinClass={brand ? "login-spin-reverse" : "login-spin-slow"}
        className={cn(
          "text-primary/30 dark:text-primary/12",
          brand
            ? "-bottom-16 -left-12 size-72 opacity-80"
            : "-right-16 top-10 size-64 opacity-70 dark:opacity-50",
        )}
      />

      {brand ? (
        <>
          <Diamond
            className="login-float top-20 right-[22%]"
            tone="size-3 border-sidebar-primary/40 bg-sidebar-accent dark:bg-sidebar-primary/20"
          />
          <Diamond
            className="login-float-diag top-[12%] left-[28%]"
            tone="size-2.5 border-sidebar-primary/35 bg-sidebar-primary/15"
          />
          <Diamond
            className="login-float-slow bottom-[22%] right-[12%]"
            tone="size-2 border-sidebar-primary/30"
          />
          <Diamond
            className="login-float-drift top-[42%] left-[8%]"
            tone="size-3.5 border-sidebar-primary/25 bg-sidebar-accent/80"
          />
          <Diamond
            className="login-float-delayed bottom-[38%] left-[36%]"
            tone="size-2 border-sidebar-primary/40"
          />
          <Dot
            className="login-float-delayed right-16 bottom-28 size-2"
            tone="bg-sidebar-primary/50"
          />
          <Dot
            className="login-float top-[58%] left-[18%] size-1.5"
            tone="bg-sidebar-primary/40"
          />
          <Dot
            className="login-float-diag top-[28%] right-[8%] size-2.5"
            tone="bg-sidebar-primary/35"
          />
          <Dot
            className="login-float-slow top-[72%] right-[32%] size-1.5"
            tone="bg-sidebar-primary/30"
          />
          <Dot
            className="login-float-drift bottom-[12%] left-[22%] size-3"
            tone="border border-sidebar-primary/35"
          />
          <Dot
            className="login-float-delayed top-[8%] left-[12%] size-1"
            tone="bg-sidebar-primary/45"
          />
        </>
      ) : (
        <>
          <Diamond
            className="login-float top-24 left-[12%]"
            tone="size-2 border-primary/30"
          />
          <Diamond
            className="login-float-diag top-[18%] right-[14%]"
            tone="size-3 border-primary/25 bg-primary/10"
          />
          <Diamond
            className="login-float-slow bottom-[16%] left-[22%]"
            tone="size-2.5 border-info/35"
          />
          <Diamond
            className="login-float-drift top-[48%] left-[6%]"
            tone="size-2 border-primary/20"
          />
          <Diamond
            className="login-float-delayed bottom-[32%] right-[10%]"
            tone="size-3.5 border-primary/25 bg-accent/40"
          />
          <Dot
            className="login-float-delayed right-[18%] bottom-20 size-1.5"
            tone="bg-primary/35"
          />
          <Dot
            className="login-float top-[14%] left-[42%] size-2"
            tone="bg-info/30"
          />
          <Dot
            className="login-float-diag top-[62%] right-[28%] size-2.5"
            tone="bg-primary/25"
          />
          <Dot
            className="login-float-slow bottom-[10%] right-[36%] size-1.5"
            tone="bg-primary/30"
          />
          <Dot
            className="login-float-drift top-[36%] right-[8%] size-3"
            tone="border border-primary/25"
          />
          <Dot
            className="login-float-delayed top-[78%] left-[14%] size-1"
            tone="bg-info/40"
          />
        </>
      )}
    </div>
  );
}
