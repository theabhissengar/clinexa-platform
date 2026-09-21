"use client";

import { useCallback, useEffect, useState } from "react";

export type DashboardResource<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
  retry: () => void;
};

export function useDashboardResource<T>(
  enabled: boolean,
  load: () => Promise<T>,
  errorMessage: string,
): DashboardResource<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let cancelled = false;

    void Promise.resolve()
      .then(() => {
        if (!cancelled) {
          setLoading(true);
          setError(null);
        }
        return load();
      })
      .then((result) => {
        if (!cancelled) {
          setData(result);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError(errorMessage);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [attempt, enabled, errorMessage, load]);

  const retry = useCallback(() => {
    setAttempt((current) => current + 1);
  }, []);

  return { data, loading, error, retry };
}
