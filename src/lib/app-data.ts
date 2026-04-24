import { supabase } from "@/integrations/supabase/client";
import { appConfig, isLocalDataMode } from "@/lib/app-config";
import { deleteLocalRow, ensureLocalUser, readLocalTable, saveLocalRow } from "@/lib/local-db";

export type AuthUser = {
  id: string;
  email: string | null;
  displayName: string;
  mode: "local" | "cloud";
};

export type EventoRecord = {
  id: string;
  user_id: string;
  titolo: string;
  descrizione: string | null;
  data_inizio: string;
  data_fine: string | null;
  luogo: string | null;
  cliente: string | null;
  tipo: string;
  created_at?: string;
  updated_at?: string;
};

export type LogisticaItemRecord = {
  id: string;
  user_id: string;
  category: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  price: number | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
};

export type PreventivoVoce = {
  tipo: "interna" | "esterna" | "bordi" | "extra";
  key?: string;
  label: string;
  unita: "m2" | "pezzo";
  quantita: number;
  prezzo: number;
  totale: number;
};

export type PreventivoRecord = {
  id: string;
  user_id: string;
  cliente: string;
  ragione_sociale: string | null;
  luogo: string | null;
  data_lavoro: string | null;
  ora: string | null;
  note: string | null;
  voci: PreventivoVoce[];
  totale: number;
  created_at?: string;
  updated_at?: string;
};

export type GeneratedImageRecord = {
  id: string;
  user_id: string;
  source_url: string | null;
  result_url: string;
  prompt: string;
  color_code: string | null;
  zone: string | null;
  created_at?: string;
  updated_at?: string;
};

const mapCloudUser = (user: { id: string; email?: string | null; user_metadata?: Record<string, unknown> }): AuthUser => ({
  id: user.id,
  email: user.email ?? null,
  displayName:
    typeof user.user_metadata?.display_name === "string" && user.user_metadata.display_name.trim()
      ? user.user_metadata.display_name
      : user.email ?? "Utente PaintPro",
  mode: "cloud",
});

export async function getCurrentUser(): Promise<AuthUser | null> {
  if (isLocalDataMode) {
    const localUser = ensureLocalUser();
    return {
      id: localUser.id,
      email: localUser.email,
      displayName: localUser.displayName,
      mode: "local",
    };
  }

  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  return mapCloudUser(data.user);
}

async function requireCurrentUser() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Utente non disponibile");
  return user;
}

export async function listEventi() {
  if (isLocalDataMode) {
    const user = await requireCurrentUser();
    return readLocalTable<EventoRecord>("eventi")
      .filter((item) => item.user_id === user.id)
      .sort((a, b) => a.data_inizio.localeCompare(b.data_inizio));
  }

  const { data, error } = await supabase.from("eventi").select("*").order("data_inizio", { ascending: true });
  if (error) throw error;
  return (data ?? []) as EventoRecord[];
}

export async function saveEvento(payload: Omit<EventoRecord, "id" | "user_id" | "created_at" | "updated_at">, id?: string) {
  const user = await requireCurrentUser();
  const record = { ...payload, user_id: user.id };

  if (isLocalDataMode) {
    return saveLocalRow<EventoRecord>("eventi", { ...record, id });
  }

  if (id) {
    const { error } = await supabase.from("eventi").update(record).eq("id", id);
    if (error) throw error;
    return { ...record, id } as EventoRecord;
  }

  const { data, error } = await supabase.from("eventi").insert(record).select("*").single();
  if (error) throw error;
  return data as EventoRecord;
}

export async function deleteEvento(id: string) {
  if (isLocalDataMode) return deleteLocalRow("eventi", id);
  const { error } = await supabase.from("eventi").delete().eq("id", id);
  if (error) throw error;
}

export async function listLogisticaItems() {
  if (isLocalDataMode) {
    const user = await requireCurrentUser();
    return readLocalTable<LogisticaItemRecord>("logistica_items")
      .filter((item) => item.user_id === user.id)
      .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
  }

  const { data, error } = await supabase.from("logistica_items").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as LogisticaItemRecord[];
}

export async function saveLogisticaItem(
  payload: Omit<LogisticaItemRecord, "id" | "user_id" | "created_at" | "updated_at">,
  id?: string,
) {
  const user = await requireCurrentUser();
  const record = { ...payload, user_id: user.id };

  if (isLocalDataMode) {
    return saveLocalRow<LogisticaItemRecord>("logistica_items", { ...record, id });
  }

  if (id) {
    const { error } = await supabase.from("logistica_items").update(record).eq("id", id);
    if (error) throw error;
    return { ...record, id } as LogisticaItemRecord;
  }

  const { data, error } = await supabase.from("logistica_items").insert(record).select("*").single();
  if (error) throw error;
  return data as LogisticaItemRecord;
}

export async function moveLogisticaItem(id: string, category: string) {
  if (isLocalDataMode) {
    const current = readLocalTable<LogisticaItemRecord>("logistica_items").find((item) => item.id === id);
    if (!current) return;
    saveLocalRow<LogisticaItemRecord>("logistica_items", { ...current, category, id });
    return;
  }

  const { error } = await supabase.from("logistica_items").update({ category }).eq("id", id);
  if (error) throw error;
}

export async function deleteLogisticaItem(id: string) {
  if (isLocalDataMode) return deleteLocalRow("logistica_items", id);
  const { error } = await supabase.from("logistica_items").delete().eq("id", id);
  if (error) throw error;
}

export async function listPreventivi() {
  if (isLocalDataMode) {
    const user = await requireCurrentUser();
    return readLocalTable<PreventivoRecord>("preventivi")
      .filter((item) => item.user_id === user.id)
      .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
  }

  const { data, error } = await supabase.from("preventivi").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as PreventivoRecord[];
}

export async function savePreventivo(
  payload: Omit<PreventivoRecord, "id" | "user_id" | "created_at" | "updated_at">,
  id?: string,
) {
  const user = await requireCurrentUser();
  const record = { ...payload, user_id: user.id };

  if (isLocalDataMode) {
    return saveLocalRow<PreventivoRecord>("preventivi", { ...record, id });
  }

  if (id) {
    const { error } = await supabase.from("preventivi").update(record).eq("id", id);
    if (error) throw error;
    return { ...record, id } as PreventivoRecord;
  }

  const { data, error } = await supabase.from("preventivi").insert(record).select("*").single();
  if (error) throw error;
  return data as PreventivoRecord;
}

export async function deletePreventivo(id: string) {
  if (isLocalDataMode) return deleteLocalRow("preventivi", id);
  const { error } = await supabase.from("preventivi").delete().eq("id", id);
  if (error) throw error;
}

export async function listGeneratedImages() {
  if (isLocalDataMode) {
    const user = await requireCurrentUser();
    return readLocalTable<GeneratedImageRecord>("generated_images")
      .filter((item) => item.user_id === user.id)
      .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
  }

  const { data, error } = await supabase
    .from("generated_images")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(12);

  if (error) throw error;
  return (data ?? []) as GeneratedImageRecord[];
}

export async function saveGeneratedImage(payload: Omit<GeneratedImageRecord, "id" | "user_id" | "created_at" | "updated_at">) {
  const user = await requireCurrentUser();

  if (isLocalDataMode || !appConfig.persistRemoteGeneratedImages) {
    const existing = readLocalTable<GeneratedImageRecord>("generated_images").find(
      (item) => item.user_id === user.id && item.result_url === payload.result_url && item.prompt === payload.prompt,
    );

    if (existing) return existing;

    return saveLocalRow<GeneratedImageRecord>("generated_images", {
      ...payload,
      user_id: user.id,
    });
  }

  const { data, error } = await supabase
    .from("generated_images")
    .insert({ ...payload, user_id: user.id })
    .select("*")
    .single();

  if (error) throw error;
  return data as GeneratedImageRecord;
}

export async function deleteGeneratedImage(id: string) {
  if (isLocalDataMode || !appConfig.persistRemoteGeneratedImages) {
    deleteLocalRow("generated_images", id);
    return;
  }

  const { error } = await supabase.from("generated_images").delete().eq("id", id);
  if (error) throw error;
}
