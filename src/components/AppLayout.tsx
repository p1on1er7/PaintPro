import { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { isLocalDataMode } from "@/lib/app-config";
import { LogOut, Paintbrush } from "lucide-react";
import BottomNav from "./BottomNav";

export default function AppLayout({ children, title, subtitle }: { children: ReactNode; title?: string; subtitle?: string }) {
  const { signOut, user } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-soft pb-24">
      <header className="sticky top-0 z-30 bg-gradient-brand text-primary-foreground shadow-sm">
        <div className="max-w-xl mx-auto px-4 pt-[env(safe-area-inset-top,12px)] pb-3 flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-white/10 flex items-center justify-center">
            <Paintbrush className="h-5 w-5 text-accent" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="font-display font-semibold text-lg leading-tight truncate">{title ?? "PaintPro"}</h1>
            <p className="text-xs text-primary-foreground/70 truncate">{subtitle ?? user?.displayName ?? user?.email}</p>
          </div>
          {!isLocalDataMode && (
            <Button
              variant="ghost"
              size="icon"
              onClick={async () => { await signOut(); navigate("/auth"); }}
              className="text-primary-foreground hover:bg-white/10 h-9 w-9"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          )}
        </div>
      </header>
      <main className="max-w-xl mx-auto px-4 py-4 animate-fade-in">
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
