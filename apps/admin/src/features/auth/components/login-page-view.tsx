"use client";

import type { ReactNode } from "react";

import { ThemeToggle } from "@/components/layout/theme-toggle";
import { LoginForm } from "@/features/auth/components/login-form";

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
 * Presentational login chrome — redesign later by swapping this view.
 * Auth redirect and session logic stay in the route page.
 */
export function LoginPageView({ form = <LoginForm /> }: LoginPageViewProps) {
  return (
    <main className="relative flex flex-1 flex-col items-center justify-center px-4 py-12 sm:px-6 sm:py-16">
      <LoginThemeControl />
      <div className="mx-auto w-full max-w-sm pt-8 sm:pt-0">
        <div className="mb-8 text-center">
          <p className="text-sm font-medium tracking-wide text-muted-foreground uppercase">
            Clinexa Platform
          </p>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">
            Sign in
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Access the Internal Management console.
          </p>
        </div>
        {form}
      </div>
    </main>
  );
}

export function LoginLoadingView() {
  return (
    <main className="relative flex flex-1 flex-col items-center justify-center px-4 py-12 sm:px-6 sm:py-16">
      <LoginThemeControl />
      <p className="text-sm text-muted-foreground">Loading…</p>
    </main>
  );
}
