import { simulateRanks, standings } from "./analytics.js";
import { scoreObservation, deriveResults } from "./scoring.js";
import { active, type Event } from "./types.js";
import { database, settings, observationCSV, exportFile } from "./storage.js";
import { esc, field, fmt, pct, section, table } from "./ui.js";
export function renderRankings(
  root: HTMLElement,
  event: Event,
  tab = "standings",
) {
  const teams = active(database.teams).filter((t) =>
    event.teams.includes(t.number),
  );
  const ranking = standings(database, event);
  const name = (team: number) =>
    teams.find((item) => item.number === team)?.name ?? String(team);
  root.innerHTML = `<div class="page-heading"><h1>${tab === "standings" ? "Standings" : tab === "matches" ? "Match log" : tab === "simulator" ? "Rank simulator" : "Team analytics"}</h1></div><div id="rank-content"></div>`;
  const content = root.querySelector<HTMLElement>("#rank-content")!;
  if (tab === "standings") {
    const index = ranking.findIndex((row) => row.team === settings.team);
    const our = ranking[index],
      above = ranking[index - 1],
      below = ranking[index + 1];
    content.innerHTML = `<div class="stat-row"><div><span>Gap above</span><strong>${our?.played && above ? fmt(above.rankingScore - our.rankingScore, 2) : "—"}</strong></div><div><span>Gap below</span><strong>${our?.played && below ? fmt(our.rankingScore - below.rankingScore, 2) : "—"}</strong></div></div>${table(
      [
        "Rank",
        "Team",
        "Name",
        "Played",
        "Avg RP",
        "Avg non-foul pts",
        "Avg TIPs",
        "Avg AUTO",
        "",
      ],
      ranking.map((r) => [
        String(r.rank),
        `<a href="#team/${r.team}"${r.team === settings.team ? ' class="ours"' : ""}>${r.team}${r.team === settings.team ? " / OURS" : ""}</a>`,
        esc(name(r.team)),
        String(r.played),
        fmt(r.rankingScore, 2),
        fmt(r.averageNonFoulScore),
        fmt(r.averageTips),
        fmt(r.averageAuto),
        r.unresolved ? '<span class="muted">Provisional tie</span>' : "",
      ]),
      "Qualification standings",
    )}<p class="hint">Table 13-1 order. Surrogate matches are excluded; disqualified teams receive zero. An unresolved exact tie uses team number as a stable provisional display order, since FIRST’s random key is unavailable.</p>`;
  } else if (tab === "matches") {
    let query = "",
      sort = "match",
      direction = 1;
    const draw = () => {
      const obs = active(database.observations)
        .filter(
          (o) =>
            o.eventId === event.id &&
            (!query || String(o.team).includes(query)),
        )
        .sort(
          (a, b) =>
            direction *
            (sort === "score"
              ? scoreObservation(a).total - scoreObservation(b).total
              : sort === "team"
                ? a.team - b.team
                : a.match - b.match),
        );
      content.innerHTML = `<div class="toolbar">${field("Filter team number", "match-team-query", query, "search")}<button id="match-export">Export observations CSV</button><span class="muted">${obs.length} entries</span></div><div class="table-wrap"><table><thead><tr>${[
        ["match", "Match"],
        ["team", "Team"],
        ["score", "Earned"],
      ]
        .map(
          ([key, label]) =>
            `<th><button data-match-sort="${key}">${label}${sort === key ? (direction > 0 ? " ↑" : " ↓") : ""}</button></th>`,
        )
        .join(
          "",
        )}<th>Alliance</th><th>AUTO / TELEOP</th><th>HIVE TIPs</th><th>Fouls</th><th>Note</th><th></th></tr></thead><tbody>${obs
        .map((o) => {
          const s = scoreObservation(o);
          return `<tr><td>Q${o.match}</td><td><a href="#team/${o.team}">${o.team}</a></td><td>${fmt(s.total, 0)}</td><td>${esc(o.alliance)}</td><td>${s.auto} / ${s.tele}</td><td>${s.tips}</td><td>${s.penalties}</td><td class="note-cell">${esc(o.note || "No notes.")}</td><td><a href="#scout/${esc(o.id)}">Edit</a> <a href="#field/${o.match}">Field outcome</a></td></tr>`;
        })
        .join("")}</tbody></table></div>${section(
        "Event schedule",
        table(
          ["Qualification", "Red", "Blue", "Result"],
          active(database.matches)
            .filter((m) => m.eventId === event.id)
            .map((m) => {
              const result = deriveResults(m, database);
              return [
                `Q${m.number}`,
                m.red.join(" + "),
                m.blue.join(" + "),
                result
                  ? `${result.red.score} – ${result.blue.score}${result.official ? " · official" : " · scouted"}`
                  : "Scheduled",
              ];
            }),
          "Schedule",
        ),
      )}`;
      content.querySelector<HTMLInputElement>(
        '[name="match-team-query"]',
      )!.oninput = (e) => {
        query = (e.target as HTMLInputElement).value;
        draw();
        const inp = content.querySelector<HTMLInputElement>(
          '[name="match-team-query"]',
        )!;
        inp.focus();
      };
      content.querySelectorAll<HTMLButtonElement>("[data-match-sort]").forEach(
        (b) =>
          (b.onclick = () => {
            if (sort === b.dataset.matchSort) direction *= -1;
            else {
              sort = b.dataset.matchSort!;
              direction = 1;
            }
            draw();
          }),
      );
      content.querySelector<HTMLButtonElement>("#match-export")!.onclick = () =>
        exportFile("observations.csv", observationCSV(obs), "text/csv");
    };
    draw();
  } else {
    content.innerHTML = `${section("Remaining-match simulator", `<form id="simulation-form" class="inline-form">${field("Additional alliance points in our remaining matches", "boost", 0, "number", 'min="-100" max="200" step="5"')}<button class="primary" type="submit">Run 800 simulations</button></form><p class="hint">The what-if adds points to our alliance, keeping TIP and movement forecasts unchanged. Each run uses team scoring variation and the remaining imported schedule. Estimates depend on limited scouting evidence.</p><div id="simulation-result"></div>`)}`;
    const f = content.querySelector<HTMLFormElement>("#simulation-form")!;
    const run = () => {
      const boost = Number(new FormData(f).get("boost")),
        result = simulateRanks(database, event, settings.team, 800, boost);
      content.querySelector("#simulation-result")!.innerHTML =
        `<div class="stat-row"><div><span>Average final rank</span><strong>${fmt(result.average)}</strong></div><div><span>Simulated rank range</span><strong>${result.low}–${result.high}</strong></div><div><span>Remaining matches</span><strong>${result.remaining}</strong></div><div><span>Samples</span><strong>800</strong></div></div><div class="histogram" role="img" aria-label="Final rank probabilities">${result.hist.map((v, i) => `<div><span>${pct(v)}</span><div class="hist-track"><div style="height:${(v * 100) / Math.max(...result.hist, 0.01)}%"></div></div><b>${i + 1}</b></div>`).join("")}</div><p class="hint">Ranks are forecasts, not official results. Ties are randomly broken within each simulation; completed matches remain fixed.</p>`;
    };
    f.onsubmit = (e) => {
      e.preventDefault();
      if (f.reportValidity()) run();
    };
    run();
  }
}
