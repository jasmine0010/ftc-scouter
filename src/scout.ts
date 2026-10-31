import { GAME } from "./game.js";
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
  select,
  toast,
  toggle,
} from "./ui.js";

type ScoutPhase = "auto" | "teleop" | "end";
export async function renderScout(
  root: HTMLElement,
  editId?: string,
  selectedMatch?: number,
  selectedTeam?: number,
) {
  const eventId = settings.eventId;
  const next = active(database.matches)
    .filter(
      (match) =>
        match.eventId === eventId &&
        !match.played &&
        [...match.red, ...match.blue].includes(settings.team),
    )
    .sort((a, b) => a.number - b.number)[0];
  const matchNumber = selectedMatch ?? next?.number ?? 1;
  const teamNumber = selectedTeam ?? settings.team;
  const draft = await readDraft<Observation>(`match:${eventId}`);
  const existing = active(database.observations).find((o) =>
    editId
      ? o.id === editId
      : selectedMatch !== undefined &&
        o.eventId === eventId &&
        o.match === matchNumber &&
        o.team === teamNumber,
  );
  let observation = structuredClone(
    existing ??
      (!editId &&
      draft &&
      (selectedMatch === undefined ||
        (draft.match === matchNumber && draft.team === teamNumber))
        ? draft
        : undefined) ??
      blankObservation(eventId, teamNumber, matchNumber),
  );
  let phase: ScoutPhase = "auto";
  let editing = false;
  observation.scout = settings.scoutName ?? observation.scout;
  const alignAlliance = () => {
    const match = active(database.matches).find(
      (m) => m.eventId === eventId && m.number === observation.match,
    );
    if (match?.red.includes(observation.team)) observation.alliance = "red";
    else if (match?.blue.includes(observation.team))
      observation.alliance = "blue";
  };
  alignAlliance();
  const updateTotal = () => {
    const total = document.querySelector<HTMLOutputElement>("#scout-total");
    if (total) {
      total.hidden = false;
      total.value = fmt(scoreObservation(observation).total, 0);
    }
  };
  const capture = () => {
    const form = root.querySelector<HTMLFormElement>("#scout-form");
    if (!form) return;
    for (const [key, value] of Object.entries(formValues(form))) {
      const [group, property] = key.split(".");
      if (group === "auto" || group === "tele")
        (observation[group] as unknown as Record<string, unknown>)[property] =
          value;
      else if (key === "team" || key === "match")
        observation[key] = Number(value);
      else if (key === "alliance")
        observation.alliance = value as Observation["alliance"];
      else if (key === "bottom") observation.bottom = Number(value);
    }
    observation.scout = settings.scoutName ?? observation.scout;
    void saveDraft(`match:${eventId}`, observation);
    updateTotal();
  };
  const render = () => {
    const color = observation.alliance === "red" ? "Red" : "Blue";
    const controls =
      phase === "auto"
        ? toggle("Leave", "auto.leave", observation.auto.leave) +
          toggle("Park", "auto.park", observation.auto.park) +
          counter("Hive tips", "auto.tips", observation.auto.tips)
        : phase === "teleop"
          ? counter("Hive tips", "tele.tips", observation.tele.tips) +
            counter(
              "Cell",
              "tele.cell",
              observation.tele.cell,
              GAME.inventory.pollen +
                GAME.inventory.redNectar +
                GAME.inventory.blueNectar,
            ) +
            counter(
              "Flower",
              "tele.flower",
              observation.tele.flower,
              GAME.inventory.pollen +
                GAME.inventory.redNectar +
                GAME.inventory.blueNectar,
            ) +
            counter(
              "Garden",
              "tele.garden",
              observation.tele.garden,
              GAME.inventory.pollen +
                GAME.inventory.redNectar +
                GAME.inventory.blueNectar,
            )
          : toggle("Park", "tele.park", observation.tele.park) +
            counter(
              "Bottom nectar",
              "bottom",
              observation.bottom,
              GAME.limits.flowers,
            );
    root.innerHTML = `<div class="scout-context"><span>Match ${observation.match} · ${color} · ${observation.team}</span><button type="button" id="edit-match" aria-expanded="${editing}">Edit</button></div><form id="scout-form"><div id="scout-error" class="errors" role="alert"></div>${
      editing
        ? `<div class="identity-editor">${field("Match", "match", observation.match, "number", 'min="1" required')}${field("Team", "team", observation.team, "number", 'min="1" max="999999" required')}${select(
            "Alliance",
            "alliance",
            observation.alliance,
            [
              ["red", "Red"],
              ["blue", "Blue"],
            ],
          )}</div>`
        : ""
    }<section class="scout-phase" aria-label="${phase === "auto" ? "Auto" : phase === "teleop" ? "Teleop" : "End"}"><h1>${phase === "auto" ? "Auto" : phase === "teleop" ? "Teleop" : "End"}</h1><div class="scout-controls">${controls}</div>${phase === "end" ? '<button type="submit" class="primary save-match">Save</button>' : ""}</section></form><nav class="phase-switcher" aria-label="Phase">${(["auto", "teleop", "end"] as const).map((key) => `<button type="button" data-phase="${key}" aria-pressed="${key === phase}">${key === "auto" ? "Auto" : key === "teleop" ? "Teleop" : "End"}</button>`).join("")}</nav>`;
    const form = root.querySelector<HTMLFormElement>("#scout-form")!;
    bindSteppers(form);
    form.oninput = capture;
    updateTotal();
    root.querySelector<HTMLButtonElement>("#edit-match")!.onclick = () => {
      capture();
      editing = !editing;
      render();
    };
    root.querySelectorAll<HTMLButtonElement>("[data-phase]").forEach(
      (button) =>
        (button.onclick = () => {
          capture();
          phase = button.dataset.phase as ScoutPhase;
          render();
          window.scrollTo(0, 0);
        }),
    );
    const allianceInput =
      form.querySelector<HTMLSelectElement>('[name="alliance"]');
    if (allianceInput)
      allianceInput.onchange = () => {
        capture();
        render();
      };
    for (const name of ["team", "match"]) {
      const input = form.querySelector<HTMLInputElement>(`[name="${name}"]`);
      if (input)
        input.onchange = () => {
          capture();
          const saved = active(database.observations).find(
            (o) =>
              o.team === observation.team &&
              o.match === observation.match &&
              o.eventId === eventId,
          );
          if (saved && saved.id !== observation.id)
            observation = structuredClone(saved);
          alignAlliance();
          render();
        };
    }
    form.onsubmit = async (event) => {
      event.preventDefault();
      if (phase !== "end") return;
      capture();
      const errors = validateObservation(observation, database);
      if (!form.reportValidity() || errors.length) {
        root.querySelector("#scout-error")!.innerHTML = errors
          .map(esc)
          .join("<br>");
        return;
      }
      if (
        !active(database.teams).some((team) => team.number === observation.team)
      )
        await saveEntity("teams", {
          id: String(observation.team),
          number: observation.team,
          name: `Team ${observation.team}`,
          updatedAt: now(),
        });
      const currentEvent = active(database.events).find(
        (e) => e.id === eventId,
      )!;
      if (!currentEvent.teams.includes(observation.team))
        await saveEntity("events", {
          ...currentEvent,
          teams: [...currentEvent.teams, observation.team],
        });
      await saveEntity("observations", observation);
      await clearDraft(`match:${eventId}`);
      toast("Saved");
      location.hash = `team/${observation.team}`;
    };
  };
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
      `Red ${scoreAlliance(obs, b, "red").score} · Blue ${scoreAlliance(obs, b, "blue").score}`;
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
    toast("Saved");
  };
}
