import { mean, simulateRanks, standings, teamStats } from "./analytics.js";
import { scoreObservation, deriveResults, shotAccuracy } from "./scoring.js";
import { active, type Event } from "./types.js";
import { GAME } from "./game.js";
import { database, settings, observationCSV, exportFile } from "./storage.js";
import { esc, field, fmt, pct, section, select, table } from "./ui.js";

type Filters = {
  team: string;
  auto: string;
  tele: string;
  min: string;
  max: string;
};
const filters: Filters = {
  team: "",
  auto: "all",
  tele: "all",
  min: "",
  max: "",
};
let filterEvent = "";
const tier = (value: number, choice: string, base: number) =>
  choice === "all" ||
  (choice === "high" && value >= base * 2) ||
  (choice === "medium" && value >= base && value < base * 2) ||
  (choice === "low" && value < base);
const matchesFilters = (
  team: number,
  auto: number,
  tele: number,
  score: number,
) =>
  (!filters.team || team === Number(filters.team)) &&
  tier(auto, filters.auto, GAME.points.tip) &&
  tier(tele, filters.tele, GAME.points.tip * 2) &&
  (filters.min === "" || score >= Number(filters.min)) &&
  (filters.max === "" || score <= Number(filters.max));
function filterMarkup() {
  const choices: [string, string][] = [
    ["all", "All"],
    ["high", "High"],
    ["medium", "Medium"],
    ["low", "Low"],
  ];
  return `<div class="filter-row">${field("Team ID", "team-filter", filters.team, "number", 'min="1"')}${select("Auto", "auto-filter", filters.auto, choices)}${select("TeleOp", "tele-filter", filters.tele, choices)}${field("Min score", "min-filter", filters.min, "number", 'min="0"')}${field("Max score", "max-filter", filters.max, "number", 'min="0"')}<button id="clear-filters">Clear Filters</button></div>`;
}
function bindFilters(root: HTMLElement, render: () => void) {
  for (const [name, key] of [
    ["team-filter", "team"],
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
      root.querySelector<HTMLElement>(`[name="${name}"]`)!.focus();
    };
  }
  root.querySelector<HTMLButtonElement>("#clear-filters")!.onclick = () => {
    Object.assign(filters, {
      team: "",
      auto: "all",
      tele: "all",
      min: "",
      max: "",
    });
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
    Object.assign(filters, {
      team: "",
      auto: "all",
      tele: "all",
      min: "",
      max: "",
    });
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
          matchesFilters(team.team, team.auto, team.filterTele, team.average),
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
        )}<th>Scores breakdown</th><th>Notes</th></tr></thead><tbody>${observations
        .map((observation) => {
          const score = scoreObservation(observation),
            end = score.categories.telePark + score.categories.bottom;
          return `<tr><td>${fmt(score.total, 0)}</td><td><a href="#team/${observation.team}">${observation.team}</a></td><td><a href="#scout/${esc(observation.id)}">${observation.match}</a></td><td>${observation.alliance === "red" ? "Red" : "Blue"}</td><td><dl class="match-breakdown"><div><dt>Auto</dt><dd>${score.auto}</dd></div><div><dt>TeleOp</dt><dd>${score.tele - end}</dd></div><div><dt>End</dt><dd>${end}</dd></div><div><dt>Fouls</dt><dd>${score.penalties}</dd></div></dl></td><td class="note-cell">${esc(observation.note || "No notes.")}</td></tr>`;
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
