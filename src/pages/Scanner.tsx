import { useEffect, useRef, useState } from "react";
import { appConfig } from "@/lib/app-config";
import {
  deleteGeneratedImage,
  listGeneratedImages,
  saveGeneratedImage,
  type GeneratedImageRecord,
} from "@/lib/app-data";
import { compressImageForAi, sendPaintProChat, type AssistantImage } from "@/lib/paintpro-ai";
import AppLayout from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import { Camera, Sparkles, Send, Loader2, Image as ImageIcon, Trash2, ChevronDown, ChevronUp, X } from "lucide-react";

type Msg = {
  role: "user" | "assistant";
  content: string;
  image?: AssistantImage | null;
};

export default function Scanner() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatBoxRef = useRef<HTMLDivElement>(null);

  const [photoName, setPhotoName] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      content:
        "Ciao! Sono il tuo **assistente decoratore**. Lavoro in modalita' **locale-first**: prima uso cache e logica locale, poi eventualmente provider AI esterni solo quando servono davvero.",
    },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);

  const [history, setHistory] = useState<GeneratedImageRecord[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    if (chatBoxRef.current) chatBoxRef.current.scrollTop = chatBoxRef.current.scrollHeight;
  }, [messages]);

  useEffect(() => {
    loadHistory();
  }, []);

  async function loadHistory() {
    try {
      setHistory(await listGeneratedImages());
    } catch {
      toast.error("Errore cronologia");
    }
  }

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const compressed = await compressImageForAi(file);
      setPhotoUrl(compressed);
      setPhotoName(file.name);
      toast.success("Foto ottimizzata e pronta");
    } catch {
      toast.error("Errore preparazione foto");
    } finally {
      setUploading(false);
    }
  }

  function clearPhoto() {
    setPhotoName(null);
    setPhotoUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function sendChat() {
    if (!chatInput.trim() || chatLoading) return;

    const userMsg: Msg = { role: "user", content: chatInput.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setChatInput("");
    setChatLoading(true);

    try {
      const data = await sendPaintProChat(
        newMessages.map(({ role, content }) => ({ role, content })),
        photoUrl,
      );

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.content || "...", image: data.image ?? null },
      ]);

      if (data.image && !data.savedToHistory) {
        await saveGeneratedImage({
          source_url: photoUrl,
          result_url: data.image.url,
          prompt: data.image.prompt,
          color_code: data.image.colore,
          zone: data.image.zona,
        });
      }

      if (data.image) {
        await loadHistory();
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message ?? "Errore di rete");
    } finally {
      setChatLoading(false);
    }
  }

  async function removeHistoryImage(id: string) {
    try {
      await deleteGeneratedImage(id);
      await loadHistory();
      toast.success("Eliminata");
    } catch {
      toast.error("Errore eliminazione");
    }
  }

  return (
    <AppLayout title="Scanner & AI" subtitle="Foto e assistente locale-first">
      <Card className="p-4 mb-4">
        <div className="flex items-center justify-between mb-2">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
            Foto superficie
          </Label>
          {photoUrl && (
            <button
              type="button"
              onClick={clearPhoto}
              className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1"
            >
              <X className="h-3 w-3" /> Rimuovi
            </button>
          )}
        </div>

        <div
          onClick={() => fileInputRef.current?.click()}
          className="relative rounded-xl overflow-hidden bg-muted border-2 border-dashed border-border min-h-[180px] flex items-center justify-center cursor-pointer hover:border-accent/50 transition-colors"
        >
          {photoUrl ? (
            <>
              <img src={photoUrl} alt="Foto" className="w-full max-h-[320px] object-contain" />
              {uploading && (
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-white" />
                </div>
              )}
              {!uploading && (
                <div className="absolute bottom-2 right-2 bg-success/90 text-success-foreground text-[10px] px-2 py-1 rounded-full font-medium">
                  Pronta per AI
                </div>
              )}
            </>
          ) : (
            <div className="text-center p-8">
              <Camera className="h-10 w-10 mx-auto mb-2 text-muted-foreground" />
              <p className="font-medium text-sm">Tocca per caricare foto</p>
              <p className="text-xs text-muted-foreground mt-1">Facciata, parete, stanza</p>
            </div>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handlePhotoChange}
          className="hidden"
        />

        {photoName && (
          <p className="text-[11px] text-muted-foreground mt-2">
            File locale: {photoName}
          </p>
        )}
      </Card>

      {history.length > 0 && (
        <Card className="p-4 mb-4">
          <button
            type="button"
            onClick={() => setHistoryOpen((value) => !value)}
            className="w-full flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <ImageIcon className="h-4 w-4 text-accent" />
              <span className="font-semibold text-sm">Anteprime generate ({history.length})</span>
            </div>
            {historyOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>

          {historyOpen && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              {history.map((img) => (
                <div key={img.id} className="relative group rounded-lg overflow-hidden bg-muted">
                  <img src={img.result_url} alt={img.prompt} className="w-full aspect-square object-cover" />
                  <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                    <p className="text-[10px] text-white truncate">{img.color_code ?? img.zone}</p>
                  </div>
                  <button
                    onClick={() => removeHistoryImage(img.id)}
                    className="absolute top-1 right-1 h-7 w-7 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="h-4 w-4 text-accent" />
          <h2 className="font-semibold">Assistente tuttofare</h2>
          <span className="text-[10px] text-muted-foreground ml-auto">
            dati {appConfig.appMode} • AI {appConfig.aiMode}
          </span>
        </div>

        <div ref={chatBoxRef} className="h-[360px] overflow-y-auto scrollbar-thin space-y-3 pr-1 mb-3">
          {messages.map((message, index) => (
            <div key={index} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                  message.role === "user"
                    ? "bg-accent text-accent-foreground rounded-tr-sm"
                    : "bg-muted text-foreground rounded-tl-sm"
                }`}
              >
                {message.role === "assistant" ? (
                  <>
                    <div className="prose prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-strong:text-foreground">
                      <ReactMarkdown>{message.content || "..."}</ReactMarkdown>
                    </div>
                    {message.image && (
                      <div className="mt-2 rounded-xl overflow-hidden border border-border">
                        <img src={message.image.url} alt={message.image.prompt} className="w-full" />
                        {(message.image.colore || message.image.zona) && (
                          <div className="px-2 py-1 bg-background/80 text-[10px] text-muted-foreground">
                            {[message.image.zona, message.image.colore].filter(Boolean).join(" • ")}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  message.content
                )}
              </div>
            </div>
          ))}

          {chatLoading && (
            <div className="flex justify-start">
              <div className="bg-muted rounded-2xl rounded-tl-sm px-3.5 py-2.5">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <Input
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") sendChat();
            }}
            placeholder={
              photoUrl
                ? "es. genera un'anteprima color RAL 7016 sulla parete..."
                : "es. quanta vernice serve per 40m²?"
            }
            disabled={chatLoading}
            className="flex-1"
          />
          <Button
            onClick={sendChat}
            disabled={chatLoading || !chatInput.trim()}
            size="icon"
            className="bg-accent hover:bg-accent/90 text-accent-foreground"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </Card>
    </AppLayout>
  );
}
