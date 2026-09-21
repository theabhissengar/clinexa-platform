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
 * Decorative login backdrop. Soft cream/gold tokens (primary/accent/border).
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
            ? "bg-[linear-gradient(rgba(239,213,106,0.18)_1px,transparent_1px),linear-gradient(90deg,rgba(239,213,106,0.18)_1px,transparent_1px)] opacity-70 dark:opacity-40"
            : "bg-[linear-gradient(var(--border)_1px,transparent_1px),linear-gradient(90deg,var(--border)_1px,transparent_1px)] opacity-70 dark:opacity-20",
        )}
        style={{ backgroundSize: brand ? "56px 56px" : "72px 72px" }}
      />

      <div
        className={cn(
          "login-float absolute rounded-full blur-3xl",
          brand
            ? "-top-28 -left-20 size-88 bg-[#efd56a]/35 dark:bg-[#efd56a]/20"
            : "-top-32 -right-24 size-80 bg-accent/55 dark:bg-accent/30",
        )}
      />
      <div
        className={cn(
          "login-float-delayed absolute rounded-full blur-3xl",
          brand
            ? "-right-16 -bottom-16 size-72 bg-accent/50 dark:bg-accent/30"
            : "-left-20 -bottom-20 size-64 bg-accent dark:bg-accent/25",
        )}
      />
      <div
        className={cn(
          "login-float-drift absolute rounded-full blur-3xl",
          brand
            ? "top-1/3 right-[18%] size-40 bg-white/10 dark:bg-[#efd56a]/15"
            : "top-[55%] right-[8%] size-40 bg-primary/12 dark:bg-accent/20",
        )}
      />
      <div
        className={cn(
          "login-float-slow absolute rounded-full blur-3xl",
          brand
            ? "bottom-[18%] left-[8%] size-52 bg-[#efd56a]/20 dark:bg-primary/15"
            : "top-[12%] left-[6%] size-48 bg-primary/12 dark:bg-primary/10",
        )}
      />

      <OrbitRing
        spinClass={brand ? "login-spin" : "login-spin-reverse"}
        className={cn(
          brand
            ? "text-[#efd56a]/45 dark:text-[#efd56a]/25"
            : "text-primary/40 dark:text-primary/20",
          brand
            ? "-right-10 top-8 size-112 xl:size-136"
            : "-left-24 -bottom-20 size-88 opacity-90 dark:opacity-70",
        )}
      />
      <OrbitRing
        spinClass={brand ? "login-spin-reverse" : "login-spin-slow"}
        className={cn(
          brand
            ? "text-[#efd56a]/30 dark:text-[#efd56a]/15"
            : "text-primary/25 dark:text-primary/12",
          brand
            ? "-bottom-16 -left-12 size-72 opacity-80"
            : "-right-16 top-10 size-64 opacity-70 dark:opacity-50",
        )}
      />

      {brand ? (
        <>
          <Diamond
            className="login-float top-20 right-[22%]"
            tone="size-3 border-[#efd56a]/45 bg-[#efd56a]/15"
          />
          <Diamond
            className="login-float-diag top-[12%] left-[28%]"
            tone="size-2.5 border-[#efd56a]/40 bg-[#efd56a]/12"
          />
          <Diamond
            className="login-float-slow bottom-[22%] right-[12%]"
            tone="size-2 border-[#efd56a]/35"
          />
          <Diamond
            className="login-float-drift top-[42%] left-[8%]"
            tone="size-3.5 border-[#efd56a]/30 bg-[#efd56a]/10"
          />
          <Diamond
            className="login-float-delayed bottom-[38%] left-[36%]"
            tone="size-2 border-[#efd56a]/40"
          />
          <Dot
            className="login-float-delayed right-16 bottom-28 size-2"
            tone="bg-[#efd56a]/55"
          />
          <Dot
            className="login-float top-[58%] left-[18%] size-1.5"
            tone="bg-[#efd56a]/45"
          />
          <Dot
            className="login-float-diag top-[28%] right-[8%] size-2.5"
            tone="bg-[#efd56a]/40"
          />
          <Dot
            className="login-float-slow top-[72%] right-[32%] size-1.5"
            tone="bg-[#efd56a]/35"
          />
          <Dot
            className="login-float-drift bottom-[12%] left-[22%] size-3"
            tone="border border-[#efd56a]/40"
          />
          <Dot
            className="login-float-delayed top-[8%] left-[12%] size-1"
            tone="bg-[#efd56a]/50"
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
            tone="size-3 border-primary/25 bg-accent/50"
          />
          <Diamond
            className="login-float-slow bottom-[16%] left-[22%]"
            tone="size-2.5 border-accent/60"
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
            tone="bg-accent/70"
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
            tone="bg-accent/80"
          />
        </>
      )}
    </div>
  );
}
