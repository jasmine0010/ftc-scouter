import { eventOPR, mean, pitDisagreements, teamStats } from "./analytics.js";
import { scoreObservation } from "./scoring.js";
import { active, now, uid, type Event } from "./types.js";
import { database, settings, saveEntity } from "./storage.js";
import { pitSections } from "./pit.js";
import {
  empty,
  esc,
  exportRoutePNG,
  field,
  fieldSVG,
  fmt,
  formValues,
  pct,
  section,
  sparkline,
  table,
  textArea,
  toast,
} from "./ui.js";
export function renderDirectory(root: HTMLElement, event: Event) {
  let query = "";
  const render = () => {
    const teams = active(database.teams).filter(
      (t) =>
        event.teams.includes(t.number) &&
        `${t.number} ${t.name}`.toLowerCase().includes(query.toLowerCase()),
    );
    root.innerHTML = `<div class="page-heading"><div><p class="eyebrow">TEAM DATABASE / ${event.teams.length} TEAMS</p><h2>Team Profiles</h2><p class="lede">Match evidence, pit capabilities and the notes that numbers miss.</p></div><a class="button primary" href="#pit">Add pit record →</a></div><div class="toolbar">${field("Search team number or name", "directory-search", query, "search")}<a class="text-link" href="#coverage">Pit coverage →</a></div><div class="team-directory">${
      teams
        .map((t) => {
          const s = teamStats(database, t.number, event.id),
            p = active(database.pits).find(
              (p) => p.team === t.number && p.eventId === event.id,
            );
          return `<article class="team-card"><h3>${t.number}</h3><strong>${esc(t.name)}</strong><dl><div><dt>Matches</dt><dd>${s.obs.length}</dd></div><div><dt>Pit profiles</dt><dd>${p ? 1 : 0}</dd></div><div><dt>Average score</dt><dd>${s.obs.length ? fmt(s.total.average) : "—"}</dd></div></dl><a href="#team/${t.number}" class="button">View Profile</a></article>`;
        })
        .join("") ||
      empty(
        "No teams found",
        "Import the event roster in Event data, or add a team below.",
      )
    }</div>${section("Add a team", `<form id="add-team" class="inline-form">${field("Team number", "number", "", "number", 'min="1" max="999999" required')}${field("Team name", "name", "", "text", 'required maxlength="100"')}<button class="primary" type="submit">Add or update team</button></form>`)}`;
    root.querySelector<HTMLInputElement>('[name="directory-search"]')!.oninput =
      (e) => {
        query = (e.target as HTMLInputElement).value;
        const pos = (e.target as HTMLInputElement).selectionStart;
        render();
        const input = root.querySelector<HTMLInputElement>(
          '[name="directory-search"]',
        )!;
        input.focus();
        input.setSelectionRange(pos, pos);
      };
    root.querySelector<HTMLFormElement>("#add-team")!.onsubmit = async (e) => {
      e.preventDefault();
      const f = e.target as HTMLFormElement;
      if (!f.reportValidity()) return;
      const v = formValues(f),
        number = Number(v.number);
      await saveEntity("teams", {
        id: String(number),
        number,
        name: String(v.name).trim(),
        updatedAt: now(),
      });
      if (!event.teams.includes(number)) {
        event = { ...event, teams: [...event.teams, number] };
        await saveEntity("events", event);
      }
      toast("Team record saved.");
      render();
    };
  };
  render();
}
export function renderCoverage(root: HTMLElement, event: Event) {
  const pits = active(database.pits).filter((p) => p.eventId === event.id),
    missing = event.teams.filter((t) => !pits.some((p) => p.team === t));
  root.innerHTML = `<div class="page-heading"><div><p class="eyebrow">PIT COVERAGE</p><h1>${pits.length} of ${event.teams.length} interviewed.</h1><p class="lede">${missing.length} teams still need a pit record at ${esc(event.name)}.</p></div><a class="button" href="#teams">All team profiles →</a></div>${table(
    ["Team", "Name", "Pit entry", "Action"],
    event.teams.map((t) => {
      const p = pits.find((p) => p.team === t);
      return [
        `<a href="#team/${t}">${t}</a>`,
        esc(active(database.teams).find((x) => x.number === t)?.name ?? ""),
        p
          ? `Complete · ${esc(p.scout || "Scout not recorded")}`
          : '<span class="tag">Needed</span>',
        `<a class="text-link" href="#pit/${t}">${p ? "Edit" : "Scout"} →</a>`,
      ];
    }),
    "Pit coverage",
  )}`;
}
export function renderProfile(
  root: HTMLElement,
  team: number,
  event: Event,
  season = false,
) {
  const t = active(database.teams).find((t) => t.number === team);
  if (!t) {
    root.innerHTML = empty(
      "Team not found",
      "Import this team or add it in Team profiles.",
    );
    return;
  }
  const s = teamStats(database, team, season ? undefined : event.id),
    pit = active(database.pits).find(
      (p) => p.team === team && p.eventId === event.id,
    ),
    opr = eventOPR(database, event),
    disagreements = pitDisagreements(database, team, event.id),
    notes = active(database.notes)
      .filter((n) => n.team === team && (season || n.eventId === event.id))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const categoryLabels: Record<string, string> = {
    total: "Total earned",
    auto: "AUTO",
    tele: "TELEOP",
    penalties: "Fouls conceded",
    net: "Net impact",
    movement: "LEAVE + PARK",
    tips: "HIVE TIP count",
    leave: "LEAVE points",
    autoPark: "AUTO PARK",
    autoTips: "AUTO HIVE",
    telePark: "TELEOP PARK",
    teleTips: "TELEOP HIVE",
    cell: "Final CELL",
    flower: "Owned FLOWER contribution",
    bottom: "Bottom NECTAR",
    garden: "GARDEN contribution",
  };
  const statsRows = [
    ...(
      ["total", "auto", "tele", "penalties", "net", "movement", "tips"] as const
    ).map((k) => [
      categoryLabels[k],
      ...["average", "median", "best", "sd"].map((v) =>
        fmt(s[k][v as keyof typeof s.total]),
      ),
    ]),
    ...Object.entries(s.categories).map(([k, x]) => [
      categoryLabels[k] ?? k,
      fmt(x.average),
      fmt(x.median),
      fmt(x.best),
      fmt(x.sd),
    ]),
  ];
  root.innerHTML = `<a href="#teams" class="back-link">← Team profiles</a><div class="page-heading"><div><p class="eyebrow">TEAM ${team}${team === settings.team ? " / OUR TEAM" : ""}</p><h2>${team} · ${esc(t.name)}</h2><p class="lede">${season ? "Season-long evidence" : "Event evidence"} · ${s.obs.length} scouted matches · ${pct(s.reliability)} matches without breakdown</p></div><div class="button-row"><button id="season-toggle">${season ? "This event" : "Season view"}</button><a class="button primary" href="#pit/${team}">${pit ? "Edit pit record" : "Scout this pit"} →</a></div></div><div class="stat-row profile-summary">${[
    ["Avg score", s.obs.length ? fmt(s.total.average) : "—"],
    ["Auto avg", s.obs.length ? fmt(s.auto.average) : "—"],
    [
      "TeleOp avg",
      s.obs.length
        ? fmt(
            mean(
              s.scores.map(
                (score) =>
                  score.tele -
                  score.categories.telePark -
                  score.categories.bottom,
              ),
            ),
          )
        : "—",
    ],
    [
      "End game avg",
      s.obs.length
        ? fmt(
            mean(
              s.scores.map(
                (score) => score.categories.telePark + score.categories.bottom,
              ),
            ),
          )
        : "—",
    ],
    [
      "Avg elements",
      s.obs.length
        ? fmt(
            mean(
              s.obs.map(
                (observation) =>
                  observation.auto.pollen +
                  observation.auto.nectar +
                  observation.tele.pollen +
                  observation.tele.nectar,
              ),
            ),
          )
        : "—",
    ],
  ]
    .map(
      ([label, value]) =>
        `<div><span>${label}</span><strong>${value}</strong></div>`,
    )
    .join(
      "",
    )}</div>${disagreements.length ? `<aside class="callout"><strong>Pit / match disagreement</strong>${disagreements.map((x) => `<p>${esc(x)}</p>`).join("")}</aside>` : ""}<div class="analysis-split"><section class="section"><header class="section-head"><h2>Across matches</h2><p>Scouted contribution by qualification match</p></header><label class="field"><span>Trend category</span><select id="trend-category">${["total", "auto", "tele", "penalties", "movement", "tips", ...Object.keys(s.categories)].map((k) => `<option value="${k}">${esc(categoryLabels[k] ?? k)}</option>`).join("")}</select></label><div id="team-trend">${sparkline(
    s.scores.map((x) => x.total),
    600,
    180,
    s.obs.map((o) => String(o.match)),
  )}</div></section><section class="section"><header class="section-head"><h2>Contribution estimate</h2></header><div class="comparison-numbers"><span><b>${fmt(opr.values[team] ?? 0)}</b>OPR-style</span><span><b>${fmt(teamStats(database, team, event.id).total.average)}</b>Scouted average</span></div><p class="hint">Event ridge least squares · ${opr.rows} alliance results. Difference ${fmt((opr.values[team] ?? 0) - teamStats(database, team, event.id).total.average)} points. Alliance end-state credit and shared roles can explain disagreement. ${season ? "OPR remains event-specific." : ""}</p></section></div>${section("Scoring distribution", table(["Category", "Average", "Median", "Best", "Std dev"], statsRows, "Scoring category statistics"), "Population standard deviation. Empty samples show zero; no unobserved match is counted as a zero.")}${section(
    "Scouted matches",
    table(
      ["Match", "Alliance", "Score", "Sort"],
      s.obs.map((observation) => [
        `<a href="#scout/${esc(observation.id)}">${observation.match}</a>`,
        observation.alliance === "red" ? "Red" : "Blue",
        fmt(scoreObservation(observation).total, 0),
        observation.canSort ? "Yes" : "No",
      ]),
      "Team matches",
    ),
  )}${section("Capabilities observed", `<div class="metric-line"><span>Sort / own NECTAR ${pct(mean(s.obs.map((o) => +o.canSort)))}</span><span>Compatibility ${fmt(mean(s.obs.map((o) => o.compatibility)))} / 5</span><span>Offense ${fmt(mean(s.obs.map((o) => o.offense)))} / 5</span><span>Defense ${pct(mean(s.obs.map((o) => +o.defense)))}</span><span>Fixed position ${pct(mean(s.obs.map((o) => +o.fixedPosition)))}</span></div>`)}${section("Pit scouting", pit ? `<div class="pit-heading"><p>${esc(pit.scout || "Scout not recorded")} · ${esc(pit.talkedAt || "Interview time not recorded")} · ${esc(new Date(pit.updatedAt).toLocaleDateString())}</p><a class="text-link" href="#pit/${team}">Edit record →</a></div>${pit.photo ? `<img class="robot-photo" src="${esc(pit.photo)}" alt="Team ${team} robot">` : ""}<div class="pit-readout">${pitSections.map((sec) => `<details><summary>${esc(sec.title)}</summary><dl>${sec.fields.map(([k, l]) => `<div><dt>${esc(l)}</dt><dd>${esc(typeof pit.answers[k] === "boolean" ? (pit.answers[k] ? "Yes" : "No") : (pit.answers[k] ?? "Not recorded"))}</dd></div>`).join("")}</dl></details>`).join("")}</div>${pit.routes.length ? `<div class="route-readout">${pit.routes.map((r) => `<figure>${fieldSVG([{ route: r }])}<figcaption>${esc(r.label)} · ${esc(r.start)}<button data-route-png="${esc(r.id)}">Export PNG</button></figcaption></figure>`).join("")}</div><a class="text-link" href="#alliance/overlay/${team}">Overlay with our route →</a>` : '<p class="muted">No autonomous routes recorded.</p>'}` : empty("No pit record yet", "Use pit scouting to record capabilities, routes and the last-minute plan."))}${section("Team notes", `<div class="section-actions"><button class="primary" id="add-note">Add note</button></div>${notes.map((n) => `<article class="note"><p>${esc(n.text)}</p><small>${esc(n.author || "Scout")} · ${esc(new Date(n.updatedAt).toLocaleString())}</small></article>`).join("") || '<p class="muted">No team notes yet.</p>'}`)}${section("External FTCScout data", `<button id="load-external">Load season statistics & awards</button><a class="text-link" target="_blank" rel="noreferrer" href="https://ftcscout.org/teams/${team}">Open FTCScout ↗</a><div id="external-data"><p class="hint">Optional online enrichment is kept separate from local scouting evidence.</p></div>`)}`;
  const analysis = document.createElement("details");
  analysis.className = "profile-analysis";
  analysis.innerHTML = "<summary>Match analysis</summary>";
  const chart = root.querySelector(".analysis-split");
  if (chart) analysis.append(chart);
  root.querySelectorAll(":scope > .section").forEach((section) => {
    const title = section.querySelector(".section-head")?.textContent?.trim();
    if (title === "Scoring distribution" || title === "Capabilities observed")
      analysis.append(section);
  });
  root.append(analysis);
  root.querySelector<HTMLSelectElement>("#trend-category")!.onchange = (e) => {
    const key = (e.target as HTMLSelectElement).value;
    root.querySelector("#team-trend")!.innerHTML = sparkline(
      s.scores.map((x) =>
        key in x
          ? Number(x[key as keyof typeof x])
          : (x.categories as Record<string, number>)[key],
      ),
      600,
      180,
      s.obs.map((o) => String(o.match)),
    );
  };
  root.querySelector<HTMLButtonElement>("#season-toggle")!.onclick = () =>
    renderProfile(root, team, event, !season);
  root.querySelector<HTMLButtonElement>("#add-note")!.onclick = () => {
    const dialog = document.createElement("dialog");
    dialog.setAttribute("aria-labelledby", "note-title");
    dialog.innerHTML = `<form><div class="section-head"><h2 id="note-title">Note for ${team}</h2><button type="button" id="close-note" aria-label="Close note">×</button></div>${field("Scout", "author", "")}${textArea("Team note", "text", "", 'maxlength="500" required')}<span id="note-count">0 / 500</span><div class="button-row"><button type="button" id="cancel-note">Cancel</button><button class="primary" type="submit" disabled>Add note</button></div></form>`;
    document.body.append(dialog);
    dialog.showModal();
    const close = () => {
      dialog.close();
      dialog.remove();
    };
    dialog.querySelector<HTMLButtonElement>("#close-note")!.onclick = close;
    dialog.querySelector<HTMLButtonElement>("#cancel-note")!.onclick = close;
    dialog.onclose = () => dialog.remove();
    dialog.querySelector<HTMLTextAreaElement>("textarea")!.oninput = (e) => {
      const value = (e.target as HTMLTextAreaElement).value;
      dialog.querySelector("#note-count")!.textContent =
        `${value.length} / 500`;
      dialog.querySelector<HTMLButtonElement>(
        'button[type="submit"]',
      )!.disabled = !value.trim();
    };
    dialog.querySelector<HTMLFormElement>("form")!.onsubmit = async (e) => {
      e.preventDefault();
      const f = e.target as HTMLFormElement;
      if (!f.reportValidity()) return;
      const v = formValues(f);
      if (!String(v.text).trim()) return;
      await saveEntity("notes", {
        id: uid(),
        updatedAt: now(),
        eventId: event.id,
        team,
        text: String(v.text).trim(),
        author: String(v.author),
      });
      close();
      renderProfile(root, team, event, season);
    };
  };
  root
    .querySelectorAll<HTMLButtonElement>("[data-route-png]")
    .forEach(
      (b) =>
        (b.onclick = () =>
          void exportRoutePNG(
            b.closest("figure")!.querySelector("svg")!,
            `${team}-${b.dataset.routePng}.png`,
          )),
    );
  root.querySelector<HTMLButtonElement>("#load-external")!.onclick =
    async () => {
      const target = root.querySelector("#external-data")!;
      target.textContent = "Loading external data…";
      try {
        const response = await fetch(`/api/ftcscout?team=${team}`);
        const result = (await response.json()) as {
          error?: string;
          stats?: unknown;
          awards?: unknown;
        };
        if (!response.ok)
          throw new Error(result.error ?? "Data is unavailable.");
        const stats = (result.stats ?? {}) as Record<
            string,
            { value?: number } | number
          >,
          awards = Array.isArray(result.awards) ? result.awards : [];
        target.innerHTML =
          table(
            ["Source statistic", "Value"],
            Object.entries(stats)
              .filter(
                ([, v]) =>
                  typeof v === "number" ||
                  (typeof v === "object" && v && "value" in v),
              )
              .map(([k, v]) => [
                esc(k),
                esc(typeof v === "number" ? v : v.value),
              ]),
            "External statistics",
          ) +
          `<h3>Awards</h3>${awards.length ? `<ul>${awards.map((a) => `<li>${esc(typeof a === "string" ? a : JSON.stringify(a))}</li>`).join("")}</ul>` : '<p class="muted">No published season awards.</p>'}`;
      } catch (e) {
        target.textContent = (e as Error).message;
      }
    };
}
