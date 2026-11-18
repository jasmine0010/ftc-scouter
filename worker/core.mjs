// Platform-independent parts of the sync service, so they can be tested with Node.
// Merge and validation are the app's own functions (built into dist/ by `npm run build`).
import { mergeDatabases, validateDatabase } from "../dist/assets/storage.js";
import { removePlaceholderData } from "../dist/assets/data-cleanup.js";

export const collections = [
  "teams",
  "events",
  "observations",
  "boards",
  "matches",
  "pits",
  "notes",
  "picks",
];
const empty = () => ({
  schemaVersion: 1,
  ...Object.fromEntries(collections.map((c) => [c, []])),
});
const keyOf = (collection, record) => `${collection}:${record.id}`;

/**
 * The team dataset, stored one record per key so no single value grows large.
 * `storage` needs list(), put(entries) and delete(keys), like a Durable Object's.
 */
export class TeamStoreCore {
  constructor(storage) {
    this.storage = storage;
    this.db = null;
    this.saved = new Map(); // key -> JSON string as stored
  }
  async load() {
    if (this.db) return this.db;
    const db = empty();
    for (const [key, value] of await this.storage.list()) {
      const collection = key.slice(0, key.indexOf(":"));
      if (!collections.includes(collection)) continue;
      db[collection].push(JSON.parse(value));
      this.saved.set(key, value);
    }
    this.db = db;
    return db;
  }
  /** Merge one device's dataset into the team dataset and return the result. */
  async sync(input) {
    validateDatabase(input);
    const merged = removePlaceholderData(
      mergeDatabases(await this.load(), input),
    );
    const next = new Map();
    for (const collection of collections)
      for (const record of merged[collection])
        next.set(keyOf(collection, record), JSON.stringify(record));
    const changed = [...next].filter(([k, v]) => this.saved.get(k) !== v);
    const removed = [...this.saved.keys()].filter((k) => !next.has(k));
    // Durable Object storage accepts at most 128 keys per call.
    for (let i = 0; i < changed.length; i += 128)
      await this.storage.put(Object.fromEntries(changed.slice(i, i + 128)));
    for (let i = 0; i < removed.length; i += 128)
      await this.storage.delete(removed.slice(i, i + 128));
    this.saved = next;
    this.db = merged;
    return merged;
  }
}

const allowedOrigin = (request, env) => {
  const origin = request.headers.get("Origin");
  const allowed = String(env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim().replace(/\/+$/, ""))
    .filter(Boolean);
  return origin && allowed.includes(origin) ? origin : null;
};
const respond = (request, env, status, body) => {
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    Vary: "Origin",
  };
  const origin = allowedOrigin(request, env);
  if (origin) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
    headers["Access-Control-Allow-Headers"] = "Content-Type, X-Team-Code";
    headers["Access-Control-Max-Age"] = "86400";
  }
  return new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers,
  });
};
const teamCodeOk = (request, env) => {
  const expected = String(env.TEAM_CODE ?? "");
  const given = request.headers.get("X-Team-Code") ?? "";
  if (!expected || given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++)
    diff |= expected.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
};

/**
 * Routes a request. `deps.sync(input)` merges into the team store and
 * `deps.fetch` reaches FIRST / FTCScout (injected so tests need no network).
 */
export async function handle(request, env, deps) {
  const url = new URL(request.url);
  const origin = request.headers.get("Origin");
  if (origin && !allowedOrigin(request, env))
    return respond(request, env, 403, {
      error: "This site is not allowed to use the sync service.",
    });
  if (request.method === "OPTIONS") return respond(request, env, 204, null);
  try {
    if (url.pathname === "/api/sync") {
      if (request.method !== "POST")
        return respond(request, env, 405, { error: "POST required" });
      if (!env.TEAM_CODE)
        return respond(request, env, 503, {
          error: "Sync is not set up: the TEAM_CODE secret is missing.",
        });
      if (!teamCodeOk(request, env))
        return respond(request, env, 401, { error: "Wrong team code." });
      const input = await request.json();
      return respond(request, env, 200, await deps.sync(input));
    }
    if (url.pathname === "/api/ftc") {
      if (!teamCodeOk(request, env))
        return respond(request, env, 401, { error: "Wrong team code." });
      return respond(request, env, ...(await ftcEvents(url, env, deps.fetch)));
    }
    if (url.pathname === "/api/ftcscout")
      return respond(request, env, ...(await ftcScout(url, deps.fetch)));
    return respond(request, env, 404, { error: "Unknown endpoint" });
  } catch (e) {
    return respond(request, env, 400, {
      error: e?.message ?? "Request failed",
    });
  }
}

async function ftcEvents(url, env, fetchFn) {
  const user = env.FTC_API_USERNAME,
    token = env.FTC_API_TOKEN;
  if (!user || !token)
    return [
      503,
      {
        error:
          "FTC API credentials are not configured. Use CSV import, or add FTC_API_USERNAME and FTC_API_TOKEN as Worker secrets.",
      },
    ];
  const season = url.searchParams.get("season") ?? "2026",
    code = url.searchParams.get("event") ?? "";
  if (!/^20\d{2}$/.test(season) || !/^[-a-zA-Z0-9]{1,40}$/.test(code))
    return [400, { error: "Invalid season or event code." }];
  const auth = `Basic ${btoa(`${user}:${token}`)}`,
    base = `https://ftc-api.firstinspires.org/v2.0/${season}`;
  const request = async (endpoint) => {
    const r = await fetchFn(base + endpoint, {
      headers: { Authorization: auth },
      signal: AbortSignal.timeout(20000),
    });
    if (r.status === 404 && endpoint.startsWith("/scores/"))
      return { matchScores: [] };
    if (!r.ok)
      throw new Error(
        `FTC API returned ${r.status}. Check event code, season and credentials.`,
      );
    return r.json();
  };
  const event = encodeURIComponent(code);
  const [teams, schedule, scores] = await Promise.all([
    request(`/teams?eventCode=${event}`),
    request(`/schedule/${event}/qual/hybrid`),
    request(`/scores/${event}/qual`),
  ]);
  for (let page = 2; page <= Number(teams.pageTotal ?? 1); page++) {
    const next = await request(`/teams?eventCode=${event}&page=${page}`);
    teams.teams.push(...(next.teams ?? []));
  }
  return [200, { teams, schedule, scores }];
}

async function ftcScout(url, fetchFn) {
  const team = url.searchParams.get("team");
  if (!/^\d{1,6}$/.test(team ?? ""))
    return [400, { error: "Invalid team number." }];
  const base = `https://api.ftcscout.org/rest/v1/teams/${team}`;
  const [stats, awards] = await Promise.all([
    fetchFn(`${base}/quick-stats?season=2026`, {
      signal: AbortSignal.timeout(12000),
    }),
    fetchFn(`${base}/awards?season=2026`, {
      signal: AbortSignal.timeout(12000),
    }),
  ]);
  if (!stats.ok)
    return [
      stats.status,
      {
        error: "No published FTCScout statistics for this team in 2026–27 yet.",
      },
    ];
  return [
    200,
    { stats: await stats.json(), awards: awards.ok ? await awards.json() : [] },
  ];
}
