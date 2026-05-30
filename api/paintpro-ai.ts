function sendJson(res: any, body: unknown, status = 200) {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).json(body);
}

const SYSTEM_PROMPT = `Sei PaintPro AI, assistente di un decoratore italiano.
Rispondi sempre in italiano, in modo conciso, pratico e professionale.
Privilegia consigli operativi, materiali, colori, cicli applicativi, stime rapide e sequenze di lavoro.
Se l'utente chiede un'anteprima immagine, non spiegare troppo: genera o modifica l'immagine e conferma brevemente.`;

const IMAGE_PATTERN = /(genera|simula|mostra|anteprima|render|fammi vedere|preview)/i;
const WEB_SEARCH_PATTERN =
  /(internet|online|cerca|aggiornat|scheda tecnica|normativa|metodo|metodologia|ciclo applicativo|supporto|fondo|primer|fissativo|muffa|umidita|facciata|esterno|resina|microcemento|spatolato|velatura|cebos|sikkens|boero|kerakoll|mapei|oikos|san marco|caparol)/i;

function getEnv(name: string, fallback = "") {
  return typeof process !== "undefined" ? process.env[name] ?? fallback : fallback;
}

function getEnvBool(name: string, fallback = false) {
  const value = getEnv(name);
  if (!value) return fallback;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function uniqueValues(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function shouldFallbackImageModel(configuredModel: string, quality: string) {
  return configuredModel.includes("mini") && quality === "low";
}

function looksLikeImageRequest(text: string) {
  return IMAGE_PATTERN.test(text);
}

function shouldUseWebSearch(messages: Array<{ role: string; content: string }>, appContext: string) {
  if (!getEnvBool("OPENAI_ENABLE_WEB_SEARCH", true)) return false;
  const lastUserMessage = [...messages].reverse().find((message) => message.role === "user")?.content ?? "";
  return WEB_SEARCH_PATTERN.test(lastUserMessage) || WEB_SEARCH_PATTERN.test(appContext);
}

function buildInstructions(appContext: string) {
  const context = typeof appContext === "string" && appContext.trim() ? `\n\n${appContext.trim()}` : "";
  return `${SYSTEM_PROMPT}
Quando dai consigli tecnici, ragiona come un capocantiere esperto: prima verifica supporto e condizioni, poi proponi ciclo, materiali, tempi e rischi.
Se hai accesso alla ricerca web e la domanda riguarda metodi, prodotti, schede tecniche o informazioni aggiornabili, usa fonti aggiornate e segnala quando stai facendo una stima pratica.
Non inventare dati di schede tecniche: se non sei sicuro, dillo e suggerisci una verifica sul prodotto specifico.${context}`;
}

function extractTextContent(input: unknown) {
  if (typeof input === "string") return input;
  if (Array.isArray(input)) {
    return input
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object" && "text" in item && typeof item.text === "string") return item.text;
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }

  return "";
}

function extractResponseText(data: any) {
  const directText = extractTextContent(data?.output_text);
  if (directText) return directText;

  const output = Array.isArray(data?.output) ? data.output : [];
  const parts: string[] = [];

  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const contentItem of content) {
      if (typeof contentItem?.text === "string") parts.push(contentItem.text);
      if (typeof contentItem?.output_text === "string") parts.push(contentItem.output_text);
      if (typeof contentItem?.content === "string") parts.push(contentItem.content);
    }
  }

  return parts.join("\n").trim();
}

async function dataUrlToFile(dataUrl: string, fileName: string) {
  const match = dataUrl.match(/^data:(.*?);base64,(.*)$/);
  if (!match) {
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    return new File([blob], fileName, { type: blob.type || "image/jpeg" });
  }

  const [, mimeType, base64] = match;
  const bytes = Buffer.from(base64, "base64");
  return new File([bytes], fileName, { type: mimeType || "image/jpeg" });
}

async function parseOpenAiError(response: Response) {
  const raw = await response.text();
  try {
    const parsed = JSON.parse(raw) as { error?: { message?: string; code?: string; type?: string } };
    const message = parsed.error?.message || raw;
    const code = parsed.error?.code ? ` (${parsed.error.code})` : "";
    return `${message}${code}`;
  } catch {
    return raw || `Errore OpenAI ${response.status}`;
  }
}

async function callOpenAiText(messages: Array<{ role: string; content: string }>, appContext: string) {
  const apiKey = getEnv("OPENAI_API_KEY");
  const model = getEnv("OPENAI_TEXT_MODEL", "gpt-5-nano");
  const useWebSearch = shouldUseWebSearch(messages, appContext);

  const buildBody = (withWebSearch: boolean) => ({
    model,
    instructions: buildInstructions(appContext),
    input: messages.map((message) => ({
      role: message.role === "assistant" ? "assistant" : "user",
      content: message.content,
    })),
    max_output_tokens: 900,
    ...(withWebSearch
      ? {
          tools: [
            {
              type: "web_search",
              user_location: {
                type: "approximate",
                country: "IT",
                timezone: "Europe/Rome",
              },
            },
          ],
        }
      : {}),
  });

  let response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(buildBody(useWebSearch)),
  });

  if (!response.ok) {
    const firstError = await parseOpenAiError(response);
    if (useWebSearch) {
      response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(buildBody(false)),
      });

      if (!response.ok) {
        return { error: `${firstError}\nFallback senza ricerca web: ${await parseOpenAiError(response)}`, status: response.status };
      }
    } else {
      return { error: firstError, status: response.status };
    }
  }

  const data = await response.json();
  const content = extractResponseText(data) || "Non ho ricevuto una risposta valida.";
  return { content };
}

async function callOpenAiImage(prompt: string, sourceImage: string | null) {
  const apiKey = getEnv("OPENAI_API_KEY");
  const configuredModel = getEnv("OPENAI_IMAGE_MODEL", "gpt-image-1-mini");
  const size = getEnv("OPENAI_IMAGE_SIZE", "1024x1024");
  const quality = getEnv("OPENAI_IMAGE_QUALITY", "low").trim().toLowerCase();
  const models = shouldFallbackImageModel(configuredModel, quality)
    ? uniqueValues([configuredModel, "gpt-image-1-mini", "gpt-image-1"])
    : [configuredModel];
  const format = getEnv("OPENAI_IMAGE_FORMAT", "png");
  const finalPrompt = [
    "Crea un'anteprima fotorealistica per un lavoro da decoratore/imbianchino.",
    "Se ricevi una foto sorgente, trattala come vincolo forte: conserva composizione, prospettiva, geometria, luce, ombre, materiali non richiesti e tutti gli oggetti presenti.",
    "Modifica esclusivamente le superfici richieste dall'utente, soprattutto pareti, facciate, bordi o cornici indicati.",
    "Non cambiare pavimenti, serramenti, mobili, tetto, vegetazione, persone, impianti, texture non richieste o proporzioni architettoniche.",
    "Il risultato deve sembrare una simulazione colore professionale sulla foto originale, non un nuovo ambiente inventato.",
    "Non aggiungere testo, loghi o scritte nell'immagine.",
    prompt,
  ].join("\n");

  let lastError = "";

  for (const model of models) {
    try {
      if (!sourceImage) {
        const response = await fetch("https://api.openai.com/v1/images/generations", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            prompt: finalPrompt,
            size,
            quality,
            output_format: format,
          }),
        });

        if (!response.ok) {
          lastError = `${model}: ${await parseOpenAiError(response)}`;
          continue;
        }

        const data = await response.json();
        const base64 = data.data?.[0]?.b64_json;
        const url = data.data?.[0]?.url;
        if (!base64 && !url) {
          lastError = `${model}: nessuna immagine generata`;
          continue;
        }

        return { url: base64 ? `data:image/${format};base64,${base64}` : url };
      }

      const file = await dataUrlToFile(sourceImage, "source-image.jpg");
      const formData = new FormData();
      formData.append("model", model);
      formData.append("prompt", finalPrompt);
      formData.append("size", size);
      formData.append("quality", quality);
      formData.append("output_format", format);
      formData.append("image", file);

      const response = await fetch("https://api.openai.com/v1/images/edits", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: formData,
      });

      if (!response.ok) {
        lastError = `${model}: ${await parseOpenAiError(response)}`;
        continue;
      }

      const data = await response.json();
      const base64 = data.data?.[0]?.b64_json;
      const url = data.data?.[0]?.url;
      if (!base64 && !url) {
        lastError = `${model}: nessuna immagine generata`;
        continue;
      }

      return { url: base64 ? `data:image/${format};base64,${base64}` : url };
    } catch (error) {
      lastError =
        error instanceof Error
          ? `${model}: ${error.message}`
          : `${model}: errore durante la generazione immagine`;
    }
  }

  return {
    error:
      `${lastError || "Nessun modello immagine disponibile."} ` +
      "Se usi gpt-image-1 con qualita' medium/high e ricevi 504, la generazione sta superando il tempo massimo della funzione Vercel: prova gpt-image-1-mini medium oppure gpt-image-1 low.",
    status: 500,
  };
}

export default async function handler(req: any, res: any) {
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method === "GET") {
    return sendJson(res, {
      ok: true,
      openaiKeyConfigured: Boolean(getEnv("OPENAI_API_KEY")),
      textModel: getEnv("OPENAI_TEXT_MODEL", "gpt-5-nano"),
      imageModel: getEnv("OPENAI_IMAGE_MODEL", "gpt-image-1-mini"),
      imageSize: getEnv("OPENAI_IMAGE_SIZE", "1024x1024"),
      imageQuality: getEnv("OPENAI_IMAGE_QUALITY", "low"),
      imageFormat: getEnv("OPENAI_IMAGE_FORMAT", "png"),
      webSearchEnabled: getEnvBool("OPENAI_ENABLE_WEB_SEARCH", true),
      runtime: "node",
    });
  }
  if (req.method !== "POST") return sendJson(res, { error: "Method not allowed" }, 405);

  if (!getEnv("OPENAI_API_KEY")) {
    return sendJson(res, { error: "OPENAI_API_KEY non configurata" }, 500);
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body ?? {};
    const { messages = [], sourceImage = null, appContext = "" } = body;
    const safeMessages = Array.isArray(messages)
      ? messages
          .filter((message) => message && typeof message.content === "string" && typeof message.role === "string")
          .slice(-8)
          .map((message) => ({ role: message.role, content: message.content }))
      : [];

    const lastUserMessage = [...safeMessages].reverse().find((message) => message.role === "user")?.content ?? "";
    if (!lastUserMessage.trim()) {
      return sendJson(res, { error: "Messaggio mancante" }, 400);
    }

    if (looksLikeImageRequest(lastUserMessage)) {
      const imageResult = await callOpenAiImage(lastUserMessage, sourceImage);
      if ("error" in imageResult) {
        return sendJson(res, { error: imageResult.error }, imageResult.status || 500);
      }

      return sendJson(res, {
        content: "Ecco l'anteprima.",
        image: {
          url: imageResult.url,
          prompt: lastUserMessage,
          colore: null,
          zona: null,
        },
        savedToHistory: false,
      });
    }

    const textResult = await callOpenAiText(safeMessages, String(appContext || ""));
    if ("error" in textResult) {
      return sendJson(res, { error: textResult.error }, textResult.status || 500);
    }

    return sendJson(res, {
      content: textResult.content,
      image: null,
      savedToHistory: false,
    });
  } catch (error) {
    return sendJson(
      res,
      { error: error instanceof Error ? error.message : "Errore interno" },
      500,
    );
  }
}
