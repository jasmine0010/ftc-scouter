import http from "node:http";
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mergeDatabases, validateDatabase } from "./dist/assets/storage.js";
import { removePlaceholderData } from "./dist/assets/data-cleanup.js";
const root = path.dirname(fileURLToPath(import.meta.url)),
  dist = path.join(root, "dist"),
  data = path.join(root, ".data");
const empty = {
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
let queue = Promise.resolve();
const json = (res, status, value) => {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(value));
};
async function body(req) {
  let text = "";
  for await (const chunk of req) {
    text += chunk;
    if (text.length > 64 * 1024 * 1024)
      throw new Error(
        "Dataset exceeds the 64 MB sync limit. Export a backup and increase the server limit for this dataset.",
      );
  }
  return JSON.parse(text);
}
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    if (url.pathname === "/api/sync") {
      if (req.method !== "POST")
        return json(res, 405, { error: "POST required" });
      if (
        req.headers.origin &&
        new URL(req.headers.origin).host !== req.headers.host
      )
        return json(res, 403, { error: "Cross-origin sync is not allowed." });
      const input = await body(req);
      validateDatabase(input);
      const task = queue.then(async () => {
        await mkdir(data, { recursive: true });
        let saved = empty;
        try {
          saved = JSON.parse(
            await readFile(path.join(data, "store.json"), "utf8"),
          );
        } catch (e) {
          if (e.code !== "ENOENT") throw e;
        }
        const merged = removePlaceholderData(mergeDatabases(saved, input));
        await writeFile(path.join(data, "store.json"), JSON.stringify(merged));
        return merged;
      });
      queue = task.then(
        () => {},
        () => {},
      );
      return json(res, 200, await task);
    }
    if (url.pathname === "/api/ftc") {
      if (req.method !== "GET")
        return json(res, 405, { error: "GET required" });
      const user = process.env.FTC_API_USERNAME,
        token = process.env.FTC_API_TOKEN;
      if (!user || !token)
        return json(res, 503, {
          error:
            "FTC API credentials are not configured. Use CSV import, or set FTC_API_USERNAME and FTC_API_TOKEN on the server.",
        });
      const season = url.searchParams.get("season") ?? "2026",
        code = url.searchParams.get("event") ?? "";
      if (!/^20\d{2}$/.test(season) || !/^[-a-zA-Z0-9]{1,40}$/.test(code))
        return json(res, 400, { error: "Invalid season or event code." });
      const auth = `Basic ${Buffer.from(`${user}:${token}`).toString("base64")}`,
        base = `https://ftc-api.firstinspires.org/v2.0/${season}`;
      const request = async (endpoint) => {
        const r = await fetch(base + endpoint, {
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
      const [teams, schedule, scores] = await Promise.all([
        request(`/teams?eventCode=${encodeURIComponent(code)}`),
        request(`/schedule/${encodeURIComponent(code)}/qual/hybrid`),
        request(`/scores/${encodeURIComponent(code)}/qual`),
      ]);
      if (Number(teams.pageTotal) > 1) {
        for (let page = 2; page <= Number(teams.pageTotal); page++) {
          const next = await request(
            `/teams?eventCode=${encodeURIComponent(code)}&page=${page}`,
          );
          teams.teams.push(...(next.teams ?? []));
        }
      }
      return json(res, 200, { teams, schedule, scores });
    }
    if (url.pathname === "/api/ftcscout") {
      const team = url.searchParams.get("team");
      if (!/^\d{1,6}$/.test(team ?? ""))
        return json(res, 400, { error: "Invalid team number." });
      const base = `https://api.ftcscout.org/rest/v1/teams/${team}`;
      const [stats, awards] = await Promise.all([
        fetch(`${base}/quick-stats?season=2026`, {
          signal: AbortSignal.timeout(12000),
        }),
        fetch(`${base}/awards?season=2026`, {
          signal: AbortSignal.timeout(12000),
        }),
      ]);
      if (!stats.ok)
        return json(res, stats.status, {
          error:
            "No published FTCScout statistics for this team in 2026–27 yet.",
        });
      return json(res, 200, {
        stats: await stats.json(),
        awards: awards.ok ? await awards.json() : [],
      });
    }
    if (url.pathname.startsWith("/api/"))
      return json(res, 404, { error: "Unknown endpoint" });
    if (!["GET", "HEAD"].includes(req.method)) {
      res.writeHead(405).end();
      return;
    }
    const relative =
        decodeURIComponent(url.pathname).replace(/^\/+/, "") || "index.html",
      file = path.resolve(dist, relative);
    if (
      !file.startsWith(dist + path.sep) ||
      relative.split(/[\\/]/).some((s) => s.startsWith("."))
    ) {
      res.writeHead(404).end("Not found");
      return;
    }
    let target = file;
    try {
      if (!(await stat(file)).isFile()) throw new Error();
    } catch {
      if (path.extname(relative)) {
        res.writeHead(404).end("Not found");
        return;
      }
      target = path.join(dist, "index.html");
    }
    const mime = {
      ".html": "text/html; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".svg": "image/svg+xml",
      ".json": "application/json",
      ".webmanifest": "application/manifest+json",
      ".woff2": "font/woff2",
      ".ttf": "font/ttf",
      ".png": "image/png",
    };
    res.setHeader(
      "Content-Type",
      mime[path.extname(target)] ?? "application/octet-stream",
    );
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self'; connect-src 'self'; script-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
    );
    res.writeHead(200);
    res.end(req.method === "HEAD" ? undefined : await readFile(target));
  } catch (e) {
    json(res, 400, { error: e.message ?? "Request failed" });
  }
});
server.listen(
  Number(process.env.PORT ?? 8766),
  process.env.HOST ?? "127.0.0.1",
  () => console.log(`Local: http://127.0.0.1:${server.address().port}`),
);
