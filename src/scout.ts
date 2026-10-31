import { GAME, sumElements } from "./game.js";
import {
  scoreAlliance,
  scoreObservation,
  validateBoard,
  validateObservation,
} from "./scoring.js";
import {
  active,
  blankBoard,
  blankObservation,
  now,
  type Board,
  type Observation,
} from "./types.js";
import {
  database,
  settings,
  saveEntity,
  saveDraft,
  readDraft,
  clearDraft,
} from "./storage.js";
import {
  bindSteppers,
  counter,
  esc,
  field,
  formValues,
  fmt,
  section,
  select,
  textArea,
  toast,
  toggle,
} from "./ui.js";
export async function renderScout(root: HTMLElement, editId?: string) {
  const eventId = settings.eventId;
  let o = structuredClone(
    active(database.observations).find((x) => x.id === editId) ??
      (!editId
        ? await readDraft<Observation>(`match:${eventId}`)
        : undefined) ??
      blankObservation(
        eventId,
        settings.team,
        active(database.matches)
          .filter(
            (m) =>
              m.eventId === eventId &&
              !m.played &&
              [...m.red, ...m.blue].includes(settings.team),
          )
          .sort((a, b) => a.number - b.number)[0]?.number ?? 1,
      ),
  );
  let period = "auto";
  const capture = () => {
    const f = root.querySelector<HTMLFormElement>("#scout-form");
    if (!f) return;
    const values = formValues(f);
    for (const [k, v] of Object.entries(values)) {
      if (k.startsWith("auto.") || k.startsWith("tele.")) {
        const [p, key] = k.split(".");
        (o[p as "auto" | "tele"] as unknown as Record<string, unknown>)[key] =
          v;
      } else (o as unknown as Record<string, unknown>)[k] = v;
    }
    o.offense = Number(o.offense);
    o.compatibility = Number(o.compatibility);
    void saveDraft(`match:${eventId}`, o);
    updateScore();
  };
  const updateScore = () => {
    const s = scoreObservation(o),
      el = root.querySelector("#live-score");
    if (el)
      el.innerHTML = `<span>Earned contribution <strong>${fmt(s.total, 0)}</strong></span><span>AUTO ${fmt(s.auto, 0)}</span><span>TELEOP ${fmt(s.tele, 0)}</span><span>Fouls conceded ${s.penalties}</span><span>Net impact ${fmt(s.net, 0)}</span><span class="save-state">Draft saved locally</span>`;
  };
  function render() {
    root.innerHTML = `<div class="page-heading"><div><p class="eyebrow">MATCH SCOUTING / ${esc(eventId.startsWith("demo-") ? "DEMO EVENT" : "EVENT DATA")}</p><h1>Match scouting.</h1><p class="lede">Actions belong to a robot. Final field state belongs to the match.</p></div></div><div class="live-score" id="live-score" aria-live="polite"></div><form id="scout-form"><div class="errors" id="scout-error" role="alert"></div><div class="form-grid identity-grid">${field("Match number", "match", o.match, "number", 'min="1" required inputmode="numeric"')}${field("Team number", "team", o.team, "number", 'min="1" max="999999" required inputmode="numeric" list="team-options"')}${select(
      "Alliance",
      "alliance",
      o.alliance,
      [
        ["red", "Red"],
        ["blue", "Blue"],
      ],
    )}${field("Scout", "scout", o.scout)}</div><datalist id="team-options">${active(
      database.teams,
    )
      .map((t) => `<option value="${t.number}">${esc(t.name)}</option>`)
      .join(
        "",
      )}</datalist><div class="tabs phase-tabs" role="group" aria-label="Scouting period"><button type="button" data-period="auto" aria-pressed="${period === "auto"}">AUTO · ${GAME.limits.autoSeconds}s</button><button type="button" data-period="tele" aria-pressed="${period === "tele"}">TELEOP · ${GAME.limits.teleSeconds}s</button><button type="button" data-period="review" aria-pressed="${period === "review"}">Review & save</button></div>${(["auto", "tele"] as const).map((p) => `<div ${period !== p ? "hidden" : ""}>${section(p === "auto" ? "Autonomous" : "TeleOp", `<div class="scout-grid">${p === "auto" ? toggle("LEAVE", "auto.leave", o.auto.leave) : ""}${toggle("PARK", `${p}.park`, o[p].park)}${counter("HIVE TIPs credited", `${p}.tips`, o[p].tips)}${counter("POLLEN launched", `${p}.pollen`, o[p].pollen)}${counter("Own NECTAR launched", `${p}.nectar`, o[p].nectar)}${counter(p === "auto" ? "Elements left in CELL (diagnostic)" : "CELL elements retained · attributed", `${p}.cell`, o[p].cell, GAME.inventory.pollen + GAME.inventory.redNectar + GAME.inventory.blueNectar)}${counter("FLOWER elements placed", `${p}.flowerPlaced`, o[p].flowerPlaced ?? 0)}${counter("GARDEN elements delivered", `${p}.gardenDelivered`, o[p].gardenDelivered ?? 0)}${p === "tele" ? counter("Owned FLOWER elements · attributed", "tele.flower", o.tele.flower, GAME.inventory.pollen + GAME.inventory.redNectar + GAME.inventory.blueNectar) + counter("Final GARDEN elements · attributed", "tele.garden", o.tele.garden, GAME.inventory.pollen + GAME.inventory.redNectar + GAME.inventory.blueNectar) : ""}</div><p class="hint">Credit each cooperative TIP once. Cumulative launch counts can exceed field inventory through recycling.${p === "auto" ? " AUTO CELL, FLOWER and GARDEN counts are diagnostic and do not earn these end-state points." : " Cumulative placements and deliveries do not directly earn points. Enter attributed final retained elements separately and reconcile them against the shared field outcome."}</p>`)}</div>`).join("")}<div ${period !== "review" ? "hidden" : ""}>${section("Last minute & fouls", `<div class="scout-grid">${counter("Bottom NECTAR bonuses · attributed", "bottom", o.bottom, GAME.limits.flowers)}${counter("Minor fouls", "minor", o.minor)}${counter("Other major fouls", "major", o.major)}${counter("Early NECTAR in FLOWERs", "earlyNectar", o.earlyNectar)}${toggle("Breakdown / disabled", "breakdown", o.breakdown)}${counter("Downtime (seconds)", "downtime", o.downtime, GAME.limits.autoSeconds + GAME.limits.teleSeconds)}</div><p class="hint">Early NECTAR incurs ${GAME.points.major} points per element for the opponent. Do not count that same violation again under other major fouls.</p>`)}${section("Robot capabilities & compatibility", `<div class="form-grid">${select("Launch position", "launchPosition", o.launchPosition, ["Near", "Center", "Far", "Perimeter", "Flexible"])}${select("Offense against defense (1–5)", "offense", o.offense, ["1", "2", "3", "4", "5"])}${toggle("Plays defense", "defense", o.defense)}${toggle("Fixed shooting position", "fixedPosition", o.fixedPosition)}${toggle("Can select own NECTAR / sort", "canSort", o.canSort)}${select("Compatibility with us (1–5)", "compatibility", o.compatibility, ["1", "2", "3", "4", "5"])}${textArea("Loading-zone execution", "loadingNotes", o.loadingNotes)}${textArea("Match note", "note", o.note)}</div>`)}</div><div class="form-footer"><button type="button" id="scout-prev"${period === "auto" ? " disabled" : ""}>← Previous</button><span>${esc(active(database.teams).find((t) => t.number === o.team)?.name ?? `Team ${o.team}`)}</span>${period === "review" ? '<button type="submit" class="primary">Save match observation</button>' : '<button type="button" id="scout-next" class="primary">Next →</button>'}</div></form><section class="section"><details id="board-details"><summary>Shared field outcome · match ${o.match}</summary><p class="hint">One canonical snapshot for all four scouts. These counts determine alliance points; per-robot placement estimates are not added again.</p><div id="board-editor"></div></details></section>`;
    const f = root.querySelector<HTMLFormElement>("#scout-form")!;
    bindSteppers(f);
    f.oninput = capture;
    updateScore();
    root.querySelectorAll<HTMLButtonElement>("[data-period]").forEach(
      (b) =>
        (b.onclick = () => {
          capture();
          period = b.dataset.period!;
          render();
        }),
    );
    root.querySelector<HTMLButtonElement>("#scout-prev")!.onclick = () => {
      capture();
      period = period === "review" ? "tele" : "auto";
      render();
    };
    const next = root.querySelector<HTMLButtonElement>("#scout-next");
    if (next)
      next.onclick = () => {
        capture();
        period = period === "auto" ? "tele" : "review";
        render();
      };
    for (const name of ["team", "match"])
      f.querySelector<HTMLInputElement>(`[name="${name}"]`)!.onchange = () => {
        capture();
        const existing = active(database.observations).find(
          (x) =>
            x.team === o.team && x.match === o.match && x.eventId === eventId,
        );
        if (existing && existing.id !== o.id) {
          o = structuredClone(existing);
          toast("Existing observation opened for editing.");
        } else {
          const match = active(database.matches).find(
            (m) => m.eventId === eventId && m.number === o.match,
          );
          if (match?.red.includes(o.team)) o.alliance = "red";
          if (match?.blue.includes(o.team)) o.alliance = "blue";
        }
        render();
      };
    f.onsubmit = async (e) => {
      e.preventDefault();
      capture();
      if (!f.reportValidity()) return;
      const errors = validateObservation(o, database);
      if (errors.length) {
        root.querySelector("#scout-error")!.innerHTML = errors
          .map(esc)
          .join("<br>");
        return;
      }
      for (const key of ["offense", "compatibility"] as const)
        o[key] = Number(o[key]);
      const known = active(database.teams).some((t) => t.number === o.team);
      if (!known)
        await saveEntity("teams", {
          id: String(o.team),
          number: o.team,
          name: `Team ${o.team}`,
          updatedAt: now(),
        });
      const event = active(database.events).find((e) => e.id === eventId)!;
      if (!event.teams.includes(o.team))
        await saveEntity("events", {
          ...event,
          teams: [...event.teams, o.team],
        });
      await saveEntity("observations", o);
      await clearDraft(`match:${eventId}`);
      toast(`Saved ${o.team} / qualification ${o.match}.`);
      location.hash = `team/${o.team}`;
    };
    root.querySelector<HTMLDetailsElement>("#board-details")!.ontoggle = (
      e,
    ) => {
      if ((e.target as HTMLDetailsElement).open)
        void renderBoard(
          root.querySelector("#board-editor")!,
          eventId,
          o.match,
        );
    };
  }
  render();
}
export async function renderBoard(
  root: HTMLElement,
  eventId: string,
  match: number,
) {
  let b = structuredClone(
    (await readDraft<Board>(`board:${eventId}:${match}`)) ??
      active(database.boards).find(
        (b) => b.eventId === eventId && b.match === match,
      ) ??
      blankBoard(eventId, match),
  );
  const elements = (
    prefix: string,
    e: { pollen: number; redNectar: number; blueNectar: number },
  ) =>
    counter("POLLEN", `${prefix}.pollen`, e.pollen, GAME.inventory.pollen) +
    counter(
      "Red NECTAR",
      `${prefix}.redNectar`,
      e.redNectar,
      GAME.inventory.redNectar,
    ) +
    counter(
      "Blue NECTAR",
      `${prefix}.blueNectar`,
      e.blueNectar,
      GAME.inventory.blueNectar,
    );
  root.innerHTML = `<form id="board-form"><div id="board-error" class="errors" role="alert"></div>${b.flowers
    .map(
      (f, i) =>
        `<fieldset><legend>FLOWER ${i + 1}</legend><div class="form-grid">${select(
          "Owner · top qualifying NECTAR",
          `f${i}.owner`,
          f.owner,
          [
            ["none", "None"],
            ["red", "Red"],
            ["blue", "Blue"],
          ],
        )}${elements(`f${i}`, f)}${toggle("Red bottom NECTAR bonus", `f${i}.bottomRed`, f.bottomRed)}${toggle("Blue bottom NECTAR bonus", `f${i}.bottomBlue`, f.bottomBlue)}</div></fieldset>`,
    )
    .join(
      "",
    )}${(["redCell", "blueCell", "redGarden", "blueGarden"] as const).map((k) => `<fieldset><legend>${esc(k.replace(/([A-Z])/g, " $1").toUpperCase())}</legend><div class="form-grid">${elements(k, b[k])}</div></fieldset>`).join("")}<p class="hint">Enter final locations once per match. Unscored elements can remain on the floor. Both bottom-NECTAR bonuses may be earned in the same FLOWER.</p><div class="button-row"><button type="submit" class="primary">Confirm shared outcome</button><span id="board-preview"></span></div></form>`;
  const f = root.querySelector<HTMLFormElement>("form")!;
  bindSteppers(f);
  const capture = () => {
    const values = formValues(f);
    for (const [key, value] of Object.entries(values)) {
      const [group, prop] = key.split(".");
      const obj = group.startsWith("f")
        ? b.flowers[Number(group.slice(1))]
        : b[group as "redCell" | "blueCell" | "redGarden" | "blueGarden"];
      (obj as unknown as Record<string, unknown>)[prop] = value;
    }
    b.updatedAt = now();
    void saveDraft(`board:${eventId}:${match}`, b);
    const obs = active(database.observations).filter(
      (o) => o.eventId === eventId && o.match === match,
    );
    root.querySelector("#board-preview")!.textContent =
      `Scouted alliance total: R ${scoreAlliance(obs, b, "red").score} · B ${scoreAlliance(obs, b, "blue").score} (${obs.length}/4 robots)`;
  };
  f.oninput = capture;
  capture();
  f.onsubmit = async (e) => {
    e.preventDefault();
    capture();
    const errors = validateBoard(b);
    if (!f.reportValidity() || errors.length) {
      root.querySelector("#board-error")!.innerHTML = errors
        .map(esc)
        .join("<br>");
      return;
    }
    b.confirmed = true;
    await saveEntity("boards", b);
    await clearDraft(`board:${eventId}:${match}`);
    toast("Shared outcome saved. Official imported results retain precedence.");
  };
}
