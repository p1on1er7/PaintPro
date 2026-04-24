import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `Sei "PaintPro AI", l'assistente esperto di un decoratore professionista italiano.
Aiuti con:
- Consigli su materiali, vernici, prodotti CEBOS, primer, finiture
- Tecniche di tinteggiatura interna ed esterna (quarzo, velature, righe, colonne)
- Consigli logistici (preparazione cantiere, attrezzatura, sequenza lavori)
- Suggerimenti su colori RAL / NCS / CEBOS (includi sempre codici precisi)
- Stima quantita di prodotto in base ai m²
- Consigli pratici di lavoro

GENERAZIONE IMMAGINI:
Quando l'utente chiede di vedere, simulare o generare un'anteprima visiva, usa il tool "genera_anteprima".
Se e' stata caricata una foto, l'immagine sorgente verra passata automaticamente.
Rispondi sempre in italiano, conciso e professionale. Usa markdown leggero.`;

type ToolArgs = {
  prompt: string;
  colore?: string;
  zona?: string;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, hasPhoto, sourceImage, storeResult = true } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const authHeader = req.headers.get("Authorization");
    let userId: string | null = null;
    if (authHeader) {
      try {
        const supa = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_ANON_KEY")!,
          { global: { headers: { Authorization: authHeader } } },
        );
        const { data: { user } } = await supa.auth.getUser();
        userId = user?.id ?? null;
      } catch {
        userId = null;
      }
    }

    const tools = [
      {
        type: "function",
        function: {
          name: "genera_anteprima",
          description:
            "Genera o modifica un'immagine fotorealistica per mostrare al decoratore l'anteprima del lavoro. Usa solo quando l'utente chiede esplicitamente un'anteprima visiva.",
          parameters: {
            type: "object",
            properties: {
              prompt: {
                type: "string",
                description: "Descrizione dettagliata di cosa modificare o generare in italiano.",
              },
              colore: {
                type: "string",
                description: "Codice colore se specificato.",
              },
              zona: {
                type: "string",
                description: "Zona o superficie da trattare.",
              },
            },
            required: ["prompt"],
            additionalProperties: false,
          },
        },
      },
    ];

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `${SYSTEM_PROMPT}\n\n${hasPhoto ? "[Foto utente disponibile]" : "[Nessuna foto caricata]"}`,
          },
          ...(messages ?? []),
        ],
        tools,
        tool_choice: "auto",
      }),
    });

    if (!aiResp.ok) {
      const body = await aiResp.text();
      console.error("AI gateway error:", aiResp.status, body);
      const error =
        aiResp.status === 429
          ? "Limite richieste raggiunto, riprova tra poco."
          : aiResp.status === 402
            ? "Crediti AI esauriti."
            : "Errore gateway AI";

      return new Response(JSON.stringify({ error }), {
        status: aiResp.status >= 400 && aiResp.status < 500 ? aiResp.status : 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResp.json();
    const choice = aiData.choices?.[0]?.message;
    const toolCalls = choice?.tool_calls;
    let textContent = choice?.content ?? "";
    let generatedImage: { url: string; prompt: string; colore: string | null; zona: string | null } | null = null;
    let savedToHistory = false;

    if (toolCalls?.length) {
      const toolCall = toolCalls[0];
      if (toolCall.function?.name === "genera_anteprima") {
        try {
          const args = JSON.parse(toolCall.function.arguments || "{}") as ToolArgs;
          const finalPrompt = sourceImage
            ? `Modifica solo gli elementi richiesti mantenendo ambiente, illuminazione, ombre, texture e prospettiva fedeli alla foto originale. Risultato fotorealistico professionale. ${args.prompt}${args.colore ? ` Colore: ${args.colore}.` : ""}${args.zona ? ` Zona: ${args.zona}.` : ""}`
            : `Genera un'immagine fotorealistica professionale di: ${args.prompt}${args.colore ? ` Colore: ${args.colore}.` : ""}${args.zona ? ` Zona: ${args.zona}.` : ""}`;

          const userContent: Array<Record<string, unknown>> = [{ type: "text", text: finalPrompt }];
          if (sourceImage) {
            userContent.push({ type: "image_url", image_url: { url: sourceImage } });
          }

          const imgResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${LOVABLE_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash-image",
              messages: [{ role: "user", content: userContent }],
              modalities: ["image", "text"],
            }),
          });

          if (!imgResp.ok) {
            const body = await imgResp.text();
            console.error("Image gen error:", imgResp.status, body);
            textContent =
              imgResp.status === 429
                ? "Limite richieste raggiunto, riprova tra poco."
                : imgResp.status === 402
                  ? "Crediti AI esauriti."
                  : "Errore nella generazione dell'immagine.";
          } else {
            const imgData = await imgResp.json();
            const imageDataUrl = imgData.choices?.[0]?.message?.images?.[0]?.image_url?.url;

            if (!imageDataUrl) {
              textContent = "Nessuna immagine generata, riprova con un prompt piu specifico.";
            } else {
              const shouldPersist = Boolean(storeResult && userId);
              let resultUrl = imageDataUrl;

              if (shouldPersist) {
                const base64Data = imageDataUrl.split(",")[1];
                const binaryData = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
                const fileName = `${userId}/generated/${Date.now()}.png`;

                const adminClient = createClient(
                  Deno.env.get("SUPABASE_URL")!,
                  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
                );

                const { error: uploadError } = await adminClient.storage
                  .from("paintpro")
                  .upload(fileName, binaryData, { contentType: "image/png", upsert: false });

                if (uploadError) {
                  console.error("Upload error:", uploadError);
                  textContent = "Errore nel salvataggio dell'immagine.";
                } else {
                  const { data: publicFile } = adminClient.storage.from("paintpro").getPublicUrl(fileName);
                  resultUrl = publicFile.publicUrl;

                  await adminClient.from("generated_images").insert({
                    user_id: userId,
                    result_url: resultUrl,
                    source_url: sourceImage ?? null,
                    prompt: finalPrompt,
                    color_code: args.colore || null,
                    zone: args.zona || null,
                  });

                  savedToHistory = true;
                }
              }

              generatedImage = {
                url: resultUrl,
                prompt: args.prompt,
                colore: args.colore || null,
                zona: args.zona || null,
              };

              if (!textContent) textContent = "Ecco l'anteprima.";
            }
          }
        } catch (error) {
          console.error("Tool execution error:", error);
          textContent = "Errore nell'elaborazione della richiesta immagine.";
        }
      }
    }

    if (!textContent && !generatedImage) {
      textContent = "Non ho ricevuto una risposta valida, riprova.";
    }

    return new Response(JSON.stringify({ content: textContent, image: generatedImage, savedToHistory }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("chat error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Errore" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
