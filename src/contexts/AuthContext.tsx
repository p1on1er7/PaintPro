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

async function verifyPaintProAccess(token: string) {
  const response = await fetch("/api/paintpro-ai", {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(12000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) {
    throw new Error(data.error || "Accesso a PaintPro non disponibile. Riprova tra poco.");
  }
}

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
    let verification = 0;
    const loadingTimeout = window.setTimeout(() => {
      if (!active) return;
      setAuthIssue("Timeout inizializzazione autenticazione cloud.");
      setLoading(false);
    }, 15000);

    const applySession = async (session: { access_token: string; user: { id: string; email?: string | null; user_metadata?: Record<string, unknown> } } | null) => {
      const currentVerification = ++verification;
      if (!session) {
        if (!active) return;
        setSessionToken(null);
        setUser(null);
        setAuthIssue(null);
        setLoading(false);
        window.clearTimeout(loadingTimeout);
        return;
      }

      setLoading(true);
      try {
        await verifyPaintProAccess(session.access_token);
        if (!active || currentVerification !== verification) return;
        setSessionToken(session.access_token);
        setUser(mapCloudUser(session.user));
        setAuthIssue(null);
      } catch (error) {
        if (!active || currentVerification !== verification) return;
        setSessionToken(null);
        setUser(null);
        setAuthIssue(error instanceof Error ? error.message : "Accesso a PaintPro non disponibile.");
      } finally {
        if (active && currentVerification === verification) {
          setLoading(false);
          window.clearTimeout(loadingTimeout);
        }
      }
    };

    try {
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((_event, s) => {
        if (!active) return;
        void applySession(s);
      });

      supabase.auth
        .getSession()
        .then(({ data: { session: s } }) => {
          if (!active) return;
          void applySession(s);
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
    setAuthIssue(null);
  };

  return (
    <AuthContext.Provider value={{ user, sessionToken, loading, authIssue, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
