# PaintPro

Gestionale per decoratori con approccio `local-first`.

## Installazione privata per due persone

La versione condivisa su telefono deve usare `VITE_APP_MODE=cloud`, Supabase per il login e i dati, e `/api/paintpro-ai` per l'AI. Il backend verifica la sessione Supabase e ammette solo i due account autorizzati; la pagina di registrazione non e' disponibile. Non usare `VITE_APP_MODE=local` sul deploy condiviso: salverebbe i dati separatamente su ogni dispositivo e salterebbe il login.

L'URL e la chiave **anon pubblica** del progetto Supabase attivo sono fissati in `src/lib/supabase-public-config.ts`, usato anche dal backend. Le vecchie variabili `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` presenti su Vercel non vengono piu' lette: un valore obsoleto aveva bloccato il login sui telefoni. La chiave `service_role` non deve mai essere aggiunta al repository.

Prima di considerare il deploy completamente privato:

1. Su Vercel disattiva **Vercel Authentication** per il progetto. Il login PaintPro rimane attivo e cosi' anche il secondo telefono puo' aprire il sito.
2. Su Supabase, in **Authentication > Providers > Email**, disattiva le nuove registrazioni e verifica che siano presenti soltanto i due account voluti.
3. Applica nel **SQL Editor** la migrazione `supabase/migrations/20260928000000_private_paintpro_storage.sql`: il bucket delle foto diventa privato e le immagini gia' salvate vengono mostrate tramite URL firmati.
4. Se le vecchie Edge Functions Lovable sono ancora distribuite, eliminale oppure ridistribuiscile con la nuova verifica dell'account. Il frontend attuale usa solo `/api/paintpro-ai`.

Le impostazioni Vercel e Supabase non sono modificate automaticamente da un `git push`. Mantieni `OPENAI_API_KEY` soltanto nelle variabili server di Vercel; non aggiungerla alle variabili `VITE_` o al repository.

## Cosa e' cambiato

- I dati di `Scanner`, `Logistica`, `Preventivi` e `Calendario` possono girare in locale senza Supabase.
- L'autenticazione locale viene creata automaticamente quando l'app gira in modalita' locale.
- Il chatbot prova prima cache e logica locale, poi eventualmente modelli locali, e solo come fallback usa il cloud.
- Le foto non vengono piu caricate in storage prima della chat: vengono compresse e tenute in locale.
- Le edge function AI possono restituire immagini senza obbligare login o salvataggio remoto.

## Modalita' consigliata per risparmiare

Usa queste variabili in `.env`:

```env
VITE_APP_MODE=local
VITE_AI_MODE=local
VITE_OLLAMA_URL=http://127.0.0.1:11434
VITE_OLLAMA_MODEL=llama3.1:8b-instruct-q4_K_M
VITE_LOCAL_IMAGE_API_URL=http://127.0.0.1:7860/api/paintpro/image
VITE_PERSIST_REMOTE_GENERATED_IMAGES=false
```

Note:

- `VITE_APP_MODE=local` rende il gestionale indipendente da Supabase per i dati principali.
- `VITE_AI_MODE=local` usa prima provider locali.
- `VITE_AI_MODE=hybrid` usa locale e poi cloud solo se serve.
- `VITE_LOCAL_IMAGE_API_URL` e' opzionale: deve accettare `POST` JSON con `prompt` e `sourceImage`, e restituire `url`, `image_url`, `image` oppure `dataUrl`.
- Se vuoi ancora il cloud, imposta anche `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`.

## Versione telefono consigliata

Per usarlo davvero su smartphone senza costi alti:

1. tieni i dati in `local` sul dispositivo
2. pubblica il frontend su Vercel
3. usa il backend serverless `/api/paintpro-ai` con una chiave OpenAI server-side
4. installa l'app dal browser come PWA

Variabili frontend consigliate:

```env
VITE_APP_MODE=local
VITE_AI_MODE=cloud
VITE_AI_BACKEND_URL=/api/paintpro-ai
VITE_PERSIST_REMOTE_GENERATED_IMAGES=false
```

Variabili server da impostare su Vercel:

```env
OPENAI_API_KEY=...
OPENAI_TEXT_MODEL=gpt-5-nano
OPENAI_IMAGE_MODEL=gpt-image-1
OPENAI_IMAGE_SIZE=1024x1024
OPENAI_IMAGE_QUALITY=low
OPENAI_IMAGE_FORMAT=png
```

Note pratiche:

- `gpt-5-nano` e' la scelta testo piu' economica.
- Le immagini costano molto piu' del testo: conviene tenerle a `low`.
- Le foto vengono gia' compresse lato client prima dell'invio.

## Deploy Vercel

Il progetto e' gia' pronto per Vercel con:

- `vercel.json` per il routing SPA
- `api/paintpro-ai.ts` come backend AI serverless
- `manifest.webmanifest` e `sw.js` per installazione PWA

Passi:

1. carica il progetto su GitHub
2. importa il repository su Vercel
3. imposta le variabili ambiente sopra
4. deploy
5. apri l'URL da telefono e usa `Aggiungi a Home`

## Installazione su telefono

- Android: Chrome > menu > `Installa app`
- iPhone: Safari > Condividi > `Aggiungi a Home`

La PWA ha icone, manifest, service worker e modalita' standalone.

## Avvio

```bash
npm install
npm run dev
```

## Verifica eseguita

```bash
npm run build
```
