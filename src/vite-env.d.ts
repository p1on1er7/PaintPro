/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_MODE?: "local" | "cloud";
  readonly VITE_AI_MODE?: "local" | "hybrid" | "cloud" | "off";
  readonly VITE_AI_BACKEND_URL?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  readonly VITE_OLLAMA_URL?: string;
  readonly VITE_OLLAMA_MODEL?: string;
  readonly VITE_LOCAL_IMAGE_API_URL?: string;
  readonly VITE_PERSIST_REMOTE_GENERATED_IMAGES?: string;
  readonly VITE_LOCAL_OWNER_NAME?: string;
  readonly VITE_LOCAL_OWNER_EMAIL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
