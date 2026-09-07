"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function tagsFromValue(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(String).map((t) => t.trim()).filter(Boolean);
  }
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, val]) => {
      if (val === true || val === null || val === "") return [key];
      return [`${key}:${String(val)}`];
    });
  }
  return [];
}

function valueFromTags(tags: string[], original: unknown): Record<string, unknown> | string[] {
  if (Array.isArray(original)) {
    return tags;
  }
  const obj: Record<string, unknown> = {};
  for (const tag of tags) {
    const colon = tag.indexOf(":");
    if (colon > 0) {
      obj[tag.slice(0, colon).trim()] = tag.slice(colon + 1).trim();
    } else {
      obj[tag] = true;
    }
  }
  return obj;
}

type Props = {
  id?: string;
  label?: string;
  value: unknown;
  onChange: (value: Record<string, unknown> | string[] | null) => void;
};

export function AdminTagsEditor({
  id = "admin-tags",
  label = "Admin tags",
  value,
  onChange,
}: Props) {
  const initialTags = useMemo(() => tagsFromValue(value), [value]);
  const [tags, setTags] = useState(initialTags);
  const [draft, setDraft] = useState("");

  function sync(next: string[]) {
    setTags(next);
    if (next.length === 0) {
      onChange(null);
      return;
    }
    onChange(valueFromTags(next, value));
  }

  function addTag() {
    const trimmed = draft.trim();
    if (!trimmed || tags.includes(trimmed)) return;
    sync([...tags, trimmed]);
    setDraft("");
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {tags.length === 0 ? (
        <p className="text-xs text-muted-foreground">No tags.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <li
              key={tag}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-xs"
            >
              <span>{tag}</span>
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground"
                aria-label={`Remove ${tag}`}
                onClick={() => sync(tags.filter((row) => row !== tag))}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <Input
          id={id}
          value={draft}
          placeholder="Add tag or key:value"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addTag();
            }
          }}
        />
        <Button type="button" size="sm" variant="outline" onClick={addTag}>
          Add
        </Button>
      </div>
    </div>
  );
}

export function AdminTagsList({ value }: { value: unknown }) {
  const tags = tagsFromValue(value);
  if (tags.length === 0) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <ul className="flex flex-wrap gap-1.5">
      {tags.map((tag) => (
        <li
          key={tag}
          className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-xs"
        >
          {tag}
        </li>
      ))}
    </ul>
  );
}
