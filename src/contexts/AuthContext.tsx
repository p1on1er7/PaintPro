import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { isLocalDataMode } from "@/lib/app-config";
import { AuthUser } from "@/lib/app-data";
import { ensureLocalUser } from "@/lib/local-db";
import { isSupabaseReady, supabase, supabaseInitError } from "@/integrations/supabase/client";

interface AuthContextValue {
  user: AuthUser | null;
  sessionToken: string | null;
  loading: boolean;
  authIssue: string | null;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  sessionToken: null,
  loading: true,
  authIssue: null,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [authIssue, setAuthIssue] = useState<string | null>(null);

  useEffect(() => {
    if (isLocalDataMode) {
      const localUser = ensureLocalUser();
      setUser({
        id: localUser.id,
        email: localUser.email,
        displayName: localUser.displayName,
        mode: "local",
      });
      setSessionToken(null);
      setAuthIssue(null);
      setLoading(false);
      return;
    }

    const mapCloudUser = (rawUser: { id: string; email?: string | null; user_metadata?: Record<string, unknown> } | null) =>
      rawUser
        ? {
            id: rawUser.id,
            email: rawUser.email ?? null,
            displayName:
              typeof rawUser.user_metadata?.display_name === "string" && rawUser.user_metadata.display_name.trim()
                ? rawUser.user_metadata.display_name
                : rawUser.email ?? "Utente PaintPro",
            mode: "cloud" as const,
          }
        : null;

    if (!isSupabaseReady) {
      setAuthIssue(
        supabaseInitError ??
          "Supabase e' configurato in modo non valido. Controlla VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY su Vercel.",
      );
      setLoading(false);
      return;
    }

    let active = true;
    const loadingTimeout = window.setTimeout(() => {
      if (!active) return;
      setAuthIssue("Timeout inizializzazione autenticazione cloud.");
      setLoading(false);
    }, 8000);

    try {
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((_event, s) => {
        if (!active) return;
        setSessionToken(s?.access_token ?? null);
        setUser(mapCloudUser(s?.user ?? null));
      });

      supabase.auth
        .getSession()
        .then(({ data: { session: s } }) => {
          if (!active) return;
          setSessionToken(s?.access_token ?? null);
          setUser(mapCloudUser(s?.user ?? null));
          setAuthIssue(null);
          setLoading(false);
          window.clearTimeout(loadingTimeout);
        })
        .catch((error) => {
          if (!active) return;
          console.error("Auth bootstrap error:", error);
          setAuthIssue(error instanceof Error ? error.message : "Errore autenticazione cloud.");
          setLoading(false);
          window.clearTimeout(loadingTimeout);
        });

      return () => {
        active = false;
        window.clearTimeout(loadingTimeout);
        subscription.unsubscribe();
      };
    } catch (error) {
      console.error("Auth setup error:", error);
      setAuthIssue(error instanceof Error ? error.message : "Errore autenticazione cloud.");
      setLoading(false);
      window.clearTimeout(loadingTimeout);
      return () => {
        active = false;
      };
    }
  }, []);

  const signOut = async () => {
    if (isLocalDataMode) return;
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, sessionToken, loading, authIssue, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
