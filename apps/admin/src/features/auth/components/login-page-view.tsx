"use client";

import { useCallback, useState, type ReactNode } from "react";

import { BrandMark } from "@/components/layout/brand-mark";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { LoginApplicationSelector } from "@/features/auth/components/login-application-selector";
import { LoginAtmosphere } from "@/features/auth/components/login-atmosphere";
import { LoginForm } from "@/features/auth/components/login-form";
import { LoginVisualPanel } from "@/features/auth/components/login-visual-panel";
import {
  PlatformContexts,
  type PlatformContext,
} from "@/lib/platform-context";
import { cn } from "@/lib/utils";

type LoginPageViewProps = {
  form?: ReactNode;
};

function LoginThemeControl() {
  return (
    <div className="absolute top-3 right-3 z-20 sm:top-4 sm:right-4">
      <ThemeToggle />
    </div>
  );
}

/**
 * Presentational login chrome. Auth redirect and session logic stay in the route page.
 * Explicit CRM/Guardian selection only affects this submit's destination; `/` remains role-based.
 */
export function LoginPageView({ form }: LoginPageViewProps) {
  const [destination, setDestination] = useState<PlatformContext>(
    PlatformContexts.CRM,
  );
  const [foldTo, setFoldTo] = useState<"crm" | "guardian" | null>(null);

  const handleDestinationChange = useCallback(
    (next: PlatformContext) => {
      if (next === destination) {
        return;
      }

      setDestination(next);
      setFoldTo(
        next === PlatformContexts.GUARDIAN ? "guardian" : "crm",
      );
    },
    [destination],
  );

  return (
    <main className="relative flex min-h-dvh flex-1 flex-col">
      <LoginThemeControl />
      <div className="grid min-h-dvh flex-1 lg:grid-cols-2">
        <LoginVisualPanel destination={destination} />
        <div className="relative flex flex-col items-center justify-center overflow-visible bg-[color-mix(in_oklch,var(--muted)_58%,var(--info)_24%)] px-4 py-12 sm:px-6 sm:py-16 dark:bg-background">
          <LoginAtmosphere variant="form" />
          <div className="login-enter-brand relative z-10 mb-8 flex items-center gap-2.5 lg:hidden">
            <BrandMark size="sm" />
            <p className="text-sm font-semibold tracking-tight text-foreground">
              Clinexa
            </p>
          </div>
          <div className="login-fold-stage login-enter-card relative z-10 w-full max-w-sm">
            <div
              className={cn(
                "login-fold-sheet",
                foldTo === "guardian" && "login-fold-to-guardian",
                foldTo === "crm" && "login-fold-to-crm",
              )}
              onAnimationEnd={(event) => {
                if (event.target !== event.currentTarget) {
                  return;
                }
                const { animationName } = event;
                setFoldTo((current) => {
                  if (
                    (current === "guardian" &&
                      animationName === "login-fold-tr-bl") ||
                    (current === "crm" &&
                      animationName === "login-fold-bl-tr")
                  ) {
                    return null;
                  }
                  return current;
                });
              }}
            >
              <Card
                className={cn(
                  "w-full bg-[color-mix(in_oklch,var(--accent)_60%,var(--info)_22%)] shadow-sm ring-primary/15 dark:bg-card dark:ring-foreground/10",
                )}
              >
                <CardHeader className="gap-4">
                  <h1 className="font-heading text-h1 text-center font-semibold tracking-tight text-foreground">
                    Welcome
                  </h1>
                  <LoginApplicationSelector
                    value={destination}
                    onChange={handleDestinationChange}
                  />
                </CardHeader>
                <CardContent>
                  {form ?? <LoginForm destination={destination} />}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

export function LoginLoadingView() {
  return (
    <main className="relative flex min-h-dvh flex-1 flex-col items-center justify-center bg-[color-mix(in_oklch,var(--muted)_58%,var(--info)_24%)] px-4 py-12 sm:px-6 sm:py-16 dark:bg-background">
      <LoginThemeControl />
      <div className="flex flex-col items-center gap-3">
        <BrandMark />
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    </main>
  );
}
