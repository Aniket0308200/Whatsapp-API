"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";

export interface LocalUser {
  id: string;
  email: string;
  user_metadata?: Record<string, unknown>;
  app_metadata?: Record<string, unknown>;
  aud?: string;
  created_at?: string;
}

interface Profile {
  id: string;
  full_name: string | null;
  email: string;
  avatar_url: string | null;
  role: string | null;
}

interface AuthContextValue {
  user: LocalUser | null;
  profile: Profile | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<LocalUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchMe = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me", { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json();
      if (data.user) {
        setUser(data.user);
        if (data.profile) setProfile(data.profile);
      } else {
        setUser(null);
        setProfile(null);
      }
    } catch (err) {
      console.error("[AuthProvider] fetchMe error:", err);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    const safetyTimer = setTimeout(() => {
      if (mounted) {
        console.warn("[AuthProvider] fetchMe timed out after 3s");
        setLoading(false);
      }
    }, 3000);

    const init = async () => {
      try {
        await fetchMe();
      } catch (err) {
        console.error("[AuthProvider] init threw:", err);
      } finally {
        if (mounted) setLoading(false);
        clearTimeout(safetyTimer);
      }
    };

    init();

    return () => {
      mounted = false;
      clearTimeout(safetyTimer);
    };
  }, [fetchMe]);

  const signOut = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    setUser(null);
    setProfile(null);
    window.location.href = "/login";
  }, []);

  const refreshProfile = useCallback(async () => {
    await fetchMe();
  }, [fetchMe]);

  return (
    <AuthContext.Provider value={{ user, profile, loading, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    return {
      user: null,
      profile: null,
      loading: false,
      signOut: async () => { window.location.href = "/login"; },
      refreshProfile: async () => {},
    };
  }
  return ctx;
}
