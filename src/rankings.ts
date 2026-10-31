import {
  compatibility,
  eventOPR,
  mean,
  simulateRanks,
  standings,
  teamStats,
} from "./analytics.js";
import { scoreObservation, deriveResults } from "./scoring.js";
import { active, type Event } from "./types.js";
import { GAME } from "./game.js";
import { database, settings, observationCSV, exportFile } from "./storage.js";
import { empty, esc, field, fmt, pct, section, select, table } from "./ui.js";
export function renderRankings(
  root: HTMLElement,
  event: Event,
  tab = "overview",
) {
  const teams = active(database.teams).filter((t) =>
      event.teams.includes(t.number),
    ),
    ranking = standings(database, event),
    our = ranking.find((r) => r.team === settings.team),
    ourStats = teamStats(database, settings.team, event.id),
    opr = eventOPR(database, event),
    pits = active(database.pits).filter((p) => p.eventId === event.id),
    completed = active(database.matches).filter(
      (m) => m.eventId === event.id && deriveResults(m, database),
    ).length;
  const next = active(database.matches)
      .filter(
        (m) =>
          m.eventId === event.id &&
          !deriveResults(m, database) &&
          [...m.red, ...m.blue].includes(settings.team),
      )
      .sort((a, b) => a.number - b.number)[0],
    name = (t: number) =>
      teams.find((x) => x.number === t)?.name ?? `Team ${t}`;
  root.innerHTML = `<div class="page-heading"><div><p class="eyebrow">BIOBUZZ ${GAME.season} / ${completed} QUALIFICATIONS COMPLETE</p><h1>Event overview.</h1><p class="lede">${esc(event.name)} <span class="separator">/</span> ${event.teams.length} teams in the field</p></div><a href="#scout" class="button primary">Scout a match <span>↗</span></a></div><nav class="tabs" aria-label="Rankings and data views">${[
    ["overview", "Team analytics"],
    ["standings", "Standings"],
    ["matches", "Match log"],
    ["simulator", "Rank simulator"],
  ]
    .map(
      ([key, label]) =>
        `<a href="#rankings/${key}"${key === tab ? ' aria-current="page"' : ""}>${label}</a>`,
    )
    .join(
      "",
    )}</nav><div class="stat-row"><div><span>Our qualification rank</span><strong>${our?.played ? `<sup>#</sup>${our.rank}` : "—"}<small>/ ${event.teams.length}</small></strong><a href="#rankings/standings">${our?.played ? `${fmt(our.rankingScore, 2)} average RP` : "No ranked matches"}</a></div><div><span>Our scouted average</span><strong>${ourStats.obs.length ? fmt(ourStats.total.average) : "—"}<small>pts</small></strong><span>${ourStats.obs.length} observed matches</span></div><div><span>OPR-style estimate</span><strong>${fmt(opr.values[settings.team] ?? 0)}<small>pts</small></strong><span>${fmt((opr.values[settings.team] ?? 0) - ourStats.total.average)} vs scouted</span></div><div><span>Pit coverage</span><strong>${pits.length}<small>/ ${event.teams.length}</small></strong><a href="#coverage">${event.teams.length - pits.length} teams need an interview →</a></div></div><div id="rank-content"></div>`;
  const content = root.querySelector<HTMLElement>("#rank-content")!;
  if (tab === "overview") {
    const candidates = event.teams
      .filter((t) => t !== settings.team)
      .map((t) => ({
        team: t,
        ...compatibility(database, settings.team, t, event),
      }))
      .sort((a, b) => b.index - a.index)
      .slice(0, 2);
    content.innerHTML = `<div class="briefing-grid"><section class="briefing"><p class="eyebrow">NEXT FOR ${settings.team}</p>${next ? `<div class="next-match"><strong>Q${next.number}</strong><div><span>${next.red.includes(settings.team) ? "Red" : "Blue"} alliance</span><b>${next.red.includes(settings.team) ? next.red.join(" + ") : next.blue.join(" + ")}</b><small>vs ${next.red.includes(settings.team) ? next.blue.join(" + ") : next.red.join(" + ")}</small></div><a class="text-link" href="#alliance/head/${next.number}">Project match ↗</a></div>` : "<p>No remaining scheduled match. Import a schedule in Event data.</p>"}</section><section class="briefing"><div class="section-head"><p class="eyebrow">PARTNERS TO WATCH</p><a class="text-link" href="#alliance">Alliance desk ↗</a></div>${candidates.map((p) => `<a class="watch-row" href="#alliance/partners/${p.team}"><span><b>${p.team}</b> ${esc(name(p.team))}</span><span>${fmt(p.score, 0)} <small>pair pts</small> ↗</span></a>`).join("")}</section></div><section class="section"><div class="section-head"><h2>The field, by the numbers.</h2><p>Scouted contribution · shared outcomes reconciled separately</p></div><div id="analytics-filters"></div><div id="analytics-table"></div><p class="hint">HIVE = TIPs per match. FLOWER / GARDEN = attributed retained elements. OPR uses alliance non-foul results with ridge regularization. SD is population standard deviation.</p></section>`;
    let q = "",
      auto = "all",
      tele = "all",
      min = "",
      max = "",
      sort = "average",
      direction = -1;
    const draw = () => {
      const filters = content.querySelector<HTMLElement>("#analytics-filters")!;
      filters.innerHTML = `<div class="filter-row">${field("Team number or name", "team-query", q, "search")}${select(
        "AUTO performance",
        "auto-filter",
        auto,
        [
          ["all", "All AUTO"],
          ["high", `High (≥${GAME.points.tip * 2})`],
          ["medium", `Medium (${GAME.points.tip}–${GAME.points.tip * 2})`],
          ["low", `Low (<${GAME.points.tip})`],
        ],
      )}${select("TeleOp performance", "tele-filter", tele, [
        ["all", "All TeleOp"],
        ["high", `High (≥${GAME.points.tip * 4})`],
        ["medium", `Medium (${GAME.points.tip * 2}–${GAME.points.tip * 4})`],
        ["low", `Low (<${GAME.points.tip * 2})`],
      ])}${field("Min points", "min-score", min, "number", 'min="0"')}${field("Max points", "max-score", max, "number", 'min="0"')}<button id="clear-filters">Clear</button></div>`;
      const tier = (v: number, choice: string, base: number) =>
        choice === "all" ||
        (choice === "high" && v >= base * 2) ||
        (choice === "medium" && v >= base && v < base * 2) ||
        (choice === "low" && v < base);
      const rows = teams
        .map((t) => {
          const s = teamStats(database, t.number, event.id);
          return {
            team: t.number,
            name: t.name,
            n: s.obs.length,
            average: s.total.average,
            auto: s.auto.average,
            tele: s.tele.average,
            sd: s.total.sd,
            best: s.total.best,
            tips: s.tips.average,
            flower: s.categories.flower.average / GAME.points.flower,
            garden: s.categories.garden.average,
            compat: mean(s.obs.map((o) => o.compatibility)),
            sort: mean(s.obs.map((o) => +o.canSort)),
            maxLaunch: Math.max(
              0,
              ...s.obs.map(
                (o) =>
                  o.auto.pollen + o.auto.nectar + o.tele.pollen + o.tele.nectar,
              ),
            ),
            opr: opr.values[t.number] ?? 0,
            pit: pits.some((p) => p.team === t.number),
          };
        })
        .filter(
          (t) =>
            `${t.team} ${t.name}`.toLowerCase().includes(q.toLowerCase()) &&
            tier(t.auto, auto, GAME.points.tip) &&
            tier(t.tele, tele, GAME.points.tip * 2) &&
            (min === "" || t.average >= Number(min)) &&
            (max === "" || t.average <= Number(max)),
        )
        .sort((a, b) => {
          const av = a[sort as keyof typeof a],
            bv = b[sort as keyof typeof b];
          return (
            direction *
            (typeof av === "string"
              ? av.localeCompare(String(bv))
              : Number(av) - Number(bv))
          );
        });
      const columns = [
        ["team", "Team"],
        ["n", "Matches"],
        ["average", "Avg pts"],
        ["auto", "AUTO"],
        ["tele", "TeleOp"],
        ["tips", "HIVE"],
        ["flower", "FLOWER"],
        ["garden", "GARDEN"],
        ["opr", "OPR"],
        ["sd", "SD"],
        ["compat", "Fit / 5"],
        ["sort", "Sort %"],
        ["maxLaunch", "Max launch"],
      ];
      content.querySelector("#analytics-table")!.innerHTML =
        `<div class="table-meta"><span>${rows.length} teams</span><span>OUR TEAM <span class="inline-rule"></span> ${settings.team}</span></div><div class="table-wrap" role="region" aria-label="Sortable team analytics" tabindex="0"><table class="data-table"><thead><tr>${columns.map(([key, label]) => `<th scope="col" aria-sort="${sort === key ? (direction < 0 ? "descending" : "ascending") : "none"}"><button data-sort="${key}">${label}${sort === key ? (direction < 0 ? " ↓" : " ↑") : ""}</button></th>`).join("")}<th>Pit</th></tr></thead><tbody>${rows.map((t) => `<tr${t.team === settings.team ? ' class="our-team"' : ""}><td><a class="team-link" href="#team/${t.team}"><strong>${t.team}${t.team === settings.team ? '<span class="our-marker"> OURS</span>' : ""}</strong><small>${esc(t.name)}</small></a></td>${[t.n, t.n ? fmt(t.average) : "—", t.n ? fmt(t.auto) : "—", t.n ? fmt(t.tele) : "—", t.n ? fmt(t.tips) : "—", t.n ? fmt(t.flower) : "—", t.n ? fmt(t.garden) : "—", fmt(t.opr), t.n ? fmt(t.sd) : "—", t.n ? fmt(t.compat) : "—", t.n ? pct(t.sort) : "—", t.n ? t.maxLaunch : "—"].map((v) => `<td>${v}</td>`).join("")}<td><a href="#pit/${t.team}" class="pit-status">${t.pit ? "Filed" : "Needed"} ↗</a></td></tr>`).join("")}</tbody></table></div>`;
      content.querySelectorAll<HTMLButtonElement>("[data-sort]").forEach(
        (b) =>
          (b.onclick = () => {
            if (sort === b.dataset.sort) direction *= -1;
            else {
              sort = b.dataset.sort!;
              direction = -1;
            }
            draw();
          }),
      );
      for (const [name, set] of [
        ["team-query", (v: string) => (q = v)],
        ["auto-filter", (v: string) => (auto = v)],
        ["tele-filter", (v: string) => (tele = v)],
        ["min-score", (v: string) => (min = v)],
        ["max-score", (v: string) => (max = v)],
      ] as const) {
        const input = filters.querySelector<
          HTMLInputElement | HTMLSelectElement
        >(`[name="${name}"]`)!;
        input.oninput = () => {
          const pos =
            input instanceof HTMLInputElement && input.type === "search"
              ? input.selectionStart
              : null;
          set(input.value);
          draw();
          const replacement = filters.querySelector<HTMLInputElement>(
            `[name="${name}"]`,
          )!;
          replacement.focus();
          if (pos !== null) replacement.setSelectionRange(pos, pos);
        };
      }
      filters.querySelector<HTMLButtonElement>("#clear-filters")!.onclick =
        () => {
          q = "";
          auto = "all";
          tele = "all";
          min = "";
          max = "";
          draw();
        };
    };
    draw();
  } else if (tab === "standings") {
    const i = our ? ranking.findIndex((r) => r.team === our.team) : -1,
      up = ranking[i - 1],
      down = ranking[i + 1];
    content.innerHTML = `<div class="standings-context"><p>Qualification sort: average RP → average non-foul alliance points → average TIPs → average AUTO points → random order.</p><p>${our?.played ? `Gap above: ${up ? fmt(up.rankingScore - our.rankingScore, 2) + " RP" : "at the top"} · gap below: ${down ? fmt(our.rankingScore - down.rankingScore, 2) + " RP" : "last ranked team"}` : "No completed matches for our team."}</p></div>${table(
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
          return `<tr><td>Q${o.match}</td><td><a href="#team/${o.team}">${o.team}</a></td><td>${fmt(s.total, 0)}</td><td>${esc(o.alliance)}</td><td>${s.auto} / ${s.tele}</td><td>${s.tips}</td><td>${s.penalties}</td><td class="note-cell">${esc(o.note || "No notes.")}</td><td><a href="#scout/${esc(o.id)}">Edit ↗</a></td></tr>`;
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
