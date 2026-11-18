import { mean, simulateRanks, standings, teamStats } from "./analytics.js";
import { scoreObservation, deriveResults, shotAccuracy } from "./scoring.js";
import { active, type Event } from "./types.js";
import { GAME } from "./game.js";
import {
  database,
  deleteRecords,
  settings,
  observationCSV,
  exportFile,
} from "./storage.js";
import {
  actionMenu,
  confirmDialog,
  moreButton,
  esc,
  field,
  fmt,
  pct,
  section,
  table,
} from "./ui.js";

type Filters = {
  search: string;
  auto: string;
  tele: string;
  min: string;
  max: string;
};
const noFilters: Filters = {
  search: "",
  auto: "all",
  tele: "all",
  min: "",
  max: "",
};
const filters: Filters = { ...noFilters };
const filtering = () =>
  (Object.keys(noFilters) as (keyof Filters)[]).some(
    (k) => filters[k] !== noFilters[k],
  );
let filterEvent = "";
const tier = (value: number, choice: string, base: number) =>
  choice === "all" ||
  (choice === "high" && value >= base * 2) ||
  (choice === "medium" && value >= base && value < base * 2) ||
  (choice === "low" && value < base);
/** Search matches the start of a team number or any part of its name. */
const matchesFilters = (
  team: number,
  name: string,
  auto: number,
  tele: number,
  score: number,
) => {
  const q = filters.search.trim().toLowerCase();
  return (
    (!q || String(team).startsWith(q) || name.toLowerCase().includes(q)) &&
    tier(auto, filters.auto, GAME.points.tip) &&
    tier(tele, filters.tele, GAME.points.tip * 2) &&
    (filters.min === "" || score >= Number(filters.min)) &&
    (filters.max === "" || score <= Number(filters.max))
  );
};
/** One-line filter bar: search, two level dropdowns, a score range, Clear. */
function filterMarkup() {
  const level = (label: string, name: string, value: string) =>
    `<select name="${name}" aria-label="${label} level">${[
      ["all", `${label}: any`],
      ["high", `${label}: high`],
      ["medium", `${label}: medium`],
      ["low", `${label}: low`],
    ]
      .map(
        ([v, text]) =>
          `<option value="${v}"${v === value ? " selected" : ""}>${text}</option>`,
      )
      .join("")}</select>`;
  return `<div class="filter-bar" role="search"><input name="search-filter" type="search" placeholder="Search team number or name" aria-label="Search teams" value="${esc(filters.search)}">${level("Auto", "auto-filter", filters.auto)}${level("TeleOp", "tele-filter", filters.tele)}<span class="score-range"><input name="min-filter" type="number" min="0" inputmode="numeric" placeholder="Min score" aria-label="Minimum score" value="${esc(filters.min)}"><span aria-hidden="true">–</span><input name="max-filter" type="number" min="0" inputmode="numeric" placeholder="Max" aria-label="Maximum score" value="${esc(filters.max)}"></span>${filtering() ? '<button type="button" id="clear-filters" class="text-button">Clear</button>' : ""}</div>`;
}
function bindFilters(root: HTMLElement, render: () => void) {
  for (const [name, key] of [
    ["search-filter", "search"],
    ["auto-filter", "auto"],
    ["tele-filter", "tele"],
    ["min-filter", "min"],
    ["max-filter", "max"],
  ] as const) {
    const input = root.querySelector<HTMLInputElement | HTMLSelectElement>(
      `[name="${name}"]`,
    )!;
    input.oninput = () => {
      filters[key] = input.value;
      render();
      // The bar is redrawn; keep typing where you were.
      const again = root.querySelector<HTMLInputElement>(`[name="${name}"]`)!;
      again.focus();
      if (again.type === "search")
        again.setSelectionRange(again.value.length, again.value.length);
    };
  }
  const clear = root.querySelector<HTMLButtonElement>("#clear-filters");
  if (clear)
    clear.onclick = () => {
      Object.assign(filters, noFilters);
      render();
    };
}
export function renderRankings(
  root: HTMLElement,
  event: Event,
  tab = "overview",
) {
  if (filterEvent !== event.id) {
    filterEvent = event.id;
    Object.assign(filters, noFilters);
  }
  root.innerHTML = `<div class="page-heading"><h2>${tab === "standings" ? "Standings" : tab === "simulator" ? "Rank simulator" : "Rankings & Data"}</h2></div>${tab === "overview" || tab === "matches" ? `<nav class="tabs data-tabs" aria-label="Rankings and data views"><a href="#rankings/overview"${tab === "overview" ? ' aria-current="page"' : ""}>Teams</a><a href="#rankings/matches"${tab === "matches" ? ' aria-current="page"' : ""}>Matches</a></nav>` : ""}<div id="rank-content"></div>`;
  const content = root.querySelector<HTMLElement>("#rank-content")!;
  const name = (team: number) =>
    active(database.teams).find((item) => item.number === team)?.name ??
    String(team);
  if (tab === "overview") {
    let sort = "average",
      direction = -1;
    const draw = () => {
      const rows = active(database.teams)
        .filter((team) => event.teams.includes(team.number))
        .map((team) => {
          const stats = teamStats(database, team.number, event.id);
          return {
            team: team.number,
            name: team.name,
            n: stats.obs.length,
            average: stats.total.average,
            auto: stats.auto.average,
            tele: mean(
              stats.scores.map(
                (s) => s.tele - s.categories.telePark - s.categories.bottom,
              ),
            ),
            end: mean(
              stats.scores.map(
                (s) => s.categories.telePark + s.categories.bottom,
              ),
            ),
            tips: stats.tips.average,
            accuracy: shotAccuracy(stats.obs),
            compat: mean(stats.obs.map((o) => o.compatibility)),
            filterTele: stats.tele.average,
          };
        })
        .filter((team) =>
          matchesFilters(
            team.team,
            team.name,
            team.auto,
            team.filterTele,
            team.average,
          ),
        )
        .sort((a, b) => {
          const left = a[sort as keyof typeof a] ?? -1,
            right = b[sort as keyof typeof b] ?? -1;
          return (
            direction *
            (typeof left === "string"
              ? left.localeCompare(String(right))
              : Number(left) - Number(right))
          );
        });
      const columns = [
        ["team", "Team"],
        ["n", "Matches"],
        ["average", "Avg score"],
        ["auto", "Auto"],
        ["tele", "TeleOp"],
        ["end", "End"],
        ["tips", "Hive tips"],
        ["accuracy", "Accuracy"],
        ["compat", "Compatibility"],
      ];
      content.innerHTML = `${filterMarkup()}<div class="table-wrap" tabindex="0" role="region" aria-label="Team rankings"><table class="data-table"><thead><tr>${columns.map(([key, label]) => `<th scope="col" aria-sort="${sort === key ? (direction < 0 ? "descending" : "ascending") : "none"}"><button data-sort="${key}">${label}${sort === key ? (direction < 0 ? " ↓" : " ↑") : ""}</button></th>`).join("")}</tr></thead><tbody>${rows.map((team) => `<tr${team.team === settings.team ? ' class="our-team"' : ""}><td class="team-cell"><a href="#team/${team.team}"><b>${team.team}</b> ${esc(team.name)}</a></td><td>${team.n}</td>${[team.average, team.auto, team.tele, team.end, team.tips].map((value) => `<td>${team.n ? fmt(value) : "—"}</td>`).join("")}<td>${team.accuracy === null ? "—" : pct(team.accuracy)}</td><td>${team.n ? fmt(team.compat) : "—"}</td></tr>`).join("")}</tbody></table></div>`;
      bindFilters(content, draw);
      content.querySelectorAll<HTMLButtonElement>("[data-sort]").forEach(
        (button) =>
          (button.onclick = () => {
            if (sort === button.dataset.sort) direction *= -1;
            else {
              sort = button.dataset.sort!;
              direction = -1;
            }
            draw();
          }),
      );
    };
    draw();
  } else if (tab === "matches") {
    let sort = "match",
      direction = 1;
    const draw = () => {
      const observations = active(database.observations)
        .filter((observation) => {
          const score = scoreObservation(observation);
          return (
            observation.eventId === event.id &&
            matchesFilters(
              observation.team,
              name(observation.team),
              score.auto,
              score.tele,
              score.total,
            )
          );
        })
        .sort((a, b) => {
          if (sort === "alliance")
            return direction * a.alliance.localeCompare(b.alliance);
          return (
            direction *
            (sort === "score"
              ? scoreObservation(a).total - scoreObservation(b).total
              : sort === "team"
                ? a.team - b.team
                : a.match - b.match)
          );
        });
      content.innerHTML = `${filterMarkup()}<div class="entries-bar"><span>Total entries <b>${observations.length}</b></span><button id="match-export">Export CSV</button></div><div class="table-wrap" tabindex="0" role="region" aria-label="Scouted matches"><table><thead><tr>${[
        ["score", "Score"],
        ["team", "Team"],
        ["match", "Match"],
        ["alliance", "Alliance"],
      ]
        .map(
          ([key, label]) =>
            `<th scope="col"><button data-match-sort="${key}">${label}${sort === key ? (direction > 0 ? " ↑" : " ↓") : ""}</button></th>`,
        )
        .join(
          "",
        )}<th>Scores breakdown</th><th>Notes</th><th><span class="visually-hidden">Actions</span></th></tr></thead><tbody>${observations
        .map((observation) => {
          const score = scoreObservation(observation),
            end = score.categories.telePark + score.categories.bottom;
          return `<tr><td>${fmt(score.total, 0)}</td><td><a href="#team/${observation.team}">${observation.team}</a></td><td><a href="#scout/${esc(observation.id)}">${observation.match}</a></td><td>${observation.alliance === "red" ? "Red" : "Blue"}</td><td><dl class="match-breakdown"><div><dt>Auto</dt><dd>${score.auto}</dd></div><div><dt>TeleOp</dt><dd>${score.tele - end}</dd></div><div><dt>End</dt><dd>${end}</dd></div><div><dt>Fouls</dt><dd>${score.penalties}</dd></div></dl></td><td class="note-cell">${esc(observation.note || "No notes.")}</td><td>${moreButton(`data-obs-menu="${esc(observation.id)}"`, `More actions for team ${observation.team}, match ${observation.match}`)}</td></tr>`;
        })
        .join("")}</tbody></table></div>${section(
        "Event schedule",
        table(
          ["Match", "Red", "Blue", "Result"],
          active(database.matches)
            .filter((match) => match.eventId === event.id)
            .map((match) => {
              const result = deriveResults(match, database);
              return [
                String(match.number),
                match.red.join(" + "),
                match.blue.join(" + "),
                result
                  ? `${result.red.score} – ${result.blue.score}`
                  : "Scheduled",
              ];
            }),
          "Schedule",
        ),
      )}`;
      bindFilters(content, draw);
      content.querySelectorAll<HTMLButtonElement>("[data-obs-menu]").forEach(
        (b) =>
          (b.onclick = async () => {
            const o = active(database.observations).find(
              (x) => x.id === b.dataset.obsMenu,
            );
            if (!o) return;
            const action = await actionMenu(
              `Team ${o.team} · match ${o.match}`,
              [
                { key: "edit", label: "Edit match record" },
                { key: "delete", label: "Delete match record", danger: true },
              ],
            );
            if (action === "edit") location.hash = `#scout/${o.id}`;
            if (
              action === "delete" &&
              (await confirmDialog(
                "Delete match record?",
                `Team ${o.team}'s record for match ${o.match} will be removed for every scout.`,
              ))
            ) {
              await deleteRecords([["observations", o]]);
              draw();
            }
          }),
      );
      content.querySelectorAll<HTMLButtonElement>("[data-match-sort]").forEach(
        (button) =>
          (button.onclick = () => {
            if (sort === button.dataset.matchSort) direction *= -1;
            else {
              sort = button.dataset.matchSort!;
              direction = 1;
            }
            draw();
          }),
      );
      content.querySelector<HTMLButtonElement>("#match-export")!.onclick = () =>
        exportFile(
          "observations.csv",
          observationCSV(observations),
          "text/csv",
        );
    };
    draw();
  } else if (tab === "standings") {
    const ranking = standings(database, event),
      index = ranking.findIndex((row) => row.team === settings.team),
      our = ranking[index],
      above = ranking[index - 1],
      below = ranking[index + 1];
    content.innerHTML = `<div class="stat-row"><div><span>Our rank</span><strong>${our?.played ? our.rank : "—"}</strong></div><div><span>Gap above</span><strong>${our?.played && above ? fmt(above.rankingScore - our.rankingScore, 2) : "—"}</strong></div><div><span>Gap below</span><strong>${our?.played && below ? fmt(our.rankingScore - below.rankingScore, 2) : "—"}</strong></div></div>${table(
      [
        "Rank",
        "Team",
        "Name",
        "Played",
        "Avg RP",
        "Avg points",
        "Avg tips",
        "Avg auto",
      ],
      ranking.map((row) => [
        String(row.rank),
        `<a href="#team/${row.team}">${row.team}</a>`,
        esc(name(row.team)),
        String(row.played),
        fmt(row.rankingScore, 2),
        fmt(row.averageNonFoulScore),
        fmt(row.averageTips),
        fmt(row.averageAuto),
      ]),
      "Qualification standings",
    )}`;
  } else {
    content.innerHTML = `<form id="simulation-form" class="inline-form">${field("Additional alliance points", "boost", 0, "number", 'min="-100" max="200" step="5"')}<button class="primary" type="submit">Run simulations</button></form><div id="simulation-result"></div>`;
    const form = content.querySelector<HTMLFormElement>("#simulation-form")!;
    const run = () => {
      const result = simulateRanks(
        database,
        event,
        settings.team,
        800,
        Number(new FormData(form).get("boost")),
      );
      content.querySelector("#simulation-result")!.innerHTML =
        `<div class="stat-row"><div><span>Average final rank</span><strong>${fmt(result.average)}</strong></div><div><span>Rank range</span><strong>${result.low}–${result.high}</strong></div><div><span>Remaining matches</span><strong>${result.remaining}</strong></div></div><div class="histogram" role="img" aria-label="Final rank probabilities">${result.hist.map((value, index) => `<div><span>${pct(value)}</span><div class="hist-track"><div style="height:${(value * 100) / Math.max(...result.hist, 0.01)}%"></div></div><b>${index + 1}</b></div>`).join("")}</div>`;
    };
    form.onsubmit = (event) => {
      event.preventDefault();
      if (form.reportValidity()) run();
    };
    run();
  }
}
