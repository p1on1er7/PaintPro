import { useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase, supabaseProjectHost, testSupabaseConnection } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { isLocalDataMode } from "@/lib/app-config";
import { toast } from "sonner";
import { Loader2, Paintbrush } from "lucide-react";

export default function Auth() {
  const { user, loading } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [diagnostic, setDiagnostic] = useState<string | null>(null);
  const [checkingSupabase, setCheckingSupabase] = useState(false);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-accent" />
      </div>
    );
  }
  if (user) return <Navigate to="/" replace />;

  if (isLocalDataMode) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/`,
            data: { display_name: displayName || email.split("@")[0] },
          },
        });
        if (error) throw error;
        toast.success("Account creato! Sei dentro.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Bentornato!");
      }
    } catch (err: any) {
      const message = err?.message ?? "Errore";
      toast.error(message);
      setDiagnostic(message);
    } finally {
      setSubmitting(false);
    }
  };

  const runDiagnostic = async () => {
    setCheckingSupabase(true);
    try {
      const result = await testSupabaseConnection();
      const details = [`Host configurato: ${supabaseProjectHost}`, result.message];
      if (result.endpoint) details.push(`Endpoint testato: ${result.endpoint}`);
      setDiagnostic(details.join("\n"));
      if (result.ok) toast.success("Supabase raggiungibile");
      else toast.error("Supabase non raggiungibile");
    } finally {
      setCheckingSupabase(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-soft flex items-center justify-center p-4">
      <div className="w-full max-w-md animate-fade-in">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-gradient-brand shadow-elevated mb-4">
            <Paintbrush className="h-8 w-8 text-accent" />
          </div>
          <h1 className="text-3xl font-display font-semibold">PaintPro</h1>
          <p className="text-muted-foreground mt-1">Il gestionale per decoratori professionisti</p>
        </div>

        <Card className="p-6 shadow-elevated">
          <div className="flex gap-2 mb-6 p-1 bg-muted rounded-xl">
            <button
              type="button"
              onClick={() => setMode("signin")}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${mode === "signin" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"}`}
            >
              Accedi
            </button>
            <button
              type="button"
              onClick={() => setMode("signup")}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${mode === "signup" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"}`}
            >
              Registrati
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "signup" && (
              <div className="space-y-1.5">
                <Label htmlFor="displayName">Nome</Label>
                <Input
                  id="displayName"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Mario Rossi"
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@esempio.it"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimo 6 caratteri"
              />
            </div>
            <Button
              type="submit"
              disabled={submitting}
              className="w-full bg-accent hover:bg-accent/90 text-accent-foreground h-11 text-base font-semibold"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : mode === "signin" ? "Accedi" : "Crea account"}
            </Button>
          </form>

          {diagnostic && (
            <div className="mt-4 rounded-lg border border-border bg-muted p-3 text-xs text-muted-foreground whitespace-pre-wrap break-words">
              {diagnostic}
            </div>
          )}

          <Button
            type="button"
            variant="outline"
            onClick={runDiagnostic}
            disabled={checkingSupabase}
            className="mt-3 w-full"
          >
            {checkingSupabase ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verifica connessione Supabase"}
          </Button>
        </Card>
        <p className="text-center text-xs text-muted-foreground mt-6">
          Tutti i tuoi dati sono salvati in cloud, sicuri e privati.
        </p>
      </div>
    </div>
  );
}
