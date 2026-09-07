"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { MedicalProfile, MedicalProfileEntry } from "@/features/users/types";

const SECTIONS: Array<{
  key: keyof MedicalProfile;
  label: string;
}> = [
  { key: "allergies", label: "Allergies" },
  { key: "conditions", label: "Medical conditions" },
  { key: "medications", label: "Current medications" },
  { key: "additionalNotes", label: "Additional notes" },
];

function emptyProfile(): MedicalProfile {
  return {
    allergies: [],
    conditions: [],
    medications: [],
    additionalNotes: [],
  };
}

function normalizeProfile(value: MedicalProfile | null | undefined): MedicalProfile {
  const base = emptyProfile();
  if (!value) return base;
  for (const section of SECTIONS) {
    const rows = value[section.key];
    if (Array.isArray(rows)) {
      base[section.key] = rows.filter(
        (row) => row && typeof row.id === "string" && typeof row.text === "string",
      );
    }
  }
  return base;
}

function newEntry(text = ""): MedicalProfileEntry {
  return { id: crypto.randomUUID(), text };
}

type Props = {
  value: MedicalProfile | null;
  onChange: (value: MedicalProfile) => void;
  disabled?: boolean;
};

export function MedicalProfileEditor({ value, onChange, disabled }: Props) {
  const profile = normalizeProfile(value);

  function updateSection(
    key: keyof MedicalProfile,
    rows: MedicalProfileEntry[],
  ) {
    onChange({ ...profile, [key]: rows });
  }

  return (
    <div className="space-y-4">
      {SECTIONS.map((section) => {
        const rows = profile[section.key] ?? [];
        return (
          <div key={section.key} className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label>{section.label}</Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={disabled}
                onClick={() =>
                  updateSection(section.key, [...rows, newEntry()])
                }
              >
                Add item
              </Button>
            </div>
            {rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No entries.</p>
            ) : (
              <ul className="space-y-2">
                {rows.map((row, index) => (
                  <li key={row.id} className="flex gap-2">
                    <Input
                      value={row.text}
                      disabled={disabled}
                      onChange={(event) => {
                        const next = rows.map((entry, i) =>
                          i === index
                            ? { ...entry, text: event.target.value }
                            : entry,
                        );
                        updateSection(section.key, next);
                      }}
                      placeholder={`${section.label} entry`}
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={disabled}
                      onClick={() =>
                        updateSection(
                          section.key,
                          rows.filter((entry) => entry.id !== row.id),
                        )
                      }
                    >
                      Remove
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
