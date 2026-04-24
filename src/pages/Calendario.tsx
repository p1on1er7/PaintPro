import { useEffect, useMemo, useState } from "react";
import { deleteEvento, listEventi, saveEvento, type EventoRecord } from "@/lib/app-data";
import AppLayout from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, ChevronLeft, ChevronRight, Trash2, Pencil, MapPin, Clock, User } from "lucide-react";
import {
  startOfMonth, endOfMonth, eachDayOfInterval, format, isSameDay, addMonths, subMonths,
  startOfWeek, endOfWeek, isSameMonth, parseISO,
} from "date-fns";
import { it } from "date-fns/locale";

type Evento = {
  id: EventoRecord["id"];
  titolo: EventoRecord["titolo"];
  descrizione: EventoRecord["descrizione"];
  data_inizio: EventoRecord["data_inizio"];
  data_fine: EventoRecord["data_fine"];
  luogo: EventoRecord["luogo"];
  cliente: EventoRecord["cliente"];
  tipo: EventoRecord["tipo"];
};

const TIPI = [
  { id: "lavoro", label: "Lavoro", color: "bg-accent text-accent-foreground" },
  { id: "sopralluogo", label: "Sopralluogo", color: "bg-secondary text-secondary-foreground" },
  { id: "consegna", label: "Consegna", color: "bg-warning text-warning-foreground" },
  { id: "altro", label: "Altro", color: "bg-muted text-muted-foreground" },
];

export default function Calendario() {
  const [eventi, setEventi] = useState<Evento[]>([]);
  const [cursor, setCursor] = useState(new Date());
  const [selected, setSelected] = useState(new Date());
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Evento | null>(null);

  const [form, setForm] = useState({
    titolo: "",
    descrizione: "",
    data: format(new Date(), "yyyy-MM-dd"),
    ora_inizio: "09:00",
    ora_fine: "",
    luogo: "",
    cliente: "",
    tipo: "lavoro",
  });

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      setEventi(await listEventi());
    } catch {
      toast.error("Errore");
    }
  }

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(cursor), { locale: it });
    const end = endOfWeek(endOfMonth(cursor), { locale: it });
    return eachDayOfInterval({ start, end });
  }, [cursor]);

  const eventsByDay = useMemo(() => {
    const m: Record<string, Evento[]> = {};
    eventi.forEach((e) => {
      const k = format(parseISO(e.data_inizio), "yyyy-MM-dd");
      (m[k] ??= []).push(e);
    });
    return m;
  }, [eventi]);

  const eventiSelezionati = eventsByDay[format(selected, "yyyy-MM-dd")] ?? [];

  function openCreate() {
    setEditing(null);
    setForm({
      titolo: "", descrizione: "",
      data: format(selected, "yyyy-MM-dd"),
      ora_inizio: "09:00", ora_fine: "",
      luogo: "", cliente: "", tipo: "lavoro",
    });
    setOpen(true);
  }

  function openEdit(ev: Evento) {
    setEditing(ev);
    const dt = parseISO(ev.data_inizio);
    setForm({
      titolo: ev.titolo,
      descrizione: ev.descrizione ?? "",
      data: format(dt, "yyyy-MM-dd"),
      ora_inizio: format(dt, "HH:mm"),
      ora_fine: ev.data_fine ? format(parseISO(ev.data_fine), "HH:mm") : "",
      luogo: ev.luogo ?? "",
      cliente: ev.cliente ?? "",
      tipo: ev.tipo,
    });
    setOpen(true);
  }

  async function save() {
    if (!form.titolo.trim()) { toast.error("Inserisci un titolo"); return; }
    const data_inizio = new Date(`${form.data}T${form.ora_inizio}:00`).toISOString();
    const data_fine = form.ora_fine ? new Date(`${form.data}T${form.ora_fine}:00`).toISOString() : null;

    const payload = {
      titolo: form.titolo.trim(),
      descrizione: form.descrizione || null,
      data_inizio, data_fine,
      luogo: form.luogo || null,
      cliente: form.cliente || null,
      tipo: form.tipo,
    };

    try {
      await saveEvento(payload, editing?.id);
      toast.success(editing ? "Aggiornato" : "Aggiunto");
    } catch {
      toast.error("Errore");
      return;
    }

    setOpen(false);
    await load();
  }

  async function remove(id: string) {
    if (!confirm("Eliminare?")) return;
    try {
      await deleteEvento(id);
      toast.success("Eliminato");
      await load();
    } catch {
      toast.error("Errore");
    }
  }

  return (
    <AppLayout title="Calendario" subtitle="Lavori e attività">
      <Card className="p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <Button size="icon" variant="ghost" onClick={() => setCursor(subMonths(cursor, 1))}><ChevronLeft className="h-4 w-4" /></Button>
          <h2 className="font-display font-semibold capitalize">{format(cursor, "MMMM yyyy", { locale: it })}</h2>
          <Button size="icon" variant="ghost" onClick={() => setCursor(addMonths(cursor, 1))}><ChevronRight className="h-4 w-4" /></Button>
        </div>
        <div className="grid grid-cols-7 gap-1 mb-1">
          {["L", "M", "M", "G", "V", "S", "D"].map((d, i) => (
            <div key={i} className="text-[10px] text-center text-muted-foreground font-semibold py-1">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {days.map((d) => {
            const has = (eventsByDay[format(d, "yyyy-MM-dd")]?.length ?? 0) > 0;
            const isSelected = isSameDay(d, selected);
            const isToday = isSameDay(d, new Date());
            const isCurrentMonth = isSameMonth(d, cursor);
            return (
              <button
                key={d.toISOString()}
                onClick={() => setSelected(d)}
                className={`aspect-square flex flex-col items-center justify-center rounded-lg text-sm relative transition-all
                  ${isSelected ? "bg-accent text-accent-foreground font-semibold shadow-accent" :
                    isToday ? "bg-secondary/15 text-secondary font-semibold" :
                    !isCurrentMonth ? "text-muted-foreground/40" : "hover:bg-muted text-foreground"}`}
              >
                <span>{format(d, "d")}</span>
                {has && !isSelected && <span className="absolute bottom-1 h-1 w-1 rounded-full bg-accent" />}
              </button>
            );
          })}
        </div>
      </Card>

      <div className="flex items-center justify-between mb-2 px-1">
        <h3 className="font-semibold">{format(selected, "EEEE d MMMM", { locale: it })}</h3>
        <Button size="sm" onClick={openCreate} className="h-8 bg-accent hover:bg-accent/90 text-accent-foreground">
          <Plus className="h-4 w-4 mr-1" /> Nuovo
        </Button>
      </div>

      <div className="space-y-2">
        {eventiSelezionati.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            Nessuna attività in questa data
          </Card>
        ) : eventiSelezionati.map((ev) => {
          const tipo = TIPI.find((t) => t.id === ev.tipo) ?? TIPI[0];
          return (
            <Card key={ev.id} className="p-3 flex items-start gap-3">
              <div className={`pp-chip ${tipo.color} text-[10px]`}>{tipo.label}</div>
              <div className="flex-1 min-w-0">
                <h4 className="font-semibold text-sm">{ev.titolo}</h4>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground mt-1">
                  <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {format(parseISO(ev.data_inizio), "HH:mm")}{ev.data_fine ? `–${format(parseISO(ev.data_fine), "HH:mm")}` : ""}</span>
                  {ev.luogo && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {ev.luogo}</span>}
                  {ev.cliente && <span className="flex items-center gap-1"><User className="h-3 w-3" /> {ev.cliente}</span>}
                </div>
                {ev.descrizione && <p className="text-xs mt-1 text-muted-foreground">{ev.descrizione}</p>}
              </div>
              <div className="flex flex-col gap-1">
                <Button size="icon" variant="ghost" onClick={() => openEdit(ev)} className="h-8 w-8"><Pencil className="h-3.5 w-3.5" /></Button>
                <Button size="icon" variant="ghost" onClick={() => remove(ev.id)} className="h-8 w-8 text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
            </Card>
          );
        })}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md max-h-[92vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Modifica attività" : "Nuova attività"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Titolo *</Label>
              <Input value={form.titolo} onChange={(e) => setForm({ ...form, titolo: e.target.value })} placeholder="es. Tinteggiatura facciata via Roma" />
            </div>
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIPI.map((t) => <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1.5">
                <Label>Data</Label>
                <Input type="date" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Inizio</Label>
                <Input type="time" value={form.ora_inizio} onChange={(e) => setForm({ ...form, ora_inizio: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Fine</Label>
                <Input type="time" value={form.ora_fine} onChange={(e) => setForm({ ...form, ora_fine: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Cliente</Label>
              <Input value={form.cliente} onChange={(e) => setForm({ ...form, cliente: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Luogo</Label>
              <Input value={form.luogo} onChange={(e) => setForm({ ...form, luogo: e.target.value })} placeholder="Indirizzo" />
            </div>
            <div className="space-y-1.5">
              <Label>Note</Label>
              <Textarea rows={2} value={form.descrizione} onChange={(e) => setForm({ ...form, descrizione: e.target.value })} />
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
