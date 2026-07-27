import type { ReactNode } from "react";

import { LoginForm } from "@/features/auth/components/login-form";

type LoginPageViewProps = {
  form?: ReactNode;
};

/**
 * Presentational login chrome — redesign later by swapping this view.
 * Auth redirect and session logic stay in the route page.
 */
export function LoginPageView({ form = <LoginForm /> }: LoginPageViewProps) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-16">
      <div className="mx-auto w-full max-w-sm">
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
