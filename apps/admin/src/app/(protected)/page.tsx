"use client";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/providers/auth-provider";
import { useRouter } from "next/navigation";

export default function HomePage() {
  const { user, logout } = useAuth();
  const router = useRouter();

  async function handleLogout() {
    await logout();
    router.replace("/login");
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-16">
      <div className="mx-auto max-w-lg text-center">
        <p className="text-sm font-medium tracking-wide text-muted-foreground uppercase">
          Clinexa Platform
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground">
          Internal Management
        </h1>
        <p className="mt-3 text-base text-muted-foreground">
          Signed in as {user?.email}. Authentication foundation is active —
          business modules arrive in later phases.
        </p>
        <div className="mt-8 flex justify-center">
          <Button type="button" variant="outline" onClick={handleLogout}>
            Sign out
          </Button>
        </div>
      </div>
    </main>
  );
}
