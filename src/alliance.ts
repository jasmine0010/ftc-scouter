import {
  allianceProjection,
  compatibility,
  headToHead,
  routeConflicts,
  strength,
} from "./analytics.js";
import { active, now, type Event, type Pick } from "./types.js";
import { database, settings, saveEntity } from "./storage.js";
import {
  empty,
  esc,
  exportRoutePNG,
  fieldSVG,
  fmt,
  pct,
  section,
  select,
  table,
  toast,
} from "./ui.js";
export function renderAlliance(
  root: HTMLElement,
  event: Event,
  tab = "partners",
  candidate?: number,
) {
  if (event.teams.length < 2 || !event.teams.includes(settings.team)) {
    root.innerHTML = `<div class="page-heading"><div><p class="eyebrow">ALLIANCE DESK</p><h1>Alliance</h1></div></div>${empty("Roster required", "Import the event roster and make sure our selected team number is included.")}<a class="button primary" href="#events">Event data →</a>`;
    return;
  }
  const scheduled =
    tab === "head"
      ? active(database.matches).find(
          (m) => m.eventId === event.id && m.number === candidate,
        )
      : undefined;
  let partner =
    tab !== "head" && candidate && candidate !== settings.team
      ? candidate
      : (event.teams.find((t) => t !== settings.team) ?? settings.team);
  const name = (t: number) =>
    active(database.teams).find((x) => x.number === t)?.name ?? `Team ${t}`;
  const options = event.teams.map(
    (t) => [String(t), `${t} · ${name(t)}`] as [string, string],
  );
  const render = () => {
    const candidates = event.teams
        .filter((t) => t !== settings.team)
        .map((team) => ({
          team,
          ...compatibility(database, settings.team, team, event),
        }))
        .sort((a, b) => b.index - a.index),
      projection = compatibility(database, settings.team, partner, event),
      pits = active(database.pits).filter((p) => p.eventId === event.id),
      a = pits.find((p) => p.team === settings.team),
      b = pits.find((p) => p.team === partner);
    root.innerHTML = `<div class="page-heading"><div><p class="eyebrow">ALLIANCE DESK / OUR TEAM ${settings.team}</p><h1>Alliance</h1><p class="lede">Projected output, role coverage and the space you share.</p></div></div><nav class="tabs" aria-label="Alliance tools">${[
      ["partners", "Partners"],
      ["overlay", "Route overlay"],
      ["head", "Head to head"],
      ["picks", "Pick list"],
    ]
      .map(
        ([key, label]) =>
          `<a href="#alliance/${key}"${tab === key ? ' aria-current="page"' : ""}>${label}</a>`,
      )
      .join("")}</nav>${
      tab === "partners"
        ? `${section(
            "Candidate partner",
            `<div class="partner-selector">${select(
              "Pair with",
              "partner",
              partner,
              options.filter((o) => Number(o[0]) !== settings.team),
            )}<a class="text-link" href="#team/${partner}">Open team profile →</a></div><div class="projection"><span class="projection-score">${fmt(projection.score, 0)}<small>projected alliance points</small></span><span class="projection-range">${fmt(projection.low, 0)}–${fmt(projection.high, 0)}<small>80% simulated interval</small></span><div class="rp-grid">${["SWARM", "POLLINATOR 1", "POLLINATOR 2"].map((rp, i) => `<div><span>${rp}</span><b>${pct(projection.rp[i])}</b><div class="bar"><span style="width:${projection.rp[i] * 100}%"></span></div></div>`).join("")}</div></div><ul class="reason-list">${projection.reasons.map((x) => `<li>${esc(x)}</li>`).join("")}</ul><p class="hint">600 seeded samples. Pit prior weight = 3 / (3 + scouted matches); match evidence takes over as samples accumulate. Alliance output caps retained elements against a shared field pool. These are planning estimates.</p>`,
          )}${section(
            "Partner ranking",
            table(
              [
                "Pick",
                "Team",
                "Name",
                "Projection",
                "SWARM",
                "POLLINATOR 2",
                "Evidence",
                "Role fit",
              ],
              candidates.map((p, i) => [
                String(i + 1),
                `<a href="#team/${p.team}">${p.team}</a>`,
                esc(name(p.team)),
                fmt(p.score, 0),
                pct(p.rp[0]),
                pct(p.rp[2]),
                `${p.strengths[1].sample} matches`,
                esc(p.reasons[0]),
              ]),
              "Compatibility ranking",
            ),
            "Sorted by projected score plus role complementarity, with a route-conflict deduction.",
          )}`
        : tab === "overlay"
          ? section(
              "Autonomous route overlay",
              `<div class="partner-selector">${select(
                "Candidate partner",
                "partner",
                partner,
                options.filter((o) => Number(o[0]) !== settings.team),
              )}</div>${
                a?.routes.length && b?.routes.length
                  ? `<div class="form-grid">${select(
                      "Our route",
                      "our-route",
                      a.routes[0].id,
                      a.routes.map((r) => [r.id, r.label]),
                    )}${select(
                      "Partner route",
                      "partner-route",
                      b.routes[0].id,
                      b.routes.map((r) => [r.id, r.label]),
                    )}</div><div class="overlay-layout"><div id="overlay-map"></div><div><div class="legend"><span class="solid-swatch"></span>${settings.team} · our route</div><div class="legend"><span class="dash-swatch"></span>${partner} · partner route</div><div id="conflict-report"></div><button id="overlay-export">Export overlay PNG</button><p class="hint">Geometric overlap is a review flag, not a timed collision prediction. Routes use nominal inch coordinates. Agree on starting positions, delays and right of way.</p></div></div>`
                  : empty(
                      "Routes needed",
                      "Record at least one autonomous route for each team in Pit scouting.",
                    )
              }<div class="button-row"><a class="button" href="#teams/pit/${settings.team}">Our pit record →</a><a class="button" href="#teams/pit/${partner}">Partner pit record →</a></div>`,
            )
          : tab === "head"
            ? section(
                "Project a specific match",
                `<form id="head-form"><div class="versus-grid"><fieldset><legend>Red alliance</legend>${select("Red 1", "red1", String(scheduled?.red[0] ?? settings.team), options)}${select("Red 2", "red2", String(scheduled?.red[1] ?? partner), options)}</fieldset><span class="versus">vs</span><fieldset><legend>Blue alliance</legend>${select("Blue 1", "blue1", String(scheduled?.blue[0] ?? event.teams.find((t) => ![settings.team, partner].includes(t)) ?? 0), options)}${select("Blue 2", "blue2", String(scheduled?.blue[1] ?? event.teams.filter((t) => ![settings.team, partner].includes(t))[1] ?? 0), options)}</fieldset></div><button type="submit" class="primary">Run projection</button></form><div id="head-result"></div>`,
              )
            : `<div id="picks-content"></div>`
    }`;
    const input = root.querySelector<HTMLSelectElement>('[name="partner"]');
    if (input)
      input.onchange = () => {
        partner = Number(input.value);
        render();
      };
    if (tab === "overlay" && a?.routes.length && b?.routes.length) {
      const draw = () => {
        const ra = a.routes.find(
            (r) =>
              r.id ===
              root.querySelector<HTMLSelectElement>('[name="our-route"]')!
                .value,
          )!,
          rb = b.routes.find(
            (r) =>
              r.id ===
              root.querySelector<HTMLSelectElement>('[name="partner-route"]')!
                .value,
          )!,
          hits = routeConflicts(ra, rb);
        root.querySelector("#overlay-map")!.innerHTML = fieldSVG([
          { route: ra },
          { route: rb, partner: true },
        ]);
        root.querySelector("#route-conflicts")!.innerHTML = hits
          .map(
            (p) =>
              `<circle cx="${p.x}" cy="${p.y}" r="4" fill="none" stroke="#beb9b6" stroke-width=".8"/>`,
          )
          .join("");
        root.querySelector("#conflict-report")!.innerHTML =
          `<h3>${hits.length ? `${hits.length} shared path regions` : "No path intersections found"}</h3><p>${hits.length ? "Review these crossing points with the partner drive team." : "Still check robot width, timing and shared launch positions."}</p>`;
      };
      root
        .querySelectorAll<HTMLSelectElement>('[name$="-route"]')
        .forEach((s) => (s.onchange = draw));
      draw();
      root.querySelector<HTMLButtonElement>("#overlay-export")!.onclick = () =>
        void exportRoutePNG(
          root.querySelector("#overlay-map svg")!,
          `alliance-${settings.team}-${partner}.png`,
        );
    }
    if (tab === "head") {
      const f = root.querySelector<HTMLFormElement>("#head-form")!;
      const compute = () => {
        const values = new FormData(f),
          teams = ["red1", "red2", "blue1", "blue2"].map((k) =>
            Number(values.get(k)),
          );
        if (new Set(teams).size !== 4) {
          root.querySelector("#head-result")!.innerHTML =
            '<p class="errors">Select four different teams.</p>';
          return;
        }
        const p = headToHead(
          database,
          teams.slice(0, 2),
          teams.slice(2),
          event,
        );
        root.querySelector("#head-result")!.innerHTML =
          `<div class="stat-row"><div><span>Red projected</span><strong>${fmt(p.red.score, 0)}</strong></div><div><span>Blue projected</span><strong>${fmt(p.blue.score, 0)}</strong></div><div><span>Red win probability</span><strong>${pct(p.win)}</strong></div><div><span>Tie probability</span><strong>${pct(p.tie)}</strong></div></div><p class="hint">1,000 seeded simulations include scoring variation, shared element limits and expected opponent foul credits. Defense, FLOWER ownership changes and cycle timing remain uncertain.</p>`;
      };
      f.onsubmit = (e) => {
        e.preventDefault();
        compute();
      };
      compute();
    }
    if (tab === "picks")
      renderPicks(
        root.querySelector("#picks-content")!,
        event,
        candidates.map((c) => ({
          team: c.team,
          score: c.score,
          index: c.index,
        })),
        name,
      );
  };
  render();
}
function renderPicks(
  root: HTMLElement,
  event: Event,
  candidates: { team: number; score: number; index: number }[],
  name: (t: number) => string,
) {
  let onlyAvailable = false,
    dragged: number | null = null;
  const allPicks = () =>
    event.teams
      .filter((t) => t !== settings.team)
      .map(
        (team, i) =>
          active(database.picks).find(
            (p) => p.eventId === event.id && p.team === team,
          ) ??
          ({
            id: `${event.id}:${team}`,
            updatedAt: now(),
            eventId: event.id,
            team,
            tier: "B",
            order: i,
            available: true,
            note: "",
          } as Pick),
      )
      .sort((a, b) => a.order - b.order);
  const saveOrder = async (picks: Pick[]) => {
    for (const [i, p] of picks.entries())
      await saveEntity("picks", { ...p, order: i });
  };
  const render = () => {
    const picks = allPicks(),
      available = picks.filter((p) => p.available),
      recommend = candidates.find((c) =>
        available.some((p) => p.team === c.team),
      );
    root.innerHTML = `<div class="pick-recommendation"><span class="eyebrow">RECOMMENDED AVAILABLE PICK</span>${recommend ? `<strong>${recommend.team} <span>${esc(name(recommend.team))}</span></strong><p>Projected pair ${fmt(recommend.score, 0)} points. Highest available score after role and route adjustment.</p>` : "<p>No candidates remain available.</p>"}</div><div class="toolbar"><label class="check-label"><input id="available-only" type="checkbox"${onlyAvailable ? " checked" : ""}> Only available teams</label><p class="hint">Drag rows to order. ↑ / ↓ controls provide keyboard access.</p></div><div class="table-wrap"><table><thead><tr><th>Order</th><th>Team</th><th>Tier</th><th>Available</th><th>Pick note</th><th>Reorder</th></tr></thead><tbody>${picks
      .filter((p) => !onlyAvailable || p.available)
      .map(
        (p) =>
          `<tr draggable="true" data-pick="${p.team}" class="pick-row${p.available ? "" : " taken"}"><td>${p.order + 1}</td><td><a href="#team/${p.team}"><b>${p.team}</b><small>${esc(name(p.team))}</small></a></td><td><select data-tier="${p.team}" aria-label="Tier for ${p.team}">${["A", "B", "C", "Pass"].map((t) => `<option${p.tier === t ? " selected" : ""}>${t}</option>`).join("")}</select></td><td><label class="check-label"><input type="checkbox" data-available="${p.team}"${p.available ? " checked" : ""}> ${p.available ? "Available" : "Taken"}</label></td><td><input data-note="${p.team}" aria-label="Pick note for ${p.team}" value="${esc(p.note)}" maxlength="300"></td><td><div class="button-row"><button data-move="${p.team}:-1" aria-label="Move ${p.team} up">↑</button><button data-move="${p.team}:1" aria-label="Move ${p.team} down">↓</button></div></td></tr>`,
      )
      .join("")}</tbody></table></div>`;
    root.querySelector<HTMLInputElement>("#available-only")!.onchange = (e) => {
      onlyAvailable = (e.target as HTMLInputElement).checked;
      render();
    };
    root.querySelectorAll<HTMLSelectElement>("[data-tier]").forEach(
      (el) =>
        (el.onchange = async () => {
          const p = picks.find((p) => p.team === Number(el.dataset.tier))!;
          await saveEntity("picks", { ...p, tier: el.value });
        }),
    );
    root.querySelectorAll<HTMLInputElement>("[data-available]").forEach(
      (el) =>
        (el.onchange = async () => {
          const p = picks.find((p) => p.team === Number(el.dataset.available))!;
          await saveEntity("picks", { ...p, available: el.checked });
          render();
        }),
    );
    root.querySelectorAll<HTMLInputElement>("[data-note]").forEach(
      (el) =>
        (el.onchange = async () => {
          const p = picks.find((p) => p.team === Number(el.dataset.note))!;
          await saveEntity("picks", { ...p, note: el.value });
        }),
    );
    const move = async (team: number, target: number) => {
      const from = picks.findIndex((p) => p.team === team);
      if (target < 0 || target >= picks.length) return;
      const [p] = picks.splice(from, 1);
      picks.splice(target, 0, p);
      await saveOrder(picks);
      render();
    };
    root.querySelectorAll<HTMLButtonElement>("[data-move]").forEach(
      (b) =>
        (b.onclick = () => {
          const [team, direction] = b.dataset.move!.split(":").map(Number);
          void move(team, picks.findIndex((p) => p.team === team) + direction);
        }),
    );
    root.querySelectorAll<HTMLTableRowElement>("[data-pick]").forEach((row) => {
      row.ondragstart = (e) => {
        dragged = Number(row.dataset.pick);
        e.dataTransfer?.setData("text/plain", String(dragged));
      };
      row.ondragover = (e) => e.preventDefault();
      row.ondrop = (e) => {
        e.preventDefault();
        if (dragged !== null)
          void move(
            dragged,
            picks.findIndex((p) => p.team === Number(row.dataset.pick)),
          );
      };
    });
  };
  render();
}
