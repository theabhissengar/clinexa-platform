"use client";

import { useEffect, useState } from "react";

import { ClearableSearchInput } from "@/components/patterns/clearable-search-input";

export type ModuleSearchResult = {
  id: string;
  label: string;
  sublabel?: string;
};

type ModuleDetailSearchProps = {
  searchFn: (query: string) => Promise<ModuleSearchResult[]>;
  onSelect: (id: string) => void;
  placeholder?: string;
  className?: string;
  minQueryLength?: number;
};

export function ModuleDetailSearch({
  searchFn,
  onSelect,
  placeholder = "Search…",
  className,
  minQueryLength = 2,
}: ModuleDetailSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ModuleSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = query.trim();
  const canSearch = trimmed.length >= minQueryLength;
  const visibleResults = canSearch ? results : [];
  const visibleError = canSearch ? error : null;
  const showLoading = canSearch && loading;

  useEffect(() => {
    if (!canSearch) return;

    let cancelled = false;
    const handle = window.setTimeout(() => {
      setLoading(true);
      setError(null);
      void searchFn(trimmed)
        .then((rows) => {
          if (cancelled) return;
          setResults(rows);
        })
        .catch(() => {
          if (cancelled) return;
          setResults([]);
          setError("Unable to search.");
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [trimmed, canSearch, searchFn]);

  return (
    <div className={className}>
      <ClearableSearchInput
        value={query}
        onChange={setQuery}
        onClear={() => {
          setQuery("");
          setResults([]);
          setError(null);
          setLoading(false);
        }}
        placeholder={placeholder}
        aria-label={placeholder}
        className="w-full max-w-md"
      />
      {showLoading ? (
        <p className="mt-2 text-xs text-muted-foreground">Searching…</p>
      ) : null}
      {visibleError ? (
        <p className="mt-2 text-xs text-destructive">{visibleError}</p>
      ) : null}
      {visibleResults.length > 0 ? (
        <ul className="mt-2 max-w-md rounded-md border border-border bg-popover text-sm shadow-sm">
          {visibleResults.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                className="flex w-full flex-col gap-0.5 px-3 py-2 text-left hover:bg-muted/60"
                onClick={() => {
                  onSelect(row.id);
                  setQuery("");
                  setResults([]);
                  setError(null);
                  setLoading(false);
                }}
              >
                <span className="font-medium">{row.label}</span>
                {row.sublabel ? (
                  <span className="text-xs text-muted-foreground">
                    {row.sublabel}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
