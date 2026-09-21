"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import {
  LoginLoadingView,
  LoginPageView,
} from "@/features/auth/components/login-page-view";
import { useAuth } from "@/providers/auth-provider";

export default function LoginPage() {
  const { status } = useAuth();
  const router = useRouter();
  const sawLoginForm = useRef(false);

  useEffect(() => {
    if (status === "unauthenticated") {
      sawLoginForm.current = true;
      return;
    }
    // Session restore / already-authenticated visit: role-based `/` landing (NAV-107).
    // After a form submit the form navigates to CONTEXT_LANDING[destination] instead.
    if (status === "authenticated" && !sawLoginForm.current) {
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
