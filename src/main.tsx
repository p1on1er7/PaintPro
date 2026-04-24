import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import AppErrorBoundary from "@/components/AppErrorBoundary";
import { registerPaintProPwa } from "@/lib/pwa";
import "@fontsource/sora/400.css";
import "@fontsource/sora/500.css";
import "@fontsource/sora/600.css";
import "@fontsource/sora/700.css";
import "@fontsource/manrope/400.css";
import "@fontsource/manrope/500.css";
import "@fontsource/manrope/600.css";
import "@fontsource/manrope/700.css";

registerPaintProPwa();

window.addEventListener("error", (event) => {
  const root = document.getElementById("root");
  if (!root) return;
  root.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;background:#f8fafc;color:#0f172a;font-family:sans-serif;">
      <div style="max-width:720px;width:100%;background:white;border:1px solid #e2e8f0;border-radius:16px;padding:20px;">
        <h1 style="margin:0 0 12px;font-size:20px;">Errore JavaScript in avvio</h1>
        <pre style="white-space:pre-wrap;word-break:break-word;font-size:12px;margin:0;">${String(event.message || "Errore sconosciuto")}</pre>
      </div>
    </div>
  `;
});

window.addEventListener("unhandledrejection", (event) => {
  const root = document.getElementById("root");
  if (!root) return;
  const message =
    event.reason instanceof Error ? event.reason.message : typeof event.reason === "string" ? event.reason : JSON.stringify(event.reason);
  root.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;background:#f8fafc;color:#0f172a;font-family:sans-serif;">
      <div style="max-width:720px;width:100%;background:white;border:1px solid #e2e8f0;border-radius:16px;padding:20px;">
        <h1 style="margin:0 0 12px;font-size:20px;">Promise fallita in avvio</h1>
        <pre style="white-space:pre-wrap;word-break:break-word;font-size:12px;margin:0;">${String(message || "Errore sconosciuto")}</pre>
      </div>
    </div>
  `;
});

createRoot(document.getElementById("root")!).render(
  <AppErrorBoundary>
    <App />
  </AppErrorBoundary>,
);
