"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { LoginPageView } from "@/features/auth/components/login-page-view";
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

  return <LoginPageView />;
}
