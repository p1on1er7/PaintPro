const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });

export const config = {
  runtime: "edge",
};

const SYSTEM_PROMPT = `Sei PaintPro AI, assistente di un decoratore italiano.
Rispondi sempre in italiano, in modo conciso, pratico e professionale.
Privilegia consigli operativi, materiali, colori, cicli applicativi, stime rapide e sequenze di lavoro.
Se l'utente chiede un'anteprima immagine, non spiegare troppo: genera o modifica l'immagine e conferma brevemente.`;

const IMAGE_PATTERN = /(genera|simula|mostra|anteprima|render|fammi vedere|preview)/i;

function getEnv(name: string, fallback = "") {
  return typeof process !== "undefined" ? process.env[name] ?? fallback : fallback;
}

function looksLikeImageRequest(text: string) {
  return IMAGE_PATTERN.test(text);
}

function buildInstructions(appContext: string) {
  const context = typeof appContext === "string" && appContext.trim() ? `\n\n${appContext.trim()}` : "";
  return `${SYSTEM_PROMPT}${context}`;
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

async function dataUrlToFile(dataUrl: string, fileName: string) {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  return new File([blob], fileName, { type: blob.type || "image/jpeg" });
}

async function callOpenAiText(messages: Array<{ role: string; content: string }>, appContext: string) {
  const apiKey = getEnv("OPENAI_API_KEY");
  const model = getEnv("OPENAI_TEXT_MODEL", "gpt-5-nano");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      instructions: buildInstructions(appContext),
      input: messages.map((message) => ({
        role: message.role === "assistant" ? "assistant" : "user",
        content: message.content,
      })),
      max_output_tokens: 700,
    }),
  });

  if (!response.ok) {
    return { error: await response.text(), status: response.status };
  }

  const data = await response.json();
  const content = extractTextContent(data.output_text) || "Non ho ricevuto una risposta valida.";
  return { content };
}

async function callOpenAiImage(prompt: string, sourceImage: string | null) {
  const apiKey = getEnv("OPENAI_API_KEY");
  const model = getEnv("OPENAI_IMAGE_MODEL", "gpt-image-1");
  const size = getEnv("OPENAI_IMAGE_SIZE", "1024x1024");
  const quality = getEnv("OPENAI_IMAGE_QUALITY", "low");
  const format = getEnv("OPENAI_IMAGE_FORMAT", "png");
  const finalPrompt = [
    "Crea un'anteprima realistica per un lavoro da decoratore/imbianchino.",
    "Mantieni proporzioni credibili, luce naturale, pareti e superfici realistiche.",
    "Non aggiungere testo, loghi o scritte nell'immagine.",
    prompt,
  ].join("\n");

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
      return { error: await response.text(), status: response.status };
    }

    const data = await response.json();
    const base64 = data.data?.[0]?.b64_json;
    if (!base64) return { error: "Nessuna immagine generata", status: 500 };

    return { url: `data:image/${format};base64,${base64}` };
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
    return { error: await response.text(), status: response.status };
  }

  const data = await response.json();
  const base64 = data.data?.[0]?.b64_json;
  if (!base64) return { error: "Nessuna immagine generata", status: 500 };

  return { url: `data:image/${format};base64,${base64}` };
}

export default async function handler(request: Request) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204 });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  if (!getEnv("OPENAI_API_KEY")) {
    return json({ error: "OPENAI_API_KEY non configurata" }, 500);
  }

  try {
    const { messages = [], sourceImage = null, appContext = "" } = await request.json();
    const safeMessages = Array.isArray(messages)
      ? messages
          .filter((message) => message && typeof message.content === "string" && typeof message.role === "string")
          .slice(-8)
          .map((message) => ({ role: message.role, content: message.content }))
      : [];

    const lastUserMessage = [...safeMessages].reverse().find((message) => message.role === "user")?.content ?? "";
    if (!lastUserMessage.trim()) {
      return json({ error: "Messaggio mancante" }, 400);
    }

    if (looksLikeImageRequest(lastUserMessage)) {
      const imageResult = await callOpenAiImage(lastUserMessage, sourceImage);
      if ("error" in imageResult) {
        return json({ error: imageResult.error }, imageResult.status || 500);
      }

      return json({
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
      return json({ error: textResult.error }, textResult.status || 500);
    }

    return json({
      content: textResult.content,
      image: null,
      savedToHistory: false,
    });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "Errore interno" },
      500,
    );
  }
}
