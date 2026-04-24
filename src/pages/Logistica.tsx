import { useEffect, useState } from "react";
import {
  deleteLogisticaItem,
  listLogisticaItems,
  moveLogisticaItem,
  saveLogisticaItem,
  type LogisticaItemRecord,
} from "@/lib/app-data";
import AppLayout from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Trash2, Wrench, Palette, ShoppingCart, Archive, Pencil } from "lucide-react";

const CATEGORIES = [
  { id: "attrezzatura", label: "Attrezzi e strumenti", icon: Wrench, color: "text-secondary" },
  { id: "colori", label: "Vernici e materiali", icon: Palette, color: "text-accent" },
  { id: "spesa", label: "Lista spesa", icon: ShoppingCart, color: "text-warning" },
  { id: "storico", label: "Storico acquisti", icon: Archive, color: "text-muted-foreground" },
] as const;

type Item = {
  id: LogisticaItemRecord["id"];
  category: LogisticaItemRecord["category"];
  name: LogisticaItemRecord["name"];
  quantity: LogisticaItemRecord["quantity"];
  unit: LogisticaItemRecord["unit"];
  price: LogisticaItemRecord["price"];
  notes: LogisticaItemRecord["notes"];
  metadata: LogisticaItemRecord["metadata"];
};

export default function Logistica() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Item | null>(null);
  const [open, setOpen] = useState(false);
  const [activeCat, setActiveCat] = useState<string>("attrezzatura");

  const [form, setForm] = useState({
    name: "",
    quantity: 1,
    unit: "",
    price: "",
    notes: "",
    brand: "",
    code: "",
  });

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      setItems(await listLogisticaItems());
    } catch {
      toast.error("Errore caricamento");
    }
    setLoading(false);
  }

  function openCreate(category: string) {
    setActiveCat(category);
    setEditing(null);
    setForm({ name: "", quantity: 1, unit: "", price: "", notes: "", brand: "", code: "" });
    setOpen(true);
  }

  function openEdit(item: Item) {
    setActiveCat(item.category);
    setEditing(item);
    setForm({
      name: item.name,
      quantity: Number(item.quantity ?? 1),
      unit: item.unit ?? "",
      price: item.price?.toString() ?? "",
      notes: item.notes ?? "",
      brand: item.metadata?.brand ?? "",
      code: item.metadata?.code ?? "",
    });
    setOpen(true);
  }

  async function save() {
    if (!form.name.trim()) {
      toast.error("Inserisci un nome");
      return;
    }

    const payload = {
      category: activeCat,
      name: form.name.trim(),
      quantity: Number(form.quantity) || 1,
      unit: form.unit || null,
      price: form.price ? Number(form.price) : null,
      notes: form.notes || null,
      metadata: { brand: form.brand, code: form.code },
    };

    try {
      await saveLogisticaItem(payload, editing?.id);
      toast.success(editing ? "Aggiornato" : "Aggiunto");
    } catch {
      toast.error("Errore");
      return;
    }
    setOpen(false);
    await load();
  }

  async function remove(id: string) {
    if (!confirm("Eliminare questo elemento?")) return;
    try {
      await deleteLogisticaItem(id);
      toast.success("Eliminato");
      await load();
    } catch {
      toast.error("Errore");
    }
  }

  async function moveTo(item: Item, newCat: string) {
    try {
      await moveLogisticaItem(item.id, newCat);
      toast.success(newCat === "storico" ? "Spostato in storico" : "Spostato");
      await load();
    } catch {
      toast.error("Errore");
    }
  }

  const counts = CATEGORIES.reduce((acc, c) => {
    acc[c.id] = items.filter((i) => i.category === c.id).length;
    return acc;
  }, {} as Record<string, number>);

  return (
    <AppLayout title="Logistica" subtitle="Attrezzi, materiali, spesa, storico">
      <div className="grid grid-cols-4 gap-2 mb-5">
        {CATEGORIES.map(({ id, label, icon: Icon, color }) => (
          <Card key={id} className="p-3 text-center">
            <Icon className={`h-5 w-5 mx-auto mb-1 ${color}`} />
            <div className="text-2xl font-display font-semibold">{counts[id] ?? 0}</div>
            <div className="text-[10px] text-muted-foreground leading-tight">{label.split(" ")[0]}</div>
          </Card>
        ))}
      </div>

      {CATEGORIES.map(({ id, label, icon: Icon, color }) => {
        const list = items.filter((i) => i.category === id);
        return (
          <div key={id} className="mb-5">
            <div className="flex items-center justify-between mb-2 px-1">
              <div className="flex items-center gap-2">
                <Icon className={`h-4 w-4 ${color}`} />
                <h3 className="font-semibold text-sm">{label}</h3>
                <span className="text-xs text-muted-foreground">({list.length})</span>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => openCreate(id)}
                className="h-8 text-accent hover:text-accent hover:bg-accent/10"
              >
                <Plus className="h-4 w-4 mr-1" /> Aggiungi
              </Button>
            </div>
            <Card className="divide-y divide-border">
              {loading ? (
                <div className="p-4 text-center text-sm text-muted-foreground">Caricamento…</div>
              ) : list.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">Vuoto. Aggiungi un elemento.</div>
              ) : (
                list.map((item) => (
                  <div key={item.id} className="p-3 flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">{item.name}</div>
                      <div className="text-xs text-muted-foreground flex flex-wrap gap-x-2">
                        {item.quantity && <span>Qtà: {item.quantity} {item.unit ?? ""}</span>}
                        {item.price != null && <span>€{Number(item.price).toFixed(2)}</span>}
                        {item.metadata?.brand && <span>{item.metadata.brand}</span>}
                        {item.metadata?.code && <span className="font-mono">{item.metadata.code}</span>}
                      </div>
                      {item.notes && <p className="text-xs text-muted-foreground mt-1 italic">{item.notes}</p>}
                      {id === "spesa" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => moveTo(item, "storico")}
                          className="h-7 text-[11px] mt-1 text-success hover:bg-success/10 hover:text-success px-2"
                        >
                          ✓ Acquistato → storico
                        </Button>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(item)} className="h-8 w-8">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => remove(item.id)} className="h-8 w-8 text-destructive hover:text-destructive">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </Card>
          </div>
        );
      })}

      {/* DIALOG */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Modifica elemento" : "Nuovo elemento"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Categoria</Label>
              <Select value={activeCat} onValueChange={setActiveCat}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Nome *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="es. Pennello tondo n.10" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label>Quantità</Label>
                <Input type="number" min="0" step="0.5" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })} />
              </div>
              <div className="space-y-1.5">
                <Label>Unità</Label>
                <Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="pz, lt, kg, m²" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label>Marca</Label>
                <Input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} placeholder="CEBOS, Sikkens..." />
              </div>
              <div className="space-y-1.5">
                <Label>Codice/RAL</Label>
                <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="RAL 9010" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Prezzo (€)</Label>
              <Input type="number" min="0" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Note</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} placeholder="Note libere" />
            </div>
            <Button onClick={save} className="w-full bg-accent hover:bg-accent/90 text-accent-foreground h-11">
              {editing ? "Salva modifiche" : "Aggiungi"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
