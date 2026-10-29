"use client";

import { AppSelect } from "@/components/patterns";
import { Input } from "@/components/ui/input";
import {
  ADDRESS_COUNTRY_OPTIONS,
  ADDRESS_REGION_OPTIONS,
  type UserAddressForm,
} from "@/features/users/lib/address";
import {
  sanitizePersonName,
  sanitizePostalCode,
} from "@/features/users/lib/user-field-validation";

type AddressFieldsEditorProps = {
  label: string;
  value: UserAddressForm;
  onChange: (next: UserAddressForm) => void;
};

/** Identical address editor for CRM + Guardian (synced JSON shape). */
export function AddressFieldsEditor({
  label,
  value,
  onChange,
}: AddressFieldsEditorProps) {
  return (
    <div className="space-y-2 rounded-xl border border-border/70 bg-muted/15 p-3 dark:border-white/10">
      <div className="text-sm font-medium">{label}</div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Input
          placeholder="First name"
          aria-label={`${label} first name`}
          value={value.firstName}
          onChange={(e) =>
            onChange({
              ...value,
              firstName: sanitizePersonName(e.target.value),
            })
          }
        />
        <Input
          placeholder="Last name"
          aria-label={`${label} last name`}
          value={value.lastName}
          onChange={(e) =>
            onChange({
              ...value,
              lastName: sanitizePersonName(e.target.value),
            })
          }
        />
      </div>
      <Input
        placeholder="Line 1"
        aria-label={`${label} line 1`}
        value={value.line1}
        maxLength={120}
        onChange={(e) => onChange({ ...value, line1: e.target.value })}
      />
      <Input
        placeholder="Line 2"
        aria-label={`${label} line 2`}
        value={value.line2}
        maxLength={120}
        onChange={(e) => onChange({ ...value, line2: e.target.value })}
      />
      <Input
        placeholder="City"
        aria-label={`${label} city`}
        value={value.city}
        maxLength={80}
        onChange={(e) => onChange({ ...value, city: e.target.value })}
      />
      <AppSelect
        value={value.region}
        onValueChange={(next) => onChange({ ...value, region: next })}
        aria-label={`${label} region`}
        className="w-full"
        options={[...ADDRESS_REGION_OPTIONS]}
      />
      <Input
        placeholder="Postal code"
        aria-label={`${label} postal code`}
        value={value.postalCode}
        onChange={(e) =>
          onChange({
            ...value,
            postalCode: sanitizePostalCode(e.target.value),
          })
        }
      />
      <AppSelect
        value={value.country}
        onValueChange={(next) => onChange({ ...value, country: next })}
        aria-label={`${label} country`}
        className="w-full"
        options={[...ADDRESS_COUNTRY_OPTIONS]}
      />
    </div>
  );
}
