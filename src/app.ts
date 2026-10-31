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
import { cleanView } from "./presentation.js";
import { esc, toast } from "./ui.js";
const app = document.querySelector<HTMLElement>("#app")!;
const navigation = [
  ["scout", "Scout Form"],
  ["pit", "Pit Scouting"],
  ["rankings", "Rankings & Data"],
  ["teams", "Team Profiles"],
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
  app.innerHTML = `<header class="hub-header"><a href="#scout" class="hub-title"><img src="/team-logo.svg" width="36" height="36" alt=""><h1>FTC BIOBUZZ Scout Hub</h1></a><nav class="hub-nav" aria-label="Main navigation">${navigation.map(([key, label]) => `<a href="#${key}"${selected === key ? ' aria-current="page"' : ""}>${label}</a>`).join("")}</nav><div class="hub-context"><span id="sync-status" class="sync-dot" role="img"></span><details class="event-tools"><summary aria-label="Event tools"><svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="7" cy="18" r="2"/></svg></summary><div class="tools-panel"><label class="field"><span>Event</span><select id="event-select" aria-label="Current event">${active(
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
async function start() {
  await initialize();
  if (!currentEvent()) throw new Error("No event exists in this dataset.");
  shell();
  document.querySelector<HTMLAnchorElement>(".skip-link")!.onclick = (e) => {
    e.preventDefault();
    document.querySelector<HTMLElement>("#main")?.focus();
  };
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
