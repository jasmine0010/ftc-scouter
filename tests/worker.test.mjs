import test from "node:test";
import assert from "node:assert/strict";
import { TeamStoreCore, handle } from "../worker/core.mjs";
import { createDatabase } from "../dist/assets/data-cleanup.js";

// Same shape as a Durable Object's storage: list() / put(entries) / delete(keys).
class MemoryStorage {
  constructor() {
    this.map = new Map();
  }
  async list() {
    return new Map(this.map);
  }
  async put(entries) {
    assert.ok(Object.keys(entries).length <= 128, "at most 128 keys per put");
    for (const [k, v] of Object.entries(entries)) this.map.set(k, v);
  }
  async delete(keys) {
    for (const k of keys) this.map.delete(k);
  }
}
const team = (number, name, updatedAt) => ({
  id: String(number),
  number,
  name,
  updatedAt,
});
const device = (teams) => {
  const db = createDatabase();
  db.teams.push(...teams);
  return db;
};
const env = {
  TEAM_CODE: "bees-2026",
  ALLOWED_ORIGINS: "https://example.github.io, http://127.0.0.1:8766/",
};
const post = (body, headers = {}) =>
  new Request("https://sync.example/api/sync", {
    method: "POST",
    headers: {
      Origin: "https://example.github.io",
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });

test("two devices' saves merge and survive a restart of the store", async () => {
  const storage = new MemoryStorage();
  const store = new TeamStoreCore(storage);
  await store.sync(
    device([team(24079, "Partner", "2026-11-01T00:00:00.000Z")]),
  );
  const merged = await store.sync(
    device([team(21380, "Rival", "2026-11-01T00:01:00.000Z")]),
  );
  assert.ok(merged.teams.some((t) => t.number === 24079));
  assert.ok(merged.teams.some((t) => t.number === 21380));
  // A fresh instance reads everything back from storage.
  const reloaded = await new TeamStoreCore(storage).sync(device([]));
  assert.deepEqual(
    reloaded.teams.map((t) => t.number).sort(),
    merged.teams.map((t) => t.number).sort(),
  );
});

test("the newer edit wins and only changed records are rewritten", async () => {
  const storage = new MemoryStorage();
  const store = new TeamStoreCore(storage);
  await store.sync(
    device([team(24079, "Old name", "2026-11-01T00:00:00.000Z")]),
  );
  let writes = 0;
  const put = storage.put.bind(storage);
  storage.put = async (entries) => {
    writes += Object.keys(entries).length;
    return put(entries);
  };
  const merged = await store.sync(
    device([team(24079, "New name", "2026-11-02T00:00:00.000Z")]),
  );
  assert.equal(merged.teams.find((t) => t.number === 24079).name, "New name");
  assert.equal(writes, 1);
  const stale = await store.sync(
    device([team(24079, "Old name", "2026-11-01T00:00:00.000Z")]),
  );
  assert.equal(stale.teams.find((t) => t.number === 24079).name, "New name");
});

test("sync requires the team code and an allowed site", async () => {
  const deps = {
    sync: async (db) => db,
    fetch: () => assert.fail("no network"),
  };
  const db = device([]);
  assert.equal((await handle(post(db), env, deps)).status, 401);
  assert.equal(
    (await handle(post(db, { "X-Team-Code": "wrong-code" }), env, deps)).status,
    401,
  );
  const ok = await handle(post(db, { "X-Team-Code": "bees-2026" }), env, deps);
  assert.equal(ok.status, 200);
  assert.equal(
    ok.headers.get("Access-Control-Allow-Origin"),
    "https://example.github.io",
  );
  const other = await handle(
    post(db, { "X-Team-Code": "bees-2026", Origin: "https://evil.example" }),
    env,
    deps,
  );
  assert.equal(other.status, 403);
  const unset = await handle(
    post(db, { "X-Team-Code": "x" }),
    {
      ...env,
      TEAM_CODE: "",
    },
    deps,
  );
  assert.equal(unset.status, 503);
});

test("browser preflight is answered for allowed sites", async () => {
  const res = await handle(
    new Request("https://sync.example/api/sync", {
      method: "OPTIONS",
      headers: { Origin: "http://127.0.0.1:8766" },
    }),
    env,
    { sync: async () => assert.fail(), fetch: async () => assert.fail() },
  );
  assert.equal(res.status, 204);
  assert.match(res.headers.get("Access-Control-Allow-Headers"), /X-Team-Code/);
});

test("invalid datasets are rejected without touching storage", async () => {
  const storage = new MemoryStorage();
  const store = new TeamStoreCore(storage);
  const res = await handle(
    post({ schemaVersion: 2 }, { "X-Team-Code": "bees-2026" }),
    env,
    { sync: (db) => store.sync(db), fetch: async () => assert.fail() },
  );
  assert.equal(res.status, 400);
  assert.equal(storage.map.size, 0);
});

test("FTCScout lookups go through the injected fetch", async () => {
  const calls = [];
  const res = await handle(
    new Request("https://sync.example/api/ftcscout?team=11770", {
      headers: { Origin: "https://example.github.io" },
    }),
    env,
    {
      sync: async () => assert.fail(),
      fetch: async (url) => {
        calls.push(url);
        return Response.json(url.includes("awards") ? [] : { tot: 1 });
      },
    },
  );
  assert.equal(res.status, 200);
  assert.equal(calls.length, 2);
  assert.deepEqual(await res.json(), { stats: { tot: 1 }, awards: [] });
});
