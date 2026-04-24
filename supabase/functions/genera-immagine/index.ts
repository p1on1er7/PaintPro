import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    let userId: string | null = null;

    if (authHeader) {
      try {
        const supabase = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_ANON_KEY")!,
          { global: { headers: { Authorization: authHeader } } },
        );

        const { data: { user } } = await supabase.auth.getUser();
        userId = user?.id ?? null;
      } catch {
        userId = null;
      }
    }

    const { sourceImage, prompt, colorCode, zone, quality, storeResult = true } = await req.json();
    if (!prompt || prompt.length < 5) {
      return new Response(JSON.stringify({ error: "Prompt mancante" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const finalPrompt = sourceImage
      ? `Modifica solo gli elementi richiesti mantenendo ambiente, illuminazione, ombre, texture e prospettiva fedeli alla foto originale. Risultato fotorealistico professionale. ${prompt}${colorCode ? ` Colore di riferimento: ${colorCode}.` : ""}${zone ? ` Zona da trattare: ${zone}.` : ""}`
      : `Genera un'immagine fotorealistica e professionale di: ${prompt}${colorCode ? ` Colore: ${colorCode}.` : ""}${zone ? ` Zona: ${zone}.` : ""}`;

    const userContent: Array<Record<string, unknown>> = [{ type: "text", text: finalPrompt }];
    if (sourceImage) userContent.push({ type: "image_url", image_url: { url: sourceImage } });

    const model = quality === "pro" ? "google/gemini-3-pro-image-preview" : "google/gemini-2.5-flash-image";

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: userContent }],
        modalities: ["image", "text"],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error("Image gen error:", response.status, body);
      const error =
        response.status === 429
          ? "Limite richieste raggiunto, riprova tra poco."
          : response.status === 402
            ? "Crediti AI esauriti."
            : "Errore generazione immagine";

      return new Response(JSON.stringify({ error }), {
        status: response.status >= 400 && response.status < 500 ? response.status : 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const imageDataUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!imageDataUrl) {
      console.error("No image returned:", JSON.stringify(data).slice(0, 500));
      return new Response(JSON.stringify({ error: "Nessuna immagine generata" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const shouldPersist = Boolean(storeResult && userId);
    let resultUrl = imageDataUrl;
    let savedToHistory = false;

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
        return new Response(JSON.stringify({ error: "Errore salvataggio immagine" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: publicFile } = adminClient.storage.from("paintpro").getPublicUrl(fileName);
      resultUrl = publicFile.publicUrl;

      await adminClient.from("generated_images").insert({
        user_id: userId,
        result_url: resultUrl,
        source_url: sourceImage ?? null,
        prompt: finalPrompt,
        color_code: colorCode ?? null,
        zone: zone ?? null,
      });

      savedToHistory = true;
    }

    return new Response(JSON.stringify({ url: resultUrl, savedToHistory }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("generate-image error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Errore" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
