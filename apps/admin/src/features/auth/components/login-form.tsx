"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { isAxiosError } from "axios";
import { CircleAlert, Eye, EyeOff } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CONTEXT_LANDING, type PlatformContext } from "@/lib/platform-context";
import { useAuth } from "@/providers/auth-provider";

const loginSchema = z.object({
  email: z.email("Enter a valid email address"),
  password: z.string().min(12, "Password must be at least 12 characters"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

type LoginFormProps = {
  destination: PlatformContext;
};

export function LoginForm({ destination }: LoginFormProps) {
  const { login } = useAuth();
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const emailErrorId = useId();
  const passwordErrorId = useId();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await login(values);
      // Intentional 5D destination override for this submit only.
      // Authenticated visits to `/login` still go to `/` (NAV-107).
      router.replace(CONTEXT_LANDING[destination]);
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === 401) {
        setFormError("Invalid email or password");
        return;
      }
      setFormError("Unable to sign in. Please try again.");
    }
  });

  return (
    <form onSubmit={onSubmit} className="flex w-full flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          autoComplete="username"
          aria-invalid={Boolean(errors.email)}
          aria-describedby={errors.email ? emailErrorId : undefined}
          {...register("email")}
        />
        {errors.email ? (
          <p id={emailErrorId} className="text-sm text-destructive">
            {errors.email.message}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Password</Label>
        <div className="relative">
          <Input
            id="password"
            type={passwordVisible ? "text" : "password"}
            autoComplete="current-password"
            aria-invalid={Boolean(errors.password)}
            aria-describedby={errors.password ? passwordErrorId : undefined}
            className="pr-9"
            {...register("password")}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="absolute top-1/2 right-0.5 -translate-y-1/2"
            aria-label={passwordVisible ? "Hide password" : "Show password"}
            aria-pressed={passwordVisible}
            onClick={() => setPasswordVisible((visible) => !visible)}
          >
            {passwordVisible ? (
              <EyeOff aria-hidden />
            ) : (
              <Eye aria-hidden />
            )}
          </Button>
        </div>
        {errors.password ? (
          <p id={passwordErrorId} className="text-sm text-destructive">
            {errors.password.message}
          </p>
        ) : null}
      </div>

      {formError ? (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}

      <Button
        type="submit"
        loading={isSubmitting}
        aria-label={isSubmitting ? "Signing in" : undefined}
        className="w-full"
      >
        Sign in
      </Button>
    </form>
  );
}
