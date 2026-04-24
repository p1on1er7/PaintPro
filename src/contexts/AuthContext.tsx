import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { isLocalDataMode } from "@/lib/app-config";
import { AuthUser } from "@/lib/app-data";
import { ensureLocalUser } from "@/lib/local-db";
import { supabase } from "@/integrations/supabase/client";

interface AuthContextValue {
  user: AuthUser | null;
  sessionToken: string | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  sessionToken: null,
  loading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

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

    // Set up listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSessionToken(s?.access_token ?? null);
      setUser(mapCloudUser(s?.user ?? null));
    });

    // Then fetch existing
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSessionToken(s?.access_token ?? null);
      setUser(mapCloudUser(s?.user ?? null));
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    if (isLocalDataMode) return;
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, sessionToken, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
