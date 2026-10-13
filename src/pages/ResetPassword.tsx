import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ResetPassword() {
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let active = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (active && event === "PASSWORD_RECOVERY" && session) setReady(true);
    });
    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (active && session) setReady(true);
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const savePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password !== confirm) {
      setMessage("Le password non coincidono.");
      return;
    }
    setSaving(true);
    setMessage("");
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    await supabase.auth.signOut();
    setSaved(true);
    setMessage("Password aggiornata. Ora puoi accedere con quella nuova.");
  };

  return (
    <div className="min-h-screen bg-gradient-soft flex items-center justify-center p-4">
      <Card className="w-full max-w-md p-6 space-y-4">
        <h1 className="text-2xl font-display font-semibold">Nuova password PaintPro</h1>
        {ready && !saved ? (
          <form onSubmit={savePassword} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="new-password">Nuova password</Label>
              <Input id="new-password" type="password" minLength={8} required autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm-password">Ripeti la nuova password</Label>
              <Input id="confirm-password" type="password" minLength={8} required autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} />
            </div>
            <Button type="submit" disabled={saving}>{saving ? "Salvataggio..." : "Salva password"}</Button>
          </form>
        ) : !saved ? <p>Apri il link di recupero ricevuto via email per scegliere una nuova password.</p> : null}
        {message && <p role="status" className="text-sm">{message}</p>}
        <a className="text-sm underline" href="/">Torna all'accesso</a>
      </Card>
    </div>
  );
}
