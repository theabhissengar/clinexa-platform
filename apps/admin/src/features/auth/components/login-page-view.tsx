"use client";

import { useState, type ReactNode } from "react";

import { BrandMark } from "@/components/layout/brand-mark";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { LoginApplicationSelector } from "@/features/auth/components/login-application-selector";
import { LoginForm } from "@/features/auth/components/login-form";
import { LoginVisualPanel } from "@/features/auth/components/login-visual-panel";
import {
  PlatformContexts,
  type PlatformContext,
} from "@/lib/platform-context";

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

  return (
    <main className="relative flex min-h-dvh flex-1 flex-col">
      <LoginThemeControl />
      <div className="grid min-h-dvh flex-1 lg:grid-cols-2">
        <LoginVisualPanel destination={destination} />
        <div className="flex flex-col items-center justify-center px-4 py-12 sm:px-6 sm:py-16">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <BrandMark size="sm" />
            <p className="text-sm font-semibold tracking-tight text-foreground">
              Clinexa
            </p>
          </div>
          <Card className="w-full max-w-sm">
            <CardHeader className="gap-4">
              <div className="flex flex-col gap-1">
                <h1 className="font-heading text-h1 font-semibold tracking-tight text-foreground">
                  Sign in
                </h1>
                <p className="text-sm text-muted-foreground">
                  Internal Platform
                </p>
              </div>
              <LoginApplicationSelector
                value={destination}
                onChange={setDestination}
              />
            </CardHeader>
            <CardContent>
              {form ?? <LoginForm destination={destination} />}
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}

export function LoginLoadingView() {
  return (
    <main className="relative flex min-h-dvh flex-1 flex-col items-center justify-center px-4 py-12 sm:px-6 sm:py-16">
      <LoginThemeControl />
      <div className="flex flex-col items-center gap-3">
        <BrandMark />
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    </main>
  );
}
