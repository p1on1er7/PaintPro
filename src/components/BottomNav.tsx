import { NavLink, useLocation } from "react-router-dom";
import { Camera, Wrench, Receipt, CalendarDays } from "lucide-react";

const tabs = [
  { to: "/", label: "Scanner", icon: Camera, exact: true },
  { to: "/logistica", label: "Logistica", icon: Wrench },
  { to: "/preventivi", label: "Preventivi", icon: Receipt },
  { to: "/calendario", label: "Calendario", icon: CalendarDays },
];

export default function BottomNav() {
  const { pathname } = useLocation();
  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 bg-card/95 backdrop-blur-lg border-t border-border">
      <div className="max-w-xl mx-auto grid grid-cols-4 px-2 pb-[env(safe-area-inset-bottom,8px)] pt-2">
        {tabs.map(({ to, label, icon: Icon, exact }) => {
          const active = exact ? pathname === to : pathname.startsWith(to);
          return (
            <NavLink
              key={to}
              to={to}
              end={exact}
              className={`flex flex-col items-center gap-1 py-1.5 rounded-xl transition-colors ${active ? "text-accent" : "text-muted-foreground"}`}
            >
              <Icon className={`h-5 w-5 transition-transform ${active ? "scale-110" : ""}`} strokeWidth={active ? 2.4 : 2} />
              <span className="text-[10px] font-medium">{label}</span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
