import { supabase } from "@/integrations/supabase/client";
import { appConfig, hasAiBackend, hasLocalImageApi } from "@/lib/app-config";
import {
  listEventi,
  listLogisticaItems,
  listPreventivi,
  type EventoRecord,
  type LogisticaItemRecord,
  type PreventivoRecord,
} from "@/lib/app-data";

export type AssistantImage = {
  url: string;
  prompt: string;
  colore: string | null;
  zona: string | null;
};

export type AssistantMessage = {
  role: "user" | "assistant";
  content: string;
};

export type AssistantResponse = {
  content: string;
  image: AssistantImage | null;
  savedToHistory: boolean;
  source: "local-rules" | "local-cache" | "local-ollama" | "local-image-api" | "cloud-api" | "cloud-supabase" | "offline";
};

type CachedResponse = AssistantResponse & {
  key: string;
  createdAt: string;
};

const CACHE_KEY = "paintpro.ai-cache.v1";
const MAX_CACHE_ITEMS = 40;
const MAX_REMOTE_MESSAGES = 6;
const MAX_CONTEXT_ITEMS = 18;

const LOGISTICA_LABELS: Record<string, string> = {
  attrezzatura: "Attrezzi e strumenti",
  colori: "Vernici e materiali",
  spesa: "Lista spesa",
  storico: "Storico acquisti",
};

function normalizeText(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function isImageRequest(text: string) {
  const normalized = normalizeText(text);
  return /(genera|simula|mostra|anteprima|render|vedere|preview|fammi vedere)/.test(normalized);
}

function readCache(): CachedResponse[] {
  if (typeof window === "undefined") return [];

  try {
    return JSON.parse(window.localStorage.getItem(CACHE_KEY) ?? "[]") as CachedResponse[];
  } catch {
    return [];
  }
}

function writeCache(entries: CachedResponse[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CACHE_KEY, JSON.stringify(entries.slice(0, MAX_CACHE_ITEMS)));
}

function buildCacheKey(messages: AssistantMessage[], photoDataUrl: string | null) {
  const lastUserMessage = [...messages].reverse().find((message) => message.role === "user")?.content ?? "";
  const photoMarker = photoDataUrl ? `${photoDataUrl.slice(0, 120)}:${photoDataUrl.length}` : "no-photo";
  return `${normalizeText(lastUserMessage)}__${photoMarker}`;
}

function saveCachedResponse(key: string, response: AssistantResponse) {
  const nextEntry: CachedResponse = { ...response, key, createdAt: new Date().toISOString() };
  const cache = readCache().filter((item) => item.key !== key);
  writeCache([nextEntry, ...cache]);
}

function findCachedResponse(key: string) {
  return readCache().find((item) => item.key === key) ?? null;
}

function isAppDataQuestion(text: string) {
  const normalized = normalizeText(text);
  return /(logistica|attrezz|strument|vernici|material|spesa|storico|preventiv|calendari|agenda|appuntament|lavori|cantiere|cosa ho|che cosa ho|elenco|lista)/.test(
    normalized,
  );
}

function formatCurrency(value: number | null | undefined) {
  if (value == null || Number.isNaN(Number(value))) return "";
  return `EUR ${Number(value).toFixed(2)}`;
}

function formatLogistica(items: LogisticaItemRecord[]) {
  if (items.length === 0) return "Non hai ancora elementi salvati in logistica.";

  const grouped = items.reduce<Record<string, LogisticaItemRecord[]>>((acc, item) => {
    (acc[item.category] ??= []).push(item);
    return acc;
  }, {});

  const lines = ["**Logistica salvata:**"];
  Object.entries(grouped).forEach(([category, categoryItems]) => {
    lines.push(`\n**${LOGISTICA_LABELS[category] ?? category} (${categoryItems.length})**`);
    categoryItems.slice(0, MAX_CONTEXT_ITEMS).forEach((item) => {
      const parts = [
        item.quantity != null ? `${item.quantity} ${item.unit ?? ""}`.trim() : "",
        item.metadata?.brand ? String(item.metadata.brand) : "",
        item.metadata?.code ? String(item.metadata.code) : "",
        formatCurrency(item.price),
      ].filter(Boolean);
      lines.push(`- ${item.name}${parts.length ? ` (${parts.join(" | ")})` : ""}`);
    });
  });

  return lines.join("\n");
}

function formatPreventivi(preventivi: PreventivoRecord[]) {
  if (preventivi.length === 0) return "Non hai ancora preventivi salvati.";

  const total = preventivi.reduce((sum, item) => sum + Number(item.totale ?? 0), 0);
  const lines = [`**Preventivi salvati:** ${preventivi.length} preventivi, totale ${formatCurrency(total)}.`];
  preventivi.slice(0, 8).forEach((item) => {
    const date = item.data_lavoro ? `, data ${new Date(item.data_lavoro).toLocaleDateString("it-IT")}` : "";
    lines.push(`- ${item.cliente}: ${formatCurrency(Number(item.totale))}${date}`);
  });
  return lines.join("\n");
}

function formatCalendario(eventi: EventoRecord[]) {
  if (eventi.length === 0) return "Non hai ancora eventi in calendario.";

  const now = Date.now();
  const upcoming = eventi
    .filter((item) => new Date(item.data_inizio).getTime() >= now - 24 * 60 * 60 * 1000)
    .slice(0, 8);
  const list = upcoming.length ? upcoming : eventi.slice(0, 8);

  const lines = ["**Prossimi eventi in calendario:**"];
  list.forEach((item) => {
    const date = new Date(item.data_inizio);
    const when = `${date.toLocaleDateString("it-IT")} ${date.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}`;
    lines.push(`- ${item.titolo}: ${when}${item.cliente ? `, cliente ${item.cliente}` : ""}${item.luogo ? `, luogo ${item.luogo}` : ""}`);
  });
  return lines.join("\n");
}

async function buildAppDataAnswer(prompt: string) {
  if (!isAppDataQuestion(prompt)) return null;

  const normalized = normalizeText(prompt);
  const wantsLogistica = /(logistica|attrezz|strument|vernici|material|spesa|storico|cosa ho|che cosa ho|elenco|lista)/.test(normalized);
  const wantsPreventivi = /preventiv|cliente|prezzo|costo|totale/.test(normalized);
  const wantsCalendario = /calendari|agenda|appuntament|lavori|cantiere|quando/.test(normalized);

  const sections: string[] = [];
  if (wantsLogistica || (!wantsPreventivi && !wantsCalendario)) {
    sections.push(formatLogistica(await listLogisticaItems()));
  }
  if (wantsPreventivi) {
    sections.push(formatPreventivi(await listPreventivi()));
  }
  if (wantsCalendario) {
    sections.push(formatCalendario(await listEventi()));
  }

  return sections.join("\n\n");
}

async function buildAppContextForAi(prompt: string) {
  if (!isAppDataQuestion(prompt)) return "";

  try {
    const [logistica, preventivi, eventi] = await Promise.all([
      listLogisticaItems(),
      listPreventivi(),
      listEventi(),
    ]);

    return [
      "Contesto gestionale PaintPro dell'utente. Usa questi dati solo se pertinenti alla domanda.",
      formatLogistica(logistica),
      formatPreventivi(preventivi),
      formatCalendario(eventi),
    ].join("\n\n");
  } catch {
    return "";
  }
}

function extractArea(prompt: string) {
  const match = prompt
    .replace(",", ".")
    .match(/(\d+(?:\.\d+)?)\s*(m2|mq|metri quadri|metri quadrati)/i);

  if (!match) return null;
  return Number(match[1]);
}

function buildCoverageAdvice(prompt: string) {
  const area = extractArea(prompt);
  if (!area) return null;

  const normalized = normalizeText(prompt);
  const coats = /3 mani|tre mani/.test(normalized) ? 3 : /1 mano|una mano/.test(normalized) ? 1 : 2;
  const multiplier = /grezzo|assorbente|cartongesso/.test(normalized) ? 0.14 : 0.1;
  const liters = Math.ceil(area * coats * multiplier);

  return [
    `Per **${area} m²** ti conviene partire da circa **${liters} litri** di prodotto finito.`,
    `Stima usata: **${coats} mani** e assorbimento medio di **${Math.round(multiplier * 1000)} ml/m²** per mano.`,
    "Aggiungi un 10% di margine se la parete e' grezza, molto assorbente o se il colore e' forte.",
  ].join("\n");
}

function buildRuleBasedAnswer(prompt: string, hasPhoto: boolean) {
  const normalized = normalizeText(prompt);

  const coverage = buildCoverageAdvice(prompt);
  if (coverage) return coverage;

  if (hasPhoto && !isImageRequest(prompt)) {
    return [
      "Ho ricevuto la foto e la tengo pronta.",
      "Per risparmiare chiamate AI non la mando a servizi esterni finche' non chiedi esplicitamente un'**anteprima** o una **simulazione**.",
    ].join("\n");
  }

  if (/primer|fissativo|aggrappante/.test(normalized)) {
    return [
      "**Scelta rapida del fondo:**",
      "- parete farinosa o molto assorbente: fissativo",
      "- supporto liscio o poco aderente: aggrappante",
      "- rasature o ripristini evidenti: primer uniformante prima della finitura",
    ].join("\n");
  }

  if (/quarzo|facciata|estern/.test(normalized)) {
    return [
      "**Per esterni** ti conviene lavorare cosi':",
      "- lavaggio e verifica supporto",
      "- ripristino cavillature e parti distaccate",
      "- fondo uniformante se serve",
      "- finitura al quarzo in 2 mani",
      "Se vuoi, scrivimi i m² e ti preparo una stima rapida di materiale.",
    ].join("\n");
  }

  if (/ral|ncs|cebos|colore/.test(normalized) && !isImageRequest(prompt)) {
    return [
      "Posso aiutarti anche senza AI remota.",
      "Mandami il **codice colore** e dimmi se si tratta di **interno**, **esterno**, **effetto decorativo** o **facciata**: ti suggerisco abbinamenti e ciclo applicativo.",
    ].join("\n");
  }

  if (/preventivo|prezzo|costo/.test(normalized)) {
    return [
      "Per contenere costi API, la parte economica conviene gestirla direttamente nel gestionale.",
      "Usa la sezione **Preventivi** per il calcolo automatico e scrivimi solo i casi particolari o le lavorazioni extra.",
    ].join("\n");
  }

  return null;
}

async function fileToDataUrl(file: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export async function compressImageForAi(file: File, maxSide = 1400, quality = 0.82) {
  const bitmap = await createImageBitmap(file);
  const ratio = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * ratio));
  const height = Math.max(1, Math.round(bitmap.height * ratio));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    return fileToDataUrl(file);
  }

  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  if (!blob) return fileToDataUrl(file);
  return fileToDataUrl(blob);
}

async function callOllama(messages: AssistantMessage[]) {
  const response = await fetch(`${appConfig.ollamaUrl.replace(/\/$/, "")}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: appConfig.ollamaModel,
      stream: false,
      messages: [
        {
          role: "system",
          content:
            "Sei PaintPro AI. Rispondi in italiano, in modo conciso e operativo, per un decoratore professionista.",
        },
        ...messages,
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama non disponibile (${response.status})`);
  }

  const data = await response.json();
  return String(data.message?.content ?? "").trim();
}

async function callLocalImageApi(prompt: string, photoDataUrl: string | null) {
  const response = await fetch(appConfig.localImageApiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt,
      sourceImage: photoDataUrl,
    }),
  });

  if (!response.ok) {
    throw new Error(`Servizio immagini locale non disponibile (${response.status})`);
  }

  const data = await response.json();
  return String(data.url ?? data.image_url ?? data.image ?? data.dataUrl ?? "").trim();
}

async function callHostedAi(messages: AssistantMessage[], photoDataUrl: string | null, appContext: string) {
  const response = await fetch(appConfig.aiBackendUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: messages.slice(-MAX_REMOTE_MESSAGES),
      sourceImage: photoDataUrl,
      appContext,
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.error) {
    throw new Error(data?.error || `Errore backend AI (${response.status})`);
  }

  return data as { content?: string; image?: AssistantImage | null; savedToHistory?: boolean };
}

export async function sendPaintProChat(messages: AssistantMessage[], photoDataUrl: string | null): Promise<AssistantResponse> {
  const lastUserMessage = [...messages].reverse().find((message) => message.role === "user")?.content ?? "";
  const wantsAppData = isAppDataQuestion(lastUserMessage);
  const cacheKey = buildCacheKey(messages, photoDataUrl);
  const cached = wantsAppData ? null : findCachedResponse(cacheKey);
  if (cached) {
    return {
      content: cached.content,
      image: cached.image,
      savedToHistory: cached.savedToHistory,
      source: "local-cache",
    };
  }

  const wantsImage = isImageRequest(lastUserMessage);
  const appDataAnswer = !wantsImage ? await buildAppDataAnswer(lastUserMessage) : null;
  const appContext = !wantsImage ? await buildAppContextForAi(lastUserMessage) : "";
  const localRule = buildRuleBasedAnswer(lastUserMessage, Boolean(photoDataUrl));

  if (appDataAnswer) {
    const response: AssistantResponse = {
      content: appDataAnswer,
      image: null,
      savedToHistory: false,
      source: "local-rules",
    };
    return response;
  }

  if (localRule && !wantsImage) {
    const response: AssistantResponse = {
      content: localRule,
      image: null,
      savedToHistory: false,
      source: "local-rules",
    };
    saveCachedResponse(cacheKey, response);
    return response;
  }

  if (wantsImage && hasLocalImageApi) {
    try {
      const url = await callLocalImageApi(lastUserMessage, photoDataUrl);
      if (url) {
        const response: AssistantResponse = {
          content: "Ecco l'anteprima generata in locale.",
          image: { url, prompt: lastUserMessage, colore: null, zona: null },
          savedToHistory: false,
          source: "local-image-api",
        };
        saveCachedResponse(cacheKey, response);
        return response;
      }
    } catch {
      // Fall through to other providers.
    }
  }

  if (wantsImage && hasAiBackend) {
    try {
      const data = await callHostedAi(messages, photoDataUrl, "");
      const response: AssistantResponse = {
        content: data.content || "Ecco l'anteprima.",
        image: data.image ?? null,
        savedToHistory: Boolean(data.savedToHistory),
        source: "cloud-api",
      };
      saveCachedResponse(cacheKey, response);
      return response;
    } catch (error) {
      const response: AssistantResponse = {
        content:
          `Non sono riuscito a generare l'immagine dal backend AI.\n\n` +
          `Dettaglio: ${error instanceof Error ? error.message : "errore sconosciuto"}\n\n` +
          "Controlla su Vercel `OPENAI_API_KEY`, `OPENAI_IMAGE_MODEL`, `OPENAI_IMAGE_SIZE`, `OPENAI_IMAGE_QUALITY` e poi fai redeploy.",
        image: null,
        savedToHistory: false,
        source: "offline",
      };
      saveCachedResponse(cacheKey, response);
      return response;
    }
  }

  if (!wantsImage && appConfig.preferLocalAi) {
    try {
      const content = await callOllama(messages.slice(-MAX_REMOTE_MESSAGES));
      if (content) {
        const response: AssistantResponse = {
          content,
          image: null,
          savedToHistory: false,
          source: "local-ollama",
        };
        saveCachedResponse(cacheKey, response);
        return response;
      }
    } catch {
      // Fall through to cloud or offline response.
    }
  }

  if (appConfig.useCloudAi) {
    if (hasAiBackend) {
      try {
        const data = await callHostedAi(messages, photoDataUrl, appContext);
        const response: AssistantResponse = {
          content: data.content || "Non ho ricevuto una risposta valida.",
          image: data.image ?? null,
          savedToHistory: Boolean(data.savedToHistory),
          source: "cloud-api",
        };
        saveCachedResponse(cacheKey, response);
        return response;
      } catch {
        // Fall through to Supabase or offline response.
      }
    }

    try {
      const { data, error } = await supabase.functions.invoke("chat-decoratore", {
        body: {
          messages: messages.slice(-MAX_REMOTE_MESSAGES),
          hasPhoto: Boolean(photoDataUrl),
          sourceImage: photoDataUrl,
          storeResult: appConfig.persistRemoteGeneratedImages,
        },
      });

      if (!error && !data?.error) {
        const response: AssistantResponse = {
          content: data.content || "Non ho ricevuto una risposta valida.",
          image: data.image ?? null,
          savedToHistory: Boolean(data.savedToHistory),
          source: "cloud-supabase",
        };
        saveCachedResponse(cacheKey, response);
        return response;
      }
    } catch {
      // Fall through to offline response.
    }
  }

  const fallback: AssistantResponse = {
    content: wantsImage
      ? "In questo momento posso evitare il cloud, ma per generare immagini ti serve un endpoint configurato in `VITE_AI_BACKEND_URL` o `VITE_LOCAL_IMAGE_API_URL`."
      : localRule ??
        "Modalita' locale attiva: posso rispondere con regole rapide e cache locale. Per risposte piu' libere configura Ollama o il backend AI.",
    image: null,
    savedToHistory: false,
    source: "offline",
  };

  saveCachedResponse(cacheKey, fallback);
  return fallback;
}
