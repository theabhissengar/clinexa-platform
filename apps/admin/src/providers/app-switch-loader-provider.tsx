"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";

import { BrandLoader } from "@/components/patterns/brand-loader";
import {
  CONTEXT_LABEL,
  resolveContextFromPathname,
  type PlatformContext,
} from "@/lib/platform-context";

type AppSwitchLoaderContextValue = {
  /**
   * Start a CRM ↔ Guardian switch wait.
   * Overlay appears only after a short delay so instant switches never flash.
   */
  beginSwitch: (target: PlatformContext) => void;
};

const AppSwitchLoaderContext =
  createContext<AppSwitchLoaderContextValue | null>(null);

const SHOW_DELAY_MS = 180;
const MIN_VISIBLE_MS = 280;
const SAFETY_TIMEOUT_MS = 8_000;

/**
 * Tracks CRM ↔ Guardian context switches and shows BrandLoader only when
 * navigation actually takes long enough to matter.
 */
export function AppSwitchLoaderProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [pendingTarget, setPendingTarget] = useState<PlatformContext | null>(
    null,
  );
  const [visible, setVisible] = useState(false);
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const safetyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shownAt = useRef<number | null>(null);

  const clearTimers = useCallback(() => {
    if (showTimer.current) clearTimeout(showTimer.current);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (safetyTimer.current) clearTimeout(safetyTimer.current);
    showTimer.current = null;
    hideTimer.current = null;
    safetyTimer.current = null;
  }, []);

  const finish = useCallback(() => {
    clearTimers();
    setPendingTarget(null);
    setVisible((isVisible) => {
      if (!isVisible || shownAt.current === null) {
        shownAt.current = null;
        return false;
      }
      const elapsed = Date.now() - shownAt.current;
      const remaining = Math.max(0, MIN_VISIBLE_MS - elapsed);
      if (remaining === 0) {
        shownAt.current = null;
        return false;
      }
      hideTimer.current = setTimeout(() => {
        setVisible(false);
        shownAt.current = null;
      }, remaining);
      return true;
    });
  }, [clearTimers]);

  const beginSwitch = useCallback(
    (target: PlatformContext) => {
      const current = resolveContextFromPathname(
        typeof window !== "undefined" ? window.location.pathname : "",
      );
      if (current === target) {
        return;
      }

      clearTimers();
      setPendingTarget(target);
      setVisible(false);
      shownAt.current = null;

      showTimer.current = setTimeout(() => {
        setVisible(true);
        shownAt.current = Date.now();
      }, SHOW_DELAY_MS);

      safetyTimer.current = setTimeout(() => {
        finish();
      }, SAFETY_TIMEOUT_MS);
    },
    [clearTimers, finish],
  );

  useEffect(() => {
    if (!pendingTarget) {
      return;
    }
    const arrived = resolveContextFromPathname(pathname);
    if (arrived !== pendingTarget) {
      return;
    }
    // Defer so we don't call setState synchronously inside the effect body.
    const timer = setTimeout(() => {
      finish();
    }, 0);
    return () => clearTimeout(timer);
  }, [pathname, pendingTarget, finish]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  const value = useMemo(() => ({ beginSwitch }), [beginSwitch]);
  const label = pendingTarget
    ? `Opening ${CONTEXT_LABEL[pendingTarget]}…`
    : "Switching…";

  return (
    <AppSwitchLoaderContext.Provider value={value}>
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        {children}
        {visible ? (
          <BrandLoader variant="overlay" label={label} />
        ) : null}
      </div>
    </AppSwitchLoaderContext.Provider>
  );
}

export function useAppSwitchLoader(): AppSwitchLoaderContextValue {
  const ctx = useContext(AppSwitchLoaderContext);
  if (!ctx) {
    return {
      beginSwitch: () => {
        /* no-op outside shell */
      },
    };
  }
  return ctx;
}
