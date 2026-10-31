import {
  createDatabase,
  placeholderTeams,
  removePlaceholderData,
} from "./data-cleanup.js";
import {
  collections,
  active,
  type Collection,
  type Database,
  type Entity,
  type Settings,
  type Observation,
} from "./types.js";
import { validateBoard, validateObservation } from "./scoring.js";
import { GAME } from "./game.js";
let handle: IDBDatabase;
export let database: Database;
export let settings: Settings = {
  team: 11770,
  eventId: "local-event",
  syncUrl: "/api/sync",
};
export let persistenceError = "";
export let syncState = "Local";
const listeners = new Set<() => void>();
export const onChange = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
const emit = () => listeners.forEach((f) => f());
async function get<T>(key: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const q = handle.transaction("state").objectStore("state").get(key);
    q.onsuccess = () => resolve(q.result as T);
    q.onerror = () => reject(q.error);
  });
}
async function put(key: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = handle.transaction("state", "readwrite");
    tx.objectStore("state").put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
export async function initialize() {
  handle = await new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open("curiosity-biobuzz", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("state");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  database = (await get<Database>("database")) ?? createDatabase();
  settings = (await get<Settings>("settings")) ?? settings;
  await persist();
  if (!active(database.events).some((event) => event.id === settings.eventId))
    await saveSettings({ eventId: active(database.events)[0].id });
  const removed = placeholderTeams(database);
  for (const event of database.events) {
    const pit = await readDraft<{ pit: { team: number } }>(`pit:${event.id}`);
    if (pit && removed.has(pit.pit.team)) await clearDraft(`pit:${event.id}`);
    const match = await readDraft<Observation>(`match:${event.id}`);
    if (match && removed.has(match.team)) await clearDraft(`match:${event.id}`);
  }
}
export async function persist() {
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = handle.transaction("state", "readwrite"),
        store = tx.objectStore("state"),
        q = store.get("database");
      q.onsuccess = () => {
        database = removePlaceholderData(
          q.result ? mergeDatabases(q.result as Database, database) : database,
        );
        store.put(database, "database");
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    persistenceError = "";
  } catch (e) {
    persistenceError =
      "Local save failed. Export your data now; browser storage may be full.";
    emit();
    throw e;
  }
}
export async function saveSettings(value: Partial<Settings>) {
  settings = { ...settings, ...value };
  await put("settings", settings);
  emit();
}
export async function saveEntity<K extends Collection>(
  key: K,
  entity: Database[K][number],
) {
  const list = database[key] as Entity[],
    i = list.findIndex((x) => x.id === entity.id);
  const next = { ...entity, updatedAt: new Date().toISOString() };
  if (i < 0) list.push(next);
  else list[i] = next;
  await persist();
  emit();
  scheduleSync();
}
export async function saveDraft(key: string, value: unknown) {
  try {
    await put(`draft:${key}`, value);
  } catch {
    persistenceError =
      "Draft could not be saved. Export before closing this tab.";
    emit();
  }
}
export async function readDraft<T>(key: string) {
  return get<T>(`draft:${key}`);
}
export async function clearDraft(key: string) {
  await put(`draft:${key}`, undefined);
}
function canonical(key: Collection, e: Entity): string {
  const x = e as unknown as Record<string, unknown>;
  return key === "observations"
    ? `${x.eventId}:${x.match}:${x.team}`
    : key === "pits" || key === "picks"
      ? `${x.eventId}:${x.team}`
      : key === "teams"
        ? String(x.number)
        : key === "boards"
          ? `${x.eventId}:${x.match}`
          : e.id;
}
export function mergeDatabases(a: Database, b: Database): Database {
  const out = structuredClone(a);
  for (const key of collections) {
    const map = new Map<string, Entity>();
    for (const item of [...a[key], ...b[key]]) {
      const k = canonical(key, item),
        prev = map.get(k);
      if (
        !prev ||
        item.updatedAt > prev.updatedAt ||
        (item.updatedAt === prev.updatedAt &&
          JSON.stringify(item) > JSON.stringify(prev))
      )
        map.set(k, item);
    }
    (out[key] as Entity[]) = Array.from(map.values());
  }
  return out;
}
export function validateDatabase(value: unknown): asserts value is Database {
  if (
    !value ||
    typeof value !== "object" ||
    (value as Database).schemaVersion !== 1
  )
    throw new Error("Expected a BIOBUZZ JSON export with schemaVersion 1.");
  const db = value as Database;
  for (const key of collections) {
    if (!Array.isArray(db[key])) throw new Error(`Missing collection: ${key}`);
    for (const item of db[key])
      if (
        !item ||
        typeof item.id !== "string" ||
        !Number.isFinite(Date.parse(item.updatedAt))
      )
        throw new Error(`Invalid ${key} identity or timestamp.`);
  }
  const positive = (n: unknown) =>
    typeof n === "number" && Number.isInteger(n) && n > 0;
  for (const t of db.teams)
    if (!positive(t.number) || typeof t.name !== "string" || !t.name.trim())
      throw new Error("Every team requires a positive number and name.");
  for (const e of db.events)
    if (
      typeof e.name !== "string" ||
      !Array.isArray(e.teams) ||
      !e.teams.every(positive) ||
      !e.thresholds ||
      Object.values(e.thresholds).some(
        (v) => typeof v !== "number" || !Number.isFinite(v) || v < 0,
      )
    )
      throw new Error("Invalid event or RP thresholds.");
  for (const o of db.observations) {
    if (
      !o.auto ||
      !o.tele ||
      !["red", "blue"].includes(o.alliance) ||
      typeof o.eventId !== "string"
    )
      throw new Error("Malformed observation.");
    const errors = validateObservation(o);
    if (errors.length)
      throw new Error(`Team ${o.team}, match ${o.match}: ${errors.join(" ")}`);
  }
  for (const b of db.boards) {
    const errors = validateBoard(b);
    if (errors.length) throw new Error(`Match ${b.match}: ${errors.join(" ")}`);
  }
  for (const m of db.matches) {
    if (
      !positive(m.number) ||
      !Array.isArray(m.red) ||
      !Array.isArray(m.blue) ||
      m.red.length !== 2 ||
      m.blue.length !== 2 ||
      new Set([...m.red, ...m.blue]).size !== 4 ||
      ![...m.red, ...m.blue].every(positive)
    )
      throw new Error(
        "Every scheduled match requires four distinct positive team numbers.",
      );
    for (const r of [m.redResult, m.blueResult])
      if (r) {
        if (
          ["score", "foulPoints", "movement", "tips", "auto"].some(
            (k) =>
              !Number.isInteger(r[k as keyof typeof r]) ||
              Number(r[k as keyof typeof r]) < 0,
          ) ||
          r.foulPoints > r.score ||
          (r.rp !== undefined &&
            (!Number.isInteger(r.rp) ||
              r.rp < 0 ||
              r.rp > GAME.rp.win + 3 * GAME.rp.achievement))
        )
          throw new Error("Invalid official result or RP count.");
      }
  }
  for (const p of db.pits)
    if (
      !positive(p.team) ||
      !p.answers ||
      !Array.isArray(p.routes) ||
      typeof p.photo !== "string" ||
      (p.photo && !/^data:image\/(jpeg|png|webp);base64,/.test(p.photo)) ||
      p.routes.some(
        (r) =>
          !Array.isArray(r.paths) ||
          r.paths.some(
            (path) =>
              !Array.isArray(path) ||
              path.some(
                (pt) =>
                  !Number.isFinite(pt.x) ||
                  !Number.isFinite(pt.y) ||
                  pt.x < 0 ||
                  pt.y < 0 ||
                  pt.x > GAME.limits.fieldInches ||
                  pt.y > GAME.limits.fieldInches,
              ),
          ),
      )
    )
      throw new Error("Invalid pit data, photo, or vector route.");
}
export async function importDatabase(value: unknown) {
  validateDatabase(value);
  database = mergeDatabases(database, value);
  await persist();
  emit();
  void sync();
}
let syncing = false;
let resync = false;
let syncTimer: ReturnType<typeof setTimeout> | undefined;
function scheduleSync() {
  clearTimeout(syncTimer);
  syncState = "Local · sync pending";
  emit();
  syncTimer = setTimeout(() => void sync(), 300);
}
export async function sync() {
  clearTimeout(syncTimer);
  if (syncing) {
    resync = true;
    return;
  }
  if (!navigator.onLine || !settings.syncUrl) {
    syncState = navigator.onLine ? "Local" : "Offline";
    emit();
    return;
  }
  syncing = true;
  syncState = "Syncing";
  emit();
  try {
    const response = await fetch(settings.syncUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(database),
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) throw new Error(String(response.status));
    const data: unknown = await response.json();
    validateDatabase(data);
    database = mergeDatabases(database, data);
    await persist();
    syncState = "Synced";
  } catch {
    syncState = "Local · sync pending";
  } finally {
    syncing = false;
    emit();
    if (resync) {
      resync = false;
      void sync();
    }
  }
}
export function exportFile(
  filename: string,
  content: string | Blob,
  type = "application/json",
) {
  const url = URL.createObjectURL(
    typeof content === "string" ? new Blob([content], { type }) : content,
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export const escapeCSV = (value: unknown) => {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
};
export function parseCSV(input: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false;
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (c === '"') {
      if (quoted && input[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && input[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (quoted) throw new Error("CSV has an unclosed quote.");
  row.push(cell);
  if (row.some((x) => x.trim())) rows.push(row);
  const headers =
    rows.shift()?.map((h) => h.replace(/^\uFEFF/, "").trim()) ?? [];
  if (new Set(headers).size !== headers.length)
    throw new Error("CSV headers must be unique.");
  return rows.map((r) =>
    Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ""])),
  );
}
/** Lossless CSV envelope: JSON field preserves nested routes/photos/scoring fields. */
export function exportCSV(db: Database): string {
  return [
    "collection,id,updatedAt,data",
    ...collections.flatMap((key) =>
      db[key].map((e) =>
        [key, e.id, e.updatedAt, JSON.stringify(e)].map(escapeCSV).join(","),
      ),
    ),
  ].join("\r\n");
}
export function datasetFromCSV(input: string): Database {
  const out: Database = {
    schemaVersion: 1,
    teams: [],
    events: [],
    observations: [],
    boards: [],
    matches: [],
    pits: [],
    notes: [],
    picks: [],
  };
  for (const row of parseCSV(input)) {
    if (!collections.includes(row.collection as Collection))
      throw new Error(
        "Unknown CSV collection. Use a complete exported dataset CSV.",
      );
    const data: unknown = JSON.parse(row.data);
    (out[row.collection as Collection] as unknown[]).push(data);
  }
  validateDatabase(out);
  return out;
}
export function observationCSV(obs: Observation[]): string {
  const fields = [
    "team",
    "match",
    "alliance",
    "scout",
    "auto",
    "tele",
    "bottom",
    "minor",
    "major",
    "earlyNectar",
    "breakdown",
    "note",
  ] as const;
  return [
    fields.join(","),
    ...obs.map((o) =>
      fields
        .map((k) =>
          escapeCSV(typeof o[k] === "object" ? JSON.stringify(o[k]) : o[k]),
        )
        .join(","),
    ),
  ].join("\r\n");
}
export function eventTeams() {
  const event = active(database.events).find((e) => e.id === settings.eventId);
  return active(database.teams).filter(
    (t) => !event || event.teams.includes(t.number),
  );
}
