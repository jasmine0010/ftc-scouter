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
// Paths are relative to sw.js so the app also works under a sub-path
// such as https://<user>.github.io/ftc-scouter/.
const files = [
  "./",
  "./index.html",
  "./style.css",
  "./team-logo.svg",
  "./manifest.webmanifest",
  "./biobuzz-field.png",
  "./config.json",
  ...readdirSync("public")
    .filter((f) => f.endsWith(".ttf"))
    .map((f) => "./" + f),
  ...readdirSync("dist/assets")
    .filter((f) => f.endsWith(".js"))
    .map((f) => "./assets/" + f),
];
const version = createHash("sha256")
  .update(
    files
      .map((f) => (f === "./" ? "" : readFileSync("dist/" + f.slice(2))))
      .join(""),
  )
  .digest("hex")
  .slice(0, 12);
// Online: always the newest files (cached for offline). Offline, or no answer
// within 4 seconds: the stored copy.
writeFileSync(
  "dist/sw.js",
  `const CACHE='biobuzz-${version}',FILES=${JSON.stringify(files)};self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting())));self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('biobuzz-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||u.origin!==location.origin||u.pathname.includes('/api/'))return;const fresh=fetch(e.request).then(r=>{if(r.ok){const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));}return r;});const cached=()=>caches.match(e.request).then(c=>c||(e.request.mode==='navigate'?caches.match('./index.html'):undefined));const slow=new Promise(ok=>setTimeout(ok,4000)).then(cached);e.respondWith(Promise.race([fresh.catch(cached),slow.then(c=>c||fresh)]).then(r=>r||fresh));});`,
);
console.log("Built dist/");
