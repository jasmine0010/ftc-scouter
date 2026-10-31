import { active, type Event } from "./types.js";
import {
  database,
  settings,
  initialize,
  onChange,
  persistenceError,
  saveSettings,
  sync,
  syncState,
} from "./storage.js";
import { renderRankings } from "./rankings.js";
import { renderPit } from "./pit.js";
import { renderScout } from "./scout.js";
import { renderCoverage, renderDirectory, renderProfile } from "./profiles.js";
import { renderAlliance } from "./alliance.js";
import { renderEventData } from "./event-data.js";
import { renderReference } from "./reference.js";
import { esc, toast } from "./ui.js";
const app = document.querySelector<HTMLElement>("#app")!;
const navigation = [
  ["rankings", "01", "Rankings & data"],
  ["scout", "02", "Scout form"],
  ["pit", "03", "Pit scouting"],
  ["teams", "04", "Team profiles"],
  ["alliance", "05", "Alliance desk"],
  ["events", "06", "Event data"],
  ["reference", "07", "Reference"],
];
function currentEvent(): Event {
  return (
    active(database.events).find((e) => e.id === settings.eventId) ??
    active(database.events)[0]
  );
}
function shell() {
  const parts = location.hash.replace(/^#\/?/, "").split("/"),
    view = parts[0] || "rankings",
    event = currentEvent();
  app.innerHTML = `<header class="site-header"><a class="brand" href="#rankings" aria-label="Curiosity Scout event overview"><img src="/team-logo.svg" width="44" height="44" alt=""><span>Curiosity<small>11770 <span class="brand-divider">/</span> Scout</small></span></a><div class="header-center"><span>BIOBUZZ</span><span>2026—27</span></div><div class="header-status"><span id="sync-status" role="status"></span><button id="menu-toggle" aria-controls="sidebar" aria-expanded="false">Menu +</button></div></header><div class="app-layout"><aside class="sidebar" id="sidebar"><nav aria-label="Main navigation">${navigation.map(([key, index, label]) => `<a href="#${key}"${view === key || (view === "team" && key === "teams") || (view === "coverage" && key === "pit") ? ' aria-current="page"' : ""}><span>${index}</span>${label}</a>`).join("")}</nav><div class="sidebar-bottom"><p>OUR TEAM</p><strong id="our-team-label">${settings.team}</strong><a href="#team/${settings.team}">Open profile ↗</a><div class="manual-label">COMPETITION MANUAL<br>TU07 / 29 OCT 2026</div></div></aside><div class="workspace"><div class="event-bar"><label><span>EVENT</span><select id="event-select" aria-label="Current event">${active(
    database.events,
  )
    .map(
      (e) =>
        `<option value="${esc(e.id)}"${e.id === event.id ? " selected" : ""}>${esc(e.name)}</option>`,
    )
    .join(
      "",
    )}</select></label><div class="event-meta"><span>${event.id.startsWith("demo-") ? "DEMO DATA · SYNTHETIC" : ""}</span><label>OUR TEAM <input id="our-team" type="number" value="${settings.team}" min="1" max="999999" aria-label="Our team number"></label></div></div><main id="main" tabindex="-1"></main><footer class="app-footer"><span>Curiosity / FTC ${settings.team}</span><span>Local-first scouting · BIOBUZZ 2026–27</span><a href="#reference">Rules & sources ↗</a></footer></div></div>`;
  const menu = document.querySelector<HTMLButtonElement>("#menu-toggle")!;
  menu.onclick = () => {
    const expanded = menu.getAttribute("aria-expanded") === "true";
    menu.setAttribute("aria-expanded", String(!expanded));
    document.querySelector("#sidebar")!.classList.toggle("open", !expanded);
  };
  document.querySelector<HTMLSelectElement>("#event-select")!.onchange = async (
    e,
  ) => {
    await saveSettings({ eventId: (e.target as HTMLSelectElement).value });
    shell();
  };
  document.querySelector<HTMLInputElement>("#our-team")!.onchange = async (
    e,
  ) => {
    const input = e.target as HTMLInputElement,
      n = Number(input.value);
    if (!input.reportValidity() || !Number.isInteger(n) || n < 1) return;
    await saveSettings({ team: n });
    shell();
  };
  const main = document.querySelector<HTMLElement>("#main")!;
  try {
    if (view === "scout") void renderScout(main, parts[1]).catch(failure);
    else if (view === "pit")
      void renderPit(main, parts[1] ? Number(parts[1]) : undefined).catch(
        failure,
      );
    else if (view === "teams") renderDirectory(main, event);
    else if (view === "team") renderProfile(main, Number(parts[1]), event);
    else if (view === "coverage") renderCoverage(main, event);
    else if (view === "alliance")
      renderAlliance(
        main,
        event,
        parts[1] || "partners",
        parts[2] ? Number(parts[2]) : undefined,
      );
    else if (view === "events") renderEventData(main, event);
    else if (view === "reference") renderReference(main, event);
    else renderRankings(main, event, parts[1] || "overview");
  } catch (e) {
    failure(e);
  }
  updateStatus();
}
function updateStatus() {
  const e = document.querySelector("#sync-status");
  if (e)
    e.textContent =
      persistenceError ||
      (!navigator.onLine ? "Offline · saved locally" : syncState);
  const eventSelect =
    document.querySelector<HTMLSelectElement>("#event-select");
  if (eventSelect) {
    const value = settings.eventId;
    eventSelect.innerHTML = active(database.events)
      .map(
        (e) =>
          `<option value="${esc(e.id)}"${e.id === value ? " selected" : ""}>${esc(e.name)}</option>`,
      )
      .join("");
  }
}
function failure(e: unknown) {
  console.error(e);
  toast((e as Error).message);
  const main = document.querySelector("#main");
  if (main && !main.textContent)
    main.innerHTML =
      '<p class="errors">This view could not open. Export your dataset in Event data before clearing browser storage.</p>';
}
async function start() {
  await initialize();
  if (!currentEvent()) throw new Error("No event exists in this dataset.");
  shell();
  onChange(updateStatus);
  window.addEventListener("hashchange", () => {
    if (location.hash === "#main") {
      document.querySelector<HTMLElement>("#main")?.focus();
      return;
    }
    shell();
    window.scrollTo(0, 0);
  });
  window.addEventListener("online", () => void sync());
  window.addEventListener("offline", updateStatus);
  setInterval(() => void sync(), 30000);
  void sync();
  if ("serviceWorker" in navigator)
    void navigator.serviceWorker
      .register("/sw.js")
      .catch(() =>
        toast("Offline page cache unavailable; local records still save."),
      );
}
void start().catch((e) => {
  app.innerHTML = `<main class="startup-error"><h1>Storage could not open.</h1><p>${esc((e as Error).message)}</p><p>Enable site storage and open this app outside private browsing. Existing local data has not been cleared.</p></main>`;
});
