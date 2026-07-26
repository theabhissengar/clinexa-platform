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

import {
  loginRequest,
  logoutRequest,
  refreshRequest,
} from "@/features/auth/api/auth-api";
import type { AuthUser, LoginCredentials } from "@/features/auth/types";
import { registerAuthHandlers } from "@/services/api-client";

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

type AuthContextValue = {
  user: AuthUser | null;
  status: AuthStatus;
  accessToken: string | null;
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

type AuthProviderProps = {
  children: ReactNode;
};

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");
  const accessTokenRef = useRef<string | null>(null);

  const clearSession = useCallback(() => {
    accessTokenRef.current = null;
    setAccessToken(null);
    setUser(null);
    setStatus("unauthenticated");
  }, []);

  const applyAccessToken = useCallback((token: string) => {
    accessTokenRef.current = token;
    setAccessToken(token);
  }, []);

  useEffect(() => {
    registerAuthHandlers({
      getAccessToken: () => accessTokenRef.current,
      setAccessToken: (token: string) => {
        applyAccessToken(token);
        setStatus("authenticated");
      },
      onUnauthorized: () => {
        clearSession();
        if (
          typeof window !== "undefined" &&
          !window.location.pathname.startsWith("/login")
        ) {
          window.location.assign("/login");
        }
      },
    });
  }, [applyAccessToken, clearSession]);

  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      try {
        const tokens = await refreshRequest();
        if (cancelled) {
          return;
        }
        applyAccessToken(tokens.accessToken);
        setUser(tokens.user);
        setStatus("authenticated");
      } catch {
        if (!cancelled) {
          clearSession();
        }
      }
    }

    void restoreSession();

    return () => {
      cancelled = true;
    };
  }, [applyAccessToken, clearSession]);

  const login = useCallback(
    async (credentials: LoginCredentials) => {
      const tokens = await loginRequest(credentials);
      applyAccessToken(tokens.accessToken);
      setUser(tokens.user);
      setStatus("authenticated");
    },
    [applyAccessToken],
  );

  const logout = useCallback(async () => {
    try {
      await logoutRequest();
    } catch {
      // Always clear local session even if the API call fails
    } finally {
      clearSession();
    }
  }, [clearSession]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      status,
      accessToken,
      login,
      logout,
    }),
    [user, status, accessToken, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
