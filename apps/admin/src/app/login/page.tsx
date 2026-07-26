"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { LoginForm } from "@/features/auth";
import { useAuth } from "@/providers/auth-provider";

export default function LoginPage() {
  const { status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/");
    }
  }, [status, router]);

  if (status === "loading") {
    return (
      <main className="flex flex-1 items-center justify-center px-6 py-16">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </main>
    );
  }

  if (status === "authenticated") {
    return null;
  }

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
        <LoginForm />
      </div>
    </main>
  );
}
