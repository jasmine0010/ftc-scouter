import { active, type Event } from "./types.js";
import {
  apiBase,
  database,
  settings,
  initialize,
  onChange,
  onDataChange,
  persistenceError,
  saveSettings,
  setTeamCode,
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
import { cleanView } from "./presentation.js";
import { esc, toast } from "./ui.js";
const app = document.querySelector<HTMLElement>("#app")!;
// [route, full label, short phone label, outline icon paths]
const navigation = [
  [
    "scout",
    "Scout Form",
    "Match",
    '<rect x="5" y="4" width="14" height="17" rx="1.5"/><path d="M9 3h6v3H9zM8.5 11h7M8.5 15h5"/>',
  ],
  [
    "pit",
    "Pit Scouting",
    "Pit",
    '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L4 17l3 3 5.3-5.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-2.4z"/>',
  ],
  [
    "rankings",
    "Rankings & Data",
    "Ranks",
    '<path d="M3 20h18M6 20v-8M12 20V5M18 20v-5"/>',
  ],
  [
    "teams",
    "Team Profiles",
    "Teams",
    '<circle cx="9" cy="8" r="3"/><path d="M3.5 20a5.5 5.5 0 0 1 11 0M16 5.3a3 3 0 0 1 0 5.4M17.5 14.5A5.5 5.5 0 0 1 20.5 20"/>',
  ],
];
let viewObserver: MutationObserver | undefined;
function currentEvent(): Event {
  return (
    active(database.events).find((e) => e.id === settings.eventId) ??
    active(database.events)[0]
  );
}
function shell() {
  const parts = location.hash.replace(/^#\/?/, "").split("/"),
    view = parts[0] || "scout",
    event = currentEvent();
  viewObserver?.disconnect();
  const selected =
    view === "team" ? "teams" : view === "coverage" ? "pit" : view;
  app.innerHTML = `<header class="hub-header"><a href="#scout" class="hub-title"><img src="./team-logo.svg" width="36" height="36" alt="Curiosity 11770"><h1>Scout Hub</h1></a><nav class="hub-nav" aria-label="Main navigation">${navigation.map(([key, label, short, icon]) => `<a href="#${key}"${selected === key ? ' aria-current="page"' : ""}><svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true">${icon}</svg><span class="nav-long">${label}</span><span class="nav-short" aria-hidden="true">${short}</span></a>`).join("")}</nav><div class="hub-context"><span id="sync-status" class="sync-dot" role="img"></span><details class="event-tools"><summary aria-label="Event tools"><svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="7" cy="18" r="2"/></svg></summary><div class="tools-panel"><label class="field"><span>Event</span><select id="event-select" aria-label="Current event">${active(
    database.events,
  )
    .map(
      (item) =>
        `<option value="${esc(item.id)}"${item.id === event.id ? " selected" : ""}>${esc(item.name)}</option>`,
    )
    .join(
      "",
    )}</select></label><label class="field"><span>Our team</span><input id="our-team" type="number" value="${settings.team}" min="1" max="999999" aria-label="Our team number"></label><nav aria-label="Event tools"><a href="#alliance">Alliance</a><a href="#rankings/standings">Standings</a><a href="#rankings/simulator">Rank simulator</a><a href="#coverage">Pit coverage</a><a href="#events">Event data</a><a href="#reference">Reference</a></nav></div></details></div></header><main id="main" tabindex="-1" class="hub-main"></main>`;
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
  viewObserver = new MutationObserver(() => cleanView(main));
  viewObserver.observe(main, { childList: true, subtree: true });
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
  cleanView(main);
  updateStatus();
}
function updateStatus() {
  const e = document.querySelector("#sync-status");
  if (e) {
    const state =
      persistenceError || (!navigator.onLine ? "Offline" : syncState);
    e.setAttribute("aria-label", state);
    e.setAttribute("data-state", state === "Synced" ? "synced" : "pending");
  }
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
/**
 * The hosted site syncs through the Cloudflare Worker, which needs the team code.
 * A browser popup asks for it every time the site is opened; it is not saved.
 * Cancelled, unsupported or offline, the app still opens and saves locally.
 */
async function requireTeamCode() {
  if (!apiBase) return; // Local server: no code needed.
  let message = "Enter your team code to open Scout Hub";
  for (;;) {
    let code: string | undefined;
    try {
      code = window.prompt(message)?.trim();
    } catch {
      // Some embedded browsers have no popups at all.
    }
    if (!code) return;
    setTeamCode(code);
    await sync();
    if (syncState !== "Wrong team code") return;
    setTeamCode("");
    message = "That team code didn't work. Enter your team code";
  }
}
async function start() {
  await initialize();
  await requireTeamCode();
  if (!currentEvent()) throw new Error("No event exists in this dataset.");
  shell();
  document.querySelector<HTMLAnchorElement>(".skip-link")!.onclick = (e) => {
    e.preventDefault();
    document.querySelector<HTMLElement>("#main")?.focus();
  };
  onChange(updateStatus);
  // Redraw list and analysis pages when other scouts' records arrive. Forms are
  // left alone, as is any page where someone is typing or has a dialog open.
  onDataChange(() => {
    const view = location.hash.replace(/^#\/?/, "").split("/")[0] || "scout";
    if (["scout", "pit", "events"].includes(view)) return;
    const focused = document.activeElement;
    if (
      focused?.closest("#main") &&
      focused.matches("input, textarea, select, [contenteditable]")
    )
      return;
    if (document.querySelector("dialog[open]")) return;
    const y = window.scrollY;
    shell();
    window.scrollTo(0, y);
  });
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
      .register("./sw.js")
      .catch(() =>
        toast("Offline page cache unavailable; local records still save."),
      );
}
void start().catch((e) => {
  app.innerHTML = `<main class="startup-error"><h1>Storage could not open.</h1><p>${esc((e as Error).message)}</p><p>Enable site storage and open this app outside private browsing. Existing local data has not been cleared.</p></main>`;
});
