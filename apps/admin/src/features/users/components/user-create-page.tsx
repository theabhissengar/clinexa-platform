"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { isAxiosError } from "axios";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Roles } from "@/features/auth/permissions";
import { createStaffUser, listRoles } from "@/features/users/api/users-api";
import type { Role } from "@/features/users/types";

const MIN_PASSWORD_LENGTH = 12;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type FieldErrors = {
  email?: string;
  password?: string;
  roles?: string;
};

function validateForm(input: {
  email: string;
  password: string;
  roleCodes: string[];
}): FieldErrors {
  const errors: FieldErrors = {};
  const email = input.email.trim();

  if (!email) {
    errors.email = "Email is required.";
  } else if (!EMAIL_PATTERN.test(email)) {
    errors.email = "Enter a valid email address (for example, name@clinic.com).";
  }

  if (!input.password) {
    errors.password = "Password is required.";
  } else if (input.password.length < MIN_PASSWORD_LENGTH) {
    errors.password = `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }

  if (input.roleCodes.length === 0) {
    errors.roles = "Select at least one staff role.";
  }

  return errors;
}

function apiErrorMessage(error: unknown): string {
  if (isAxiosError(error)) {
    const payload = error.response?.data as
      | { message?: string | string[]; code?: string }
      | undefined;
    const message = payload?.message;
    if (typeof message === "string" && message.trim()) return message;
    if (Array.isArray(message) && message.length) return message.join(", ");
    if (error.response?.status === 409) {
      return "That email is already registered.";
    }
    if (error.response?.status === 403) {
      return "You do not have permission to create users.";
    }
  }
  return "Unable to create user. Check the form and try again.";
}

export function UserCreatePage() {
  const router = useRouter();

  const [roles, setRoles] = useState<Role[]>([]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [selectedRoleCodes, setSelectedRoleCodes] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void listRoles()
      .then((r) => {
        if (!cancelled) {
          const staffCodes = new Set(Object.values(Roles));
          setRoles(
            r.filter(
              (role) =>
                staffCodes.has(
                  role.code as (typeof Roles)[keyof typeof Roles],
                ) && role.code !== Roles.PATIENT,
            ),
          );
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFormError(
            "Unable to load roles. You need permission to assign roles to create a user.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function clearFieldError(field: keyof FieldErrors) {
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setAttemptedSubmit(true);
    setFormError(null);

    const errors = validateForm({
      email,
      password,
      roleCodes: selectedRoleCodes,
    });
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }

    setSaving(true);
    try {
      const created = await createStaffUser({
        email: email.trim().toLowerCase(),
        password,
        firstName: firstName.trim() || undefined,
        lastName: lastName.trim() || undefined,
        displayName: displayName.trim() || undefined,
        phone: phone.trim() || undefined,
        roleCodes: selectedRoleCodes,
      });
      router.push(`/guardian/users/${created.id}/edit`);
    } catch (error) {
      setFormError(apiErrorMessage(error));
      setSaving(false);
    }
  }

  const showRolesHint = attemptedSubmit && fieldErrors.roles;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 py-8 md:px-6">
      <div>
        <Link
          href="/guardian/users"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← All users
        </Link>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">
          Add user
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Creates an active staff account. Patients self-register through the
          storefront.
        </p>
      </div>

      <form
        onSubmit={onSubmit}
        noValidate
        className="flex flex-col gap-4 rounded-md border border-border bg-card p-4"
      >
        {formError ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {formError}
          </p>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="off"
              value={email}
              aria-invalid={Boolean(fieldErrors.email)}
              aria-describedby={fieldErrors.email ? "email-error" : undefined}
              onChange={(e) => {
                setEmail(e.target.value);
                clearFieldError("email");
              }}
            />
            {fieldErrors.email ? (
              <p id="email-error" className="text-xs text-destructive">
                {fieldErrors.email}
              </p>
            ) : null}
          </div>
          <div className="space-y-1">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              value={password}
              aria-invalid={Boolean(fieldErrors.password)}
              aria-describedby={
                fieldErrors.password ? "password-error" : "password-hint"
              }
              onChange={(e) => {
                setPassword(e.target.value);
                clearFieldError("password");
              }}
            />
            {fieldErrors.password ? (
              <p id="password-error" className="text-xs text-destructive">
                {fieldErrors.password}
              </p>
            ) : (
              <p id="password-hint" className="text-xs text-muted-foreground">
                Minimum {MIN_PASSWORD_LENGTH} characters.
              </p>
            )}
          </div>
          <div className="space-y-1">
            <Label htmlFor="firstName">First name</Label>
            <Input
              id="firstName"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="lastName">Last name</Label>
            <Input
              id="lastName"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="displayName">Display name</Label>
            <Input
              id="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="phone">Phone</Label>
            <Input
              id="phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-2 border-t border-border pt-3">
          <div className="text-sm font-medium">Roles</div>
          <div className="grid gap-1.5 text-sm sm:grid-cols-2">
            {roles.map((role) => (
              <label key={role.code} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={selectedRoleCodes.includes(role.code)}
                  onChange={() => {
                    setSelectedRoleCodes((prev) =>
                      prev.includes(role.code)
                        ? prev.filter((c) => c !== role.code)
                        : [...prev, role.code],
                    );
                    clearFieldError("roles");
                  }}
                />
                {role.name}
              </label>
            ))}
          </div>
          {showRolesHint ? (
            <p className="text-xs text-destructive">{fieldErrors.roles}</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Select at least one staff role.
            </p>
          )}
        </div>

        <div className="flex gap-2">
          <Button type="submit" disabled={saving}>
            {saving ? "Creating…" : "Create user"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push("/guardian/users")}
          >
            Cancel
          </Button>
        </div>
      </form>
    </main>
  );
}
