"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import {
  LoginLoadingView,
  LoginPageView,
} from "@/features/auth/components/login-page-view";
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
    return <LoginLoadingView />;
  }

  if (status === "authenticated") {
    return null;
  }

  return <LoginPageView />;
}
