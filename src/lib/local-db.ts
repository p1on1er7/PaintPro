import { appConfig } from "@/lib/app-config";

export type LocalUser = {
  id: string;
  email: string;
  displayName: string;
  mode: "local";
};

type TableRow = {
  id: string;
  created_at?: string;
  updated_at?: string;
};

type LocalDbState = {
  version: 1;
  user: LocalUser;
  tables: Record<string, TableRow[]>;
};

const STORAGE_KEY = "paintpro.local-db.v1";
let memoryState: LocalDbState | null = null;

function generateId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `pp-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

const defaultUser = (): LocalUser => ({
  id: generateId(),
  email: appConfig.localOwnerEmail,
  displayName: appConfig.localOwnerName,
  mode: "local",
});

const defaultState = (): LocalDbState => ({
  version: 1,
  user: defaultUser(),
  tables: {},
});

function readState(): LocalDbState {
  if (typeof window === "undefined") return defaultState();

  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    if (memoryState) return memoryState;
    memoryState = defaultState();
    return memoryState;
  }

  if (!raw) {
    const initial = defaultState();
    writeState(initial);
    return initial;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<LocalDbState>;
    const state: LocalDbState = {
      version: 1,
      user: parsed.user && parsed.user.id ? { ...defaultUser(), ...parsed.user } : defaultUser(),
      tables: parsed.tables ?? {},
    };
    writeState(state);
    return state;
  } catch {
    const initial = defaultState();
    writeState(initial);
    return initial;
  }
}

function writeState(next: LocalDbState) {
  if (typeof window === "undefined") return;
  memoryState = next;

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Fall back to in-memory state when localStorage is unavailable.
  }
}

export function ensureLocalUser() {
  const state = readState();
  return state.user;
}

export function readLocalTable<T extends TableRow>(table: string): T[] {
  const state = readState();
  return (state.tables[table] ?? []) as T[];
}

export function saveLocalRow<T extends TableRow>(
  table: string,
  row: Omit<T, "id" | "created_at" | "updated_at"> & Partial<Pick<T, "id" | "created_at" | "updated_at">>,
): T {
  const state = readState();
  const list = [...(state.tables[table] ?? [])] as T[];
  const now = new Date().toISOString();
  const id = row.id ?? generateId();
  const nextRow = {
    ...row,
    id,
    created_at: row.created_at ?? list.find((item) => item.id === id)?.created_at ?? now,
    updated_at: now,
  } as T;

  const index = list.findIndex((item) => item.id === id);
  if (index >= 0) list[index] = nextRow;
  else list.unshift(nextRow);

  state.tables[table] = list;
  writeState(state);
  return nextRow;
}

export function deleteLocalRow(table: string, id: string) {
  const state = readState();
  state.tables[table] = (state.tables[table] ?? []).filter((item) => item.id !== id);
  writeState(state);
}
