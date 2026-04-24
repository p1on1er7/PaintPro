const normalize = (value?: string) => value?.trim().toLowerCase() ?? "";

const appMode = normalize(import.meta.env.VITE_APP_MODE);
const aiMode = normalize(import.meta.env.VITE_AI_MODE);
const configuredAiBackendUrl = import.meta.env.VITE_AI_BACKEND_URL?.trim() || "";

export const supabaseConfigured = Boolean(
  import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
);

export const isLocalDataMode = appMode !== "cloud" || !supabaseConfigured;
export const aiBackendUrl = configuredAiBackendUrl || (import.meta.env.PROD ? "/api/paintpro-ai" : "");
export const hasAiBackend = Boolean(aiBackendUrl);

export const effectiveAiMode = (() => {
  if (aiMode === "off" || aiMode === "local" || aiMode === "cloud" || aiMode === "hybrid") {
    return aiMode;
  }

  if (isLocalDataMode) return "local";
  return "hybrid";
})();

export const appConfig = {
  appMode: isLocalDataMode ? "local" : "cloud",
  aiMode: effectiveAiMode,
  preferLocalAi: effectiveAiMode === "local" || effectiveAiMode === "hybrid",
  useCloudAi: (hasAiBackend || supabaseConfigured) && (effectiveAiMode === "cloud" || effectiveAiMode === "hybrid"),
  aiBackendUrl,
  ollamaUrl: import.meta.env.VITE_OLLAMA_URL?.trim() || "http://127.0.0.1:11434",
  ollamaModel: import.meta.env.VITE_OLLAMA_MODEL?.trim() || "llama3.1:8b-instruct-q4_K_M",
  localImageApiUrl: import.meta.env.VITE_LOCAL_IMAGE_API_URL?.trim() || "",
  persistRemoteGeneratedImages: normalize(import.meta.env.VITE_PERSIST_REMOTE_GENERATED_IMAGES) === "true",
  localOwnerName: import.meta.env.VITE_LOCAL_OWNER_NAME?.trim() || "Titolare PaintPro",
  localOwnerEmail: import.meta.env.VITE_LOCAL_OWNER_EMAIL?.trim() || "locale@paintpro.app",
} as const;

export const hasLocalImageApi = Boolean(appConfig.localImageApiUrl);
export const hasOllama = Boolean(appConfig.ollamaUrl);
