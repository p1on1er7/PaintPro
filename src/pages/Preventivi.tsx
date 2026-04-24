import { useEffect, useMemo, useState } from "react";
import {
  deletePreventivo,
  listPreventivi,
  savePreventivo,
  type PreventivoRecord,
  type PreventivoVoce,
} from "@/lib/app-data";
import AppLayout from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, Receipt, FileText } from "lucide-react";

// Listini fissi richiesti dall'utente
const LISTINO = {
  interna: [
    { key: "bianco", label: "Bianco", price: 7 },
    { key: "pastello", label: "Pastello", price: 8 },
    { key: "forte", label: "Forte", price: 10 },
    { key: "cebos", label: "CEBOS", price: 25 },
    { key: "righe", label: "Righe / Colonne", price: 13 },
  ],
  esterna: [
    { key: "quarzo_bianco", label: "Quarzo bianco", price: 15 },
    { key: "quarzo_colorato", label: "Quarzo colorato", price: 18 },
  ],
} as const;

type Voce = PreventivoVoce;
type Preventivo = PreventivoRecord;

export default function Preventivi() {
  const [list, setList] = useState<Preventivo[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Preventivo | null>(null);
  const [viewing, setViewing] = useState<Preventivo | null>(null);

  const [head, setHead] = useState({
    cliente: "", ragione_sociale: "", luogo: "", data_lavoro: "", ora: "", note: "",
  });
  // map quantità interna/esterna per key + bordi count + extra rows
  const [qtyInt, setQtyInt] = useState<Record<string, number>>({});
  const [qtyExt, setQtyExt] = useState<Record<string, number>>({});
  const [bordi, setBordi] = useState<number>(0);
  const [extras, setExtras] = useState<{ label: string; quantita: number; prezzo: number }[]>([]);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      setList(await listPreventivi());
    } catch {
      toast.error("Errore");
    }
  }

  function reset() {
    setHead({ cliente: "", ragione_sociale: "", luogo: "", data_lavoro: "", ora: "", note: "" });
    setQtyInt({}); setQtyExt({}); setBordi(0); setExtras([]);
    setEditing(null);
  }

  function loadIntoForm(p: Preventivo) {
    setEditing(p);
    setHead({
      cliente: p.cliente, ragione_sociale: p.ragione_sociale ?? "",
      luogo: p.luogo ?? "", data_lavoro: p.data_lavoro ?? "", ora: p.ora ?? "", note: p.note ?? "",
    });
    const qi: Record<string, number> = {};
    const qe: Record<string, number> = {};
    let b = 0;
    const ex: typeof extras = [];
    p.voci.forEach((v) => {
      if (v.tipo === "interna" && v.key) qi[v.key] = v.quantita;
      else if (v.tipo === "esterna" && v.key) qe[v.key] = v.quantita;
      else if (v.tipo === "bordi") b = v.quantita;
      else ex.push({ label: v.label, quantita: v.quantita, prezzo: v.prezzo });
    });
    setQtyInt(qi); setQtyExt(qe); setBordi(b); setExtras(ex);
    setOpen(true);
  }

  const voci: Voce[] = useMemo(() => {
    const out: Voce[] = [];
    LISTINO.interna.forEach((it) => {
      const q = qtyInt[it.key] ?? 0;
      if (q > 0) out.push({ tipo: "interna", key: it.key, label: `Interna · ${it.label}`, unita: "m2", quantita: q, prezzo: it.price, totale: q * it.price });
    });
    LISTINO.esterna.forEach((it) => {
      const q = qtyExt[it.key] ?? 0;
      if (q > 0) out.push({ tipo: "esterna", key: it.key, label: `Esterna · ${it.label}`, unita: "m2", quantita: q, prezzo: it.price, totale: q * it.price });
    });
    if (bordi > 0) out.push({ tipo: "bordi", label: "Bordi porte/finestre", unita: "pezzo", quantita: bordi, prezzo: 35, totale: bordi * 35 });
    extras.forEach((e) => {
      if (e.label && e.quantita > 0) out.push({ tipo: "extra", label: e.label, unita: "pezzo", quantita: e.quantita, prezzo: e.prezzo, totale: e.quantita * e.prezzo });
    });
    return out;
  }, [qtyInt, qtyExt, bordi, extras]);

  const totale = useMemo(() => voci.reduce((s, v) => s + v.totale, 0), [voci]);

  async function save() {
    if (!head.cliente.trim()) { toast.error("Inserisci il nome cliente"); return; }
    if (voci.length === 0) { toast.error("Aggiungi almeno una voce"); return; }

    const payload = {
      cliente: head.cliente.trim(),
      ragione_sociale: head.ragione_sociale || null,
      luogo: head.luogo || null,
      data_lavoro: head.data_lavoro || null,
      ora: head.ora || null,
      note: head.note || null,
      voci: voci as any,
      totale,
    };

    try {
      await savePreventivo(payload, editing?.id);
      toast.success(editing ? "Aggiornato" : "Preventivo salvato");
    } catch {
      toast.error("Errore");
      return;
    }
    setOpen(false);
    reset();
    await load();
  }

  async function remove(id: string) {
    if (!confirm("Eliminare questo preventivo?")) return;
    try {
      await deletePreventivo(id);
      toast.success("Eliminato");
      await load();
    } catch {
      toast.error("Errore");
    }
  }

  const totVal = list.reduce((s, p) => s + Number(p.totale), 0);

  return (
    <AppLayout title="Preventivi" subtitle="Calcolo automatico per m²">
      <div className="grid grid-cols-2 gap-2 mb-4">
        <Card className="p-3 text-center">
          <div className="text-2xl font-display font-semibold">{list.length}</div>
          <div className="text-xs text-muted-foreground">Preventivi totali</div>
        </Card>
        <Card className="p-3 text-center">
          <div className="text-2xl font-display font-semibold text-accent">€{totVal.toFixed(0)}</div>
          <div className="text-xs text-muted-foreground">Valore totale</div>
        </Card>
      </div>

      <Button
        onClick={() => { reset(); setOpen(true); }}
        className="w-full mb-4 bg-accent hover:bg-accent/90 text-accent-foreground h-11"
      >
        <Plus className="h-4 w-4 mr-1" /> Nuovo preventivo
      </Button>

      <div className="space-y-3">
        {list.length === 0 ? (
          <Card className="p-8 text-center">
            <Receipt className="h-10 w-10 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Nessun preventivo ancora</p>
          </Card>
        ) : list.map((p) => (
          <Card key={p.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <button onClick={() => setViewing(p)} className="flex-1 min-w-0 text-left">
                <h3 className="font-semibold truncate">{p.cliente}</h3>
                {p.ragione_sociale && <p className="text-xs text-muted-foreground truncate">{p.ragione_sociale}</p>}
                <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-2">
                  {p.luogo && <span>📍 {p.luogo}</span>}
                  {p.data_lavoro && <span>📅 {new Date(p.data_lavoro).toLocaleDateString("it-IT")}</span>}
                  {p.ora && <span>🕐 {p.ora}</span>}
                </div>
                <div className="mt-2 text-2xl font-display font-semibold text-accent">€{Number(p.totale).toFixed(2)}</div>
              </button>
              <div className="flex flex-col gap-1">
                <Button size="icon" variant="ghost" onClick={() => loadIntoForm(p)} className="h-8 w-8"><Pencil className="h-3.5 w-3.5" /></Button>
                <Button size="icon" variant="ghost" onClick={() => remove(p.id)} className="h-8 w-8 text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* CREATE/EDIT */}
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
        <DialogContent className="max-w-md max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Modifica preventivo" : "Nuovo preventivo"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="col-span-2 space-y-1.5">
                <Label>Cliente *</Label>
                <Input value={head.cliente} onChange={(e) => setHead({ ...head, cliente: e.target.value })} />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Ragione sociale</Label>
                <Input value={head.ragione_sociale} onChange={(e) => setHead({ ...head, ragione_sociale: e.target.value })} />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Luogo</Label>
                <Input value={head.luogo} onChange={(e) => setHead({ ...head, luogo: e.target.value })} placeholder="Indirizzo cantiere" />
              </div>
              <div className="space-y-1.5">
                <Label>Data</Label>
                <Input type="date" value={head.data_lavoro} onChange={(e) => setHead({ ...head, data_lavoro: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Ora</Label>
                <Input type="time" value={head.ora} onChange={(e) => setHead({ ...head, ora: e.target.value })} />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Note</Label>
                <Textarea rows={2} value={head.note} onChange={(e) => setHead({ ...head, note: e.target.value })} />
              </div>
            </div>

            <div className="border-t border-border pt-3">
              <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-2">Tinteggiatura interna (€/m² — primer e riprese inclusi)</p>
              <div className="space-y-2">
                {LISTINO.interna.map((it) => (
                  <div key={it.key} className="flex items-center gap-2 text-sm">
                    <span className="flex-1">{it.label} <span className="text-muted-foreground">€{it.price}/m²</span></span>
                    <Input
                      type="number" min="0" step="0.5"
                      value={qtyInt[it.key] ?? ""}
                      onChange={(e) => setQtyInt({ ...qtyInt, [it.key]: Number(e.target.value) || 0 })}
                      placeholder="m²"
                      className="w-24 h-9"
                    />
                    <span className="w-16 text-right font-medium tabular-nums">€{((qtyInt[it.key] ?? 0) * it.price).toFixed(0)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-border pt-3">
              <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-2">Tinteggiatura esterna (€/m²)</p>
              <div className="space-y-2">
                {LISTINO.esterna.map((it) => (
                  <div key={it.key} className="flex items-center gap-2 text-sm">
                    <span className="flex-1">{it.label} <span className="text-muted-foreground">€{it.price}/m²</span></span>
                    <Input
                      type="number" min="0" step="0.5"
                      value={qtyExt[it.key] ?? ""}
                      onChange={(e) => setQtyExt({ ...qtyExt, [it.key]: Number(e.target.value) || 0 })}
                      placeholder="m²"
                      className="w-24 h-9"
                    />
                    <span className="w-16 text-right font-medium tabular-nums">€{((qtyExt[it.key] ?? 0) * it.price).toFixed(0)}</span>
                  </div>
                ))}
                <div className="flex items-center gap-2 text-sm">
                  <span className="flex-1">Bordi porte/finestre <span className="text-muted-foreground">€35/cad</span></span>
                  <Input
                    type="number" min="0" step="1"
                    value={bordi || ""}
                    onChange={(e) => setBordi(Number(e.target.value) || 0)}
                    placeholder="pz"
                    className="w-24 h-9"
                  />
                  <span className="w-16 text-right font-medium tabular-nums">€{(bordi * 35).toFixed(0)}</span>
                </div>
              </div>
            </div>

            <div className="border-t border-border pt-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Voci extra</p>
                <Button size="sm" variant="ghost" onClick={() => setExtras([...extras, { label: "", quantita: 1, prezzo: 0 }])} className="h-7 text-accent">
                  <Plus className="h-3.5 w-3.5 mr-1" /> Aggiungi
                </Button>
              </div>
              {extras.map((ex, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 mb-2">
                  <Input
                    placeholder="Descrizione"
                    value={ex.label}
                    onChange={(e) => setExtras(extras.map((x, j) => j === i ? { ...x, label: e.target.value } : x))}
                    className="col-span-5 h-9"
                  />
                  <Input
                    type="number" min="0" placeholder="Qtà" value={ex.quantita || ""}
                    onChange={(e) => setExtras(extras.map((x, j) => j === i ? { ...x, quantita: Number(e.target.value) } : x))}
                    className="col-span-3 h-9"
                  />
                  <Input
                    type="number" min="0" step="0.01" placeholder="€" value={ex.prezzo || ""}
                    onChange={(e) => setExtras(extras.map((x, j) => j === i ? { ...x, prezzo: Number(e.target.value) } : x))}
                    className="col-span-3 h-9"
                  />
                  <Button size="icon" variant="ghost" onClick={() => setExtras(extras.filter((_, j) => j !== i))} className="col-span-1 h-9 w-9 text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>

            <div className="border-t-2 border-foreground/10 pt-3 flex items-center justify-between">
              <span className="font-semibold">Totale</span>
              <span className="text-3xl font-display font-bold text-accent">€{totale.toFixed(2)}</span>
            </div>

            <Button onClick={save} className="w-full bg-accent hover:bg-accent/90 text-accent-foreground h-11">
              {editing ? "Salva modifiche" : "Salva preventivo"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* VIEW */}
      <Dialog open={!!viewing} onOpenChange={(v) => !v && setViewing(null)}>
        <DialogContent className="max-w-md max-h-[92vh] overflow-y-auto">
          {viewing && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2"><FileText className="h-5 w-5 text-accent" /> Preventivo</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <h3 className="font-semibold text-lg">{viewing.cliente}</h3>
                  {viewing.ragione_sociale && <p className="text-sm text-muted-foreground">{viewing.ragione_sociale}</p>}
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {viewing.luogo && <div><span className="text-muted-foreground">Luogo:</span> {viewing.luogo}</div>}
                  {viewing.data_lavoro && <div><span className="text-muted-foreground">Data:</span> {new Date(viewing.data_lavoro).toLocaleDateString("it-IT")}</div>}
                  {viewing.ora && <div><span className="text-muted-foreground">Ora:</span> {viewing.ora}</div>}
                </div>
                {viewing.note && <p className="text-sm bg-muted p-2 rounded-lg">{viewing.note}</p>}
                <div className="border-t border-border pt-2">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">Voci</p>
                  {viewing.voci.map((v, i) => (
                    <div key={i} className="flex justify-between py-1.5 border-b border-border/50 last:border-0 text-sm">
                      <div>
                        <div className="font-medium">{v.label}</div>
                        <div className="text-xs text-muted-foreground">{v.quantita} {v.unita === "m2" ? "m²" : "pz"} × €{v.prezzo}</div>
                      </div>
                      <div className="font-medium tabular-nums">€{v.totale.toFixed(2)}</div>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between border-t-2 border-foreground/10 pt-3">
                  <span className="font-semibold">Totale</span>
                  <span className="text-2xl font-display font-bold text-accent">€{Number(viewing.totale).toFixed(2)}</span>
                </div>
                <Button onClick={() => window.print()} variant="outline" className="w-full">Stampa</Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
