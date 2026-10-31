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
import { renderOverview } from "./overview.js";
import { renderRankings } from "./rankings.js";
import { renderPit } from "./pit.js";
import { renderScout, renderBoard } from "./scout.js";
import { renderCoverage, renderDirectory, renderProfile } from "./profiles.js";
import { renderAlliance } from "./alliance.js";
import { renderEventData } from "./event-data.js";
import { renderReference } from "./reference.js";
import { simplifyContent } from "./presentation.js";
import { esc, field, formValues, toast } from "./ui.js";

const app = document.querySelector<HTMLElement>("#app")!;
const navigation = [
  ["overview", "Overview"],
  ["scout", "Scout"],
  ["teams", "Teams"],
  ["alliance", "Alliance"],
];
const gear =
  '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d="m9.5 3-.7 2.3-2 .9-2.2-.5L2 10l1.6 1.8v2.1L2 15.7l2.6 4.2 2.2-.5 2 .9.7 2.2h5l.7-2.2 2-.9 2.2.5 2.6-4.2-1.6-1.8v-2.1L22 10l-2.6-4.3-2.2.5-2-.9-.7-2.3z"/><circle cx="12" cy="12.7" r="3.2"/></svg>';
let viewObserver: MutationObserver | undefined;
function currentEvent(): Event {
  return (
    active(database.events).find((e) => e.id === settings.eventId) ??
    active(database.events)[0]
  );
}

function openSettings() {
  const dialog = document.createElement("dialog");
  dialog.className = "settings-dialog";
  dialog.setAttribute("aria-labelledby", "settings-title");
  dialog.innerHTML = `<div class="dialog-heading"><h2 id="settings-title">Settings</h2><button type="button" data-close aria-label="Close settings">×</button></div><nav class="settings-links" aria-label="Settings"><a href="#events">Event data</a><a href="#reference">Reference</a><a href="#standings">Standings</a><a href="#matches">Match log</a><a href="#simulator">Rank simulator</a></nav><form id="preferences">${field("Scout name", "scoutName", settings.scoutName ?? "")}${field("Team number", "team", settings.team, "number", 'min="1" max="999999" required')}<button type="submit" class="primary">Save</button></form>`;
  document.body.append(dialog);
  dialog.showModal();
  const close = () => {
    dialog.close();
    dialog.remove();
  };
  dialog.querySelector<HTMLButtonElement>("[data-close]")!.onclick = close;
  dialog.onclose = () => dialog.remove();
  dialog
    .querySelectorAll("a")
    .forEach((link) => link.addEventListener("click", close));
  dialog.querySelector<HTMLFormElement>("form")!.onsubmit = async (e) => {
    e.preventDefault();
    const form = e.currentTarget as HTMLFormElement;
    if (!form.reportValidity()) return;
    const values = formValues(form);
    await saveSettings({
      team: Number(values.team),
      scoutName: String(values.scoutName).trim(),
    });
    close();
    shell();
  };
}

function shell() {
  viewObserver?.disconnect();
  const parts = location.hash.replace(/^#\/?/, "").split("/");
  const view = parts[0] || "overview";
  const event = currentEvent();
  const selected = [
    "pit",
    "team",
    "coverage",
    "standings",
    "matches",
    "simulator",
    "rankings",
    "field",
  ].includes(view)
    ? view === "rankings" && (!parts[1] || parts[1] === "overview")
      ? "overview"
      : "teams"
    : view;
  app.innerHTML = `<header class="site-header"><a class="brand" href="#overview"><span>Curiosity</span><span class="header-team">${settings.team}</span></a><select id="event-select" aria-label="Event">${active(
    database.events,
  )
    .map(
      (item) =>
        `<option value="${esc(item.id)}"${item.id === event.id ? " selected" : ""}>${esc(item.name)}</option>`,
    )
    .join(
      "",
    )}</select><div class="header-tools"><output id="scout-total" aria-label="Score" hidden></output>${event.id.startsWith("demo-") ? '<span class="demo-badge">Demo data</span>' : ""}<span class="status-dot" id="sync-status" role="img" aria-label="${esc(syncState)}"></span><button class="settings-button" id="settings-button" aria-label="Settings">${gear}</button></div></header><div class="app-layout"><aside class="sidebar"><nav aria-label="Main navigation">${navigation.map(([key, label]) => `<a href="#${key}"${selected === key ? ' aria-current="page"' : ""}>${label}</a>`).join("")}</nav></aside><main id="main" tabindex="-1"></main></div>`;
  document.querySelector<HTMLButtonElement>("#settings-button")!.onclick =
    openSettings;
  document.querySelector<HTMLSelectElement>("#event-select")!.onchange = async (
    e,
  ) => {
    await saveSettings({ eventId: (e.target as HTMLSelectElement).value });
    shell();
  };
  const main = document.querySelector<HTMLElement>("#main")!;
  const tidy = () => simplifyContent(main);
  viewObserver = new MutationObserver(tidy);
  viewObserver.observe(main, { childList: true, subtree: true });
  try {
    if (view === "scout")
      void renderScout(
        main,
        parts[1] === "match" ? undefined : parts[1],
        parts[1] === "match" ? Number(parts[2]) : undefined,
        parts[3] ? Number(parts[3]) : undefined,
      )
        .then(tidy)
        .catch(failure);
    else if (view === "pit" || (view === "teams" && parts[1] === "pit"))
      void renderPit(
        main,
        Number(view === "pit" ? parts[1] : parts[2]) || undefined,
      )
        .then(tidy)
        .catch(failure);
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
    else if (view === "field") {
      main.innerHTML = `<h1>Match ${Number(parts[1])}</h1><div id="field-editor"></div>`;
      void renderBoard(
        main.querySelector("#field-editor")!,
        event.id,
        Number(parts[1]),
      )
        .then(tidy)
        .catch(failure);
    } else if (["standings", "matches", "simulator"].includes(view))
      renderRankings(main, event, view);
    else if (view === "rankings" && parts[1] && parts[1] !== "overview")
      renderRankings(main, event, parts[1]);
    else renderOverview(main, event);
    tidy();
  } catch (error) {
    failure(error);
  }
  updateStatus();
}

function updateStatus() {
  const dot = document.querySelector<HTMLElement>("#sync-status");
  if (dot) {
    const state =
      persistenceError || (!navigator.onLine ? "Offline" : syncState);
    dot.setAttribute("aria-label", state);
    dot.dataset.state = state === "Synced" ? "synced" : "pending";
  }
  const selector = document.querySelector<HTMLSelectElement>("#event-select");
  if (
    selector &&
    (selector.value !== settings.eventId ||
      selector.options.length !== active(database.events).length)
  )
    selector.innerHTML = active(database.events)
      .map(
        (event) =>
          `<option value="${esc(event.id)}"${event.id === settings.eventId ? " selected" : ""}>${esc(event.name)}</option>`,
      )
      .join("");
}
function failure(error: unknown) {
  console.error(error);
  toast((error as Error).message);
}
async function start() {
  await initialize();
  shell();
  document.querySelector<HTMLAnchorElement>(".skip-link")!.onclick = (e) => {
    e.preventDefault();
    document.querySelector<HTMLElement>("#main")?.focus();
  };
  onChange(updateStatus);
  window.addEventListener("hashchange", () => {
    shell();
    window.scrollTo(0, 0);
  });
  window.addEventListener("online", () => void sync());
  window.addEventListener("offline", updateStatus);
  setInterval(() => void sync(), 30000);
  void sync();
  if ("serviceWorker" in navigator)
    void navigator.serviceWorker.register("/sw.js").catch(() => {});
}
void start().catch((error) => {
  app.innerHTML = `<main class="startup-error"><h1>Storage unavailable</h1><p role="alert">${esc((error as Error).message)}</p></main>`;
});
