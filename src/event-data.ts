import { GAME } from "./game.js";
import {
  active,
  now,
  uid,
  type Database,
  type Event,
  type Match,
  type OfficialResult,
} from "./types.js";
import {
  database,
  settings,
  parseCSV,
  datasetFromCSV,
  exportCSV,
  exportFile,
  escapeCSV,
  importDatabase,
  saveEntity,
  saveSettings,
  sync,
} from "./storage.js";
import { esc, field, formValues, section, toast } from "./ui.js";
export const scheduleColumns = [
  "match",
  "red1",
  "red2",
  "blue1",
  "blue2",
  "redScore",
  "blueScore",
  "redFoul",
  "blueFoul",
  "redMovement",
  "blueMovement",
  "redTips",
  "blueTips",
  "redAuto",
  "blueAuto",
  "redRP",
  "blueRP",
  "surrogate",
  "dq",
];
export function scheduleCSV(eventId: string) {
  return [
    scheduleColumns.join(","),
    ...active(database.matches)
      .filter((m) => m.eventId === eventId)
      .map((m) =>
        [
          m.number,
          ...m.red,
          ...m.blue,
          ...["score", "foulPoints", "movement", "tips", "auto", "rp"].flatMap(
            (k) => [
              m.redResult?.[k as keyof OfficialResult] ?? "",
              m.blueResult?.[k as keyof OfficialResult] ?? "",
            ],
          ),
          m.surrogate?.join("|") ?? "",
          m.dq?.join("|") ?? "",
        ]
          .map(escapeCSV)
          .join(","),
      ),
  ].join("\r\n");
}
export async function importSchedule(csv: string, event: Event) {
  const rows = parseCSV(csv),
    teams = new Set(event.teams),
    matches: Match[] = [];
  const num = (s: string, label: string, optional = false) => {
    if (optional && s === "") return undefined;
    const n = Number(s);
    if (!s || !Number.isFinite(n) || n < 0)
      throw new Error(`Invalid ${label}: ${s}`);
    return n;
  };
  for (const row of rows) {
    const n = num(row.match, "match")!,
      red = [num(row.red1, "red1")!, num(row.red2, "red2")!],
      blue = [num(row.blue1, "blue1")!, num(row.blue2, "blue2")!];
    if (
      !Number.isInteger(n) ||
      n < 1 ||
      [...red, ...blue].some((t) => !Number.isInteger(t) || t < 1) ||
      new Set([...red, ...blue]).size !== 4
    )
      throw new Error(
        "Schedule requires positive match numbers and four distinct positive team numbers.",
      );
    const m: Match = {
      id: `${event.id}:${n}`,
      eventId: event.id,
      updatedAt: now(),
      number: n,
      red,
      blue,
      played:
        row.redScore !== "" &&
        row.redScore !== undefined &&
        row.blueScore !== "" &&
        row.blueScore !== undefined,
      surrogate: row.surrogate ? row.surrogate.split("|").map(Number) : [],
      dq: row.dq ? row.dq.split("|").map(Number) : [],
    };
    if ([...m.surrogate!, ...m.dq!].some((t) => ![...red, ...blue].includes(t)))
      throw new Error("Surrogate/DQ teams must be in that match.");
    if (m.played)
      for (const c of ["red", "blue"] as const) {
        const foul = num(row[c + "Foul"], "foul points")!,
          score = num(row[c + "Score"], "score")!;
        if (foul > score)
          throw new Error("Foul points cannot exceed the final score.");
        m[(c + "Result") as "redResult" | "blueResult"] = {
          score,
          foulPoints: foul,
          movement: num(row[c + "Movement"], "movement")!,
          tips: num(row[c + "Tips"], "tips")!,
          auto: num(row[c + "Auto"], "AUTO")!,
          rp: num(row[c + "RP"] ?? "", "RP", true),
        };
      }
    [...red, ...blue].forEach((t) => teams.add(t));
    matches.push(m);
  }
  if (new Set(matches.map((m) => m.number)).size !== matches.length)
    throw new Error("CSV contains duplicate match numbers.");
  // Validate the entire file before any writes.
  for (const m of matches) await saveEntity("matches", m);
  for (const t of teams)
    if (!active(database.teams).some((x) => x.number === t))
      await saveEntity("teams", {
        id: String(t),
        updatedAt: now(),
        number: t,
        name: `Team ${t}`,
      });
  await saveEntity("events", { ...event, teams: [...teams] });
  return matches.length;
}
export async function importTeams(csv: string, event: Event) {
  const rows = parseCSV(csv);
  for (const row of rows)
    if (
      !Number.isInteger(Number(row.number)) ||
      Number(row.number) < 1 ||
      !row.name?.trim()
    )
      throw new Error(
        "Team CSV needs number,name columns and a name for every team.",
      );
  for (const row of rows)
    await saveEntity("teams", {
      id: String(Number(row.number)),
      updatedAt: now(),
      number: Number(row.number),
      name: row.name.trim(),
    });
  await saveEntity("events", {
    ...event,
    teams: [...new Set([...event.teams, ...rows.map((r) => Number(r.number))])],
  });
  return rows.length;
}
export function renderEventData(root: HTMLElement, event: Event) {
  root.innerHTML = `<div class="page-heading"><div><p class="eyebrow">EVENT OPERATIONS</p><h1>Event data.</h1><p class="lede">Import the roster and schedule. Scout offline. Merge observations when connected.</p></div></div>${section("Current event", `<form id="event-settings" class="form-grid">${field("Event name", "name", event.name, "text", "required")}${field("Event code (optional for CSV)", "code", event.code, "text")}${field("Season start year", "season", event.season, "number", 'min="2026" max="2099" required')}${field("SWARM threshold", "swarm", event.thresholds.swarm, "number", 'min="0" required')}${field("POLLINATOR 1 threshold", "pollinator1", event.thresholds.pollinator1, "number", 'min="0" required')}${field("POLLINATOR 2 threshold", "pollinator2", event.thresholds.pollinator2, "number", 'min="0" required')}<div class="button-row wide"><button type="submit" class="primary">Save event settings</button><button type="button" id="new-event">Create a new event</button></div></form><p class="hint">All Other Events defaults are ${GAME.thresholds.swarm} / ${GAME.thresholds.pollinator1} / ${GAME.thresholds.pollinator2}. Set published Championship thresholds for your event.</p>`)}${section("Schedule & results", `<div class="button-row"><button id="api-import" class="primary">Import from FTC Events API</button><button id="schedule-export">Export schedule CSV</button><button id="template-export">Download CSV templates</button></div><p class="hint">API credentials stay on the server: FTC_API_USERNAME and FTC_API_TOKEN. No credentials are bundled. Data publication depends on the event upload.</p><a class="text-link" href="https://ftc-events.firstinspires.org/services/API" target="_blank" rel="noreferrer">FIRST API information ↗</a><div class="import-grid"><label class="field"><span>Roster CSV · number,name</span><input type="file" id="roster-file" accept=".csv,text/csv"></label><label class="field"><span>Schedule / results CSV</span><input type="file" id="schedule-file" accept=".csv,text/csv"></label></div><p class="hint">Completed matches need scores, foul points, movement points, TIPs and AUTO points for both alliances. Leave scores empty for future matches. Optional RP overrides, DQs and surrogate teams are preserved.</p><details><summary>Schedule CSV columns</summary><code class="schema">${scheduleColumns.join(", ")}</code></details><div id="event-error" class="errors" role="alert"></div>`)}${section("Scout datasets", `<div class="button-row"><button id="export-json" class="primary">Export all JSON</button><button id="export-csv">Export all CSV</button><button id="sync-now">Sync now</button></div><label class="field"><span>Merge another scout's JSON or dataset CSV</span><input type="file" id="dataset-file" accept=".json,.csv,application/json,text/csv"></label><p class="hint">Exports include every event, match, pit photo and vector route. Merges use canonical team/match identities and latest timestamps; repeated imports do not create duplicates. Exported dataset CSV contains a lossless JSON data column.</p><p class="hint">Local server sync is automatic while connected. On static hosting, use dataset exports or configure the same-origin /api/sync endpoint. This app makes no claim that an offline record has reached another device.</p>`)}${section(
    "Season view",
    `<div id="season-list">${active(database.events)
      .map(
        (e) =>
          `<a class="event-row" href="#rankings" data-event="${esc(e.id)}"><span>${esc(e.name)}</span><span>${e.teams.length} teams · ${active(database.observations).filter((o) => o.eventId === e.id).length} observations</span><span>Open →</span></a>`,
      )
      .join("")}</div>`,
  )}`;
  const err = (e: unknown) => {
    root.querySelector("#event-error")!.textContent = (e as Error).message;
    toast((e as Error).message);
  };
  root.querySelector<HTMLFormElement>("#event-settings")!.onsubmit = async (
    e,
  ) => {
    e.preventDefault();
    const f = e.target as HTMLFormElement;
    if (!f.reportValidity()) return;
    const v = formValues(f);
    await saveEntity("events", {
      ...event,
      name: String(v.name),
      code: String(v.code),
      season: Number(v.season),
      thresholds: {
        swarm: Number(v.swarm),
        pollinator1: Number(v.pollinator1),
        pollinator2: Number(v.pollinator2),
      },
    });
    toast("Event settings saved.");
  };
  root.querySelector<HTMLButtonElement>("#new-event")!.onclick = async () => {
    const id = uid(),
      e: Event = {
        id,
        updatedAt: now(),
        name: "New event",
        code: "",
        season: 2026,
        teams: [],
        thresholds: { ...GAME.thresholds },
      };
    await saveEntity("events", e);
    await saveSettings({ eventId: id });
    renderEventData(root, e);
    toast("New empty event created. Enter its name and official code.");
  };
  root.querySelector<HTMLButtonElement>("#export-json")!.onclick = () =>
    exportFile(
      `biobuzz-${now().slice(0, 10)}.json`,
      JSON.stringify(database, null, 2),
    );
  root.querySelector<HTMLButtonElement>("#export-csv")!.onclick = () =>
    exportFile("biobuzz-all-data.csv", exportCSV(database), "text/csv");
  root.querySelector<HTMLButtonElement>("#schedule-export")!.onclick = () =>
    exportFile(`${event.code}-schedule.csv`, scheduleCSV(event.id), "text/csv");
  root.querySelector<HTMLButtonElement>("#template-export")!.onclick = () => {
    exportFile(
      "schedule-template.csv",
      scheduleColumns.join(",") + "\n1,11770,24079,21380,3526,,,,,,,,,,,,,,",
      "text/csv",
    );
    exportFile(
      "roster-template.csv",
      "number,name\n11770,Curiosity\n24079,Circuit Breakers",
      "text/csv",
    );
  };
  root.querySelector<HTMLButtonElement>("#sync-now")!.onclick = () =>
    void sync();
  for (const [id, handler] of [
    ["roster-file", (text: string) => importTeams(text, event)],
    ["schedule-file", (text: string) => importSchedule(text, event)],
  ] as const)
    root.querySelector<HTMLInputElement>("#" + id)!.onchange = async (e) => {
      const f = (e.target as HTMLInputElement).files?.[0];
      if (!f) return;
      try {
        const count = await handler(await f.text());
        toast(`Imported ${count} rows.`);
      } catch (e) {
        err(e);
      }
    };
  root.querySelector<HTMLInputElement>("#dataset-file")!.onchange = async (
    e,
  ) => {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    try {
      const text = await f.text();
      await importDatabase(
        f.name.endsWith(".csv") ? datasetFromCSV(text) : JSON.parse(text),
      );
      toast("Dataset merged without duplicate records.");
    } catch (e) {
      err(e);
    }
  };
  root
    .querySelectorAll<HTMLElement>("[data-event]")
    .forEach(
      (b) =>
        (b.onclick = () => void saveSettings({ eventId: b.dataset.event })),
    );
  root.querySelector<HTMLButtonElement>("#api-import")!.onclick = async () => {
    try {
      const response = await fetch(
        `/api/ftc?season=${event.season}&event=${encodeURIComponent(event.code)}`,
      );
      const data = (await response.json()) as Record<string, unknown>;
      if (!response.ok)
        throw new Error(String(data.error ?? "API import failed."));
      await importOfficial(data, event);
      toast("Official roster, schedule and available results imported.");
    } catch (e) {
      err(e);
    }
  };
}
type Raw = Record<string, unknown>;
const object = (x: unknown): Raw =>
  x && typeof x === "object" ? (x as Raw) : {};
const array = (x: unknown): Raw[] => (Array.isArray(x) ? x.map(object) : []);
/** Versioned API adapter. Reject missing score fields rather than fabricating qualification criteria. */
export function officialToCSV(payload: Raw) {
  const teams = array(
      object(payload.teams).teams ?? object(payload.teams).Teams,
    ),
    schedule = array(
      object(payload.schedule).schedule ?? object(payload.schedule).Schedule,
    ),
    scores = array(
      object(payload.scores).MatchScores ?? object(payload.scores).matchScores,
    );
  if (!teams.length || !schedule.length)
    throw new Error(
      "API response lacks a roster or qualification schedule. Use CSV if this event has not published them.",
    );
  const teamCSV = [
    "number,name",
    ...teams.map((t) =>
      [t.teamNumber, t.nameShort ?? t.nameFull ?? `Team ${t.teamNumber}`]
        .map(escapeCSV)
        .join(","),
    ),
  ].join("\n");
  const rows: string[][] = [];
  for (const m of schedule) {
    const stations = array(m.teams),
      red = stations
        .filter((t) => String(t.station).toLowerCase().startsWith("red"))
        .sort((a, b) => String(a.station).localeCompare(String(b.station))),
      blue = stations
        .filter((t) => String(t.station).toLowerCase().startsWith("blue"))
        .sort((a, b) => String(a.station).localeCompare(String(b.station)));
    if (red.length !== 2 || blue.length !== 2)
      throw new Error("Unsupported station layout in official schedule.");
    const number = Number(m.matchNumber),
      detail = scores.find(
        (s) =>
          Number(s.matchNumber) === number &&
          ["QUALIFICATION", "QUAL", "qual"].includes(String(s.matchLevel)) &&
          Number(s.matchSeries ?? 0) === Number(m.series ?? 0),
      ),
      alliances = array(detail?.alliances);
    const values: string[] = [];
    const hasResults = alliances.length === 2;
    const result = (color: string) =>
      alliances.find((a) => String(a.alliance).toLowerCase() === color) ?? {};
    const rr = result("red"),
      br = result("blue");
    const pick = (a: Raw, keys: string[]) => {
      for (const k of keys) if (typeof a[k] === "number") return String(a[k]);
      throw new Error(
        `Official score detail schema needs mapping for ${keys[0]}. Import the documented CSV columns instead.`,
      );
    };
    const fromDetail = (a: Raw) => [
      Number(pick(a, ["totalPoints"])),
      Number(pick(a, ["totalPoints"])) - Number(pick(a, ["preFoulTotal"])),
      Number(pick(a, ["autoLeavePoints"])) +
        Number(pick(a, ["autoParkPoints"])) +
        Number(pick(a, ["teleopParkPoints"])),
      Number(pick(a, ["autoHiveTips"])) + Number(pick(a, ["teleopHiveTips"])),
      Number(pick(a, ["autoPoints"])),
    ];
    const r = hasResults ? fromDetail(rr) : [],
      b = hasResults ? fromDetail(br) : [];
    if (hasResults)
      for (let i = 0; i < 5; i++) values.push(String(r[i]), String(b[i]));
    else for (let i = 0; i < 10; i++) values.push("");
    const rp = (a: Raw, score: number, opponent: number) =>
      String(
        ["swarmRP", "pollinator1RP", "pollinator2RP"].reduce(
          (n, k) => n + (a[k] ? GAME.rp.achievement : 0),
          0,
        ) +
          (score > opponent
            ? GAME.rp.win
            : score === opponent
              ? GAME.rp.tie
              : 0),
      );
    rows.push([
      String(number),
      ...red.map((t) => String(t.teamNumber)),
      ...blue.map((t) => String(t.teamNumber)),
      ...values,
      hasResults ? rp(rr, r[0], b[0]) : "",
      hasResults ? rp(br, b[0], r[0]) : "",
      stations
        .filter((t) => t.surrogate)
        .map((t) => String(t.teamNumber))
        .join("|"),
      stations
        .filter((t) => t.dq || t.noShow)
        .map((t) => String(t.teamNumber))
        .join("|"),
    ]);
  }
  return {
    teams: teamCSV,
    schedule: [
      scheduleColumns.join(","),
      ...rows.map((r) => r.map(escapeCSV).join(",")),
    ].join("\n"),
    scores,
  };
}
export async function importOfficial(payload: Raw, event: Event) {
  const converted = officialToCSV(payload);
  await importTeams(converted.teams, event);
  await importSchedule(
    converted.schedule,
    active(database.events).find((e) => e.id === event.id)!,
  );
  for (const m of active(database.matches).filter(
    (m) => m.eventId === event.id,
  )) {
    const raw = converted.scores.find(
      (s) =>
        Number(s.matchNumber) === m.number &&
        String(s.matchLevel) === "QUALIFICATION",
    );
    if (raw) await saveEntity("matches", { ...m, rawScore: raw });
  }
}
