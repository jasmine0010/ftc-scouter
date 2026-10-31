import { spawnSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  readdirSync,
  writeFileSync,
  readFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
mkdirSync("dist", { recursive: true });
const result = spawnSync(
  process.execPath,
  ["node_modules/typescript/bin/tsc"],
  { stdio: "inherit" },
);
if (result.status) process.exit(result.status);
cpSync("public", "dist", { recursive: true });
const files = [
  "/",
  "/index.html",
  "/style.css",
  "/team-logo.svg",
  "/manifest.webmanifest",
  "/biobuzz-field.png",
  ...readdirSync("public")
    .filter((f) => f.endsWith(".ttf"))
    .map((f) => "/" + f),
  ...readdirSync("dist/assets")
    .filter((f) => f.endsWith(".js"))
    .map((f) => "/assets/" + f),
];
const version = createHash("sha256")
  .update(
    files.map((f) => (f === "/" ? "" : readFileSync("dist" + f))).join(""),
  )
  .digest("hex")
  .slice(0, 12);
writeFileSync(
  "dist/sw.js",
  `const CACHE='biobuzz-${version}',FILES=${JSON.stringify(files)};self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting())));self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('biobuzz-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));self.addEventListener('fetch',e=>{if(e.request.method!=='GET'||new URL(e.request.url).pathname.startsWith('/api/'))return;if(e.request.mode==='navigate'){e.respondWith(fetch(e.request).catch(()=>caches.match('/index.html')));return;}e.respondWith(caches.match(e.request).then(c=>c||fetch(e.request)));});`,
);
console.log("Built dist/");
