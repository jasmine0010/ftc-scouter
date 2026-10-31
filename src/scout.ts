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
  section,
  select,
  textArea,
  toast,
  toggle,
} from "./ui.js";

const yesNo = (label: string, name: string, value: boolean) =>
  `<label class="yes-no-row"><input type="checkbox" name="${esc(name)}"${value ? " checked" : ""}><span>${esc(label)}</span><strong class="yes-no-state" aria-hidden="true">${value ? "Yes" : "No"}</strong></label>`;

export async function renderScout(root: HTMLElement, editId?: string) {
  const eventId = settings.eventId;
  const next = active(database.matches)
    .filter(
      (match) =>
        match.eventId === eventId &&
        !match.played &&
        [...match.red, ...match.blue].includes(settings.team),
    )
    .sort((a, b) => a.number - b.number)[0];
  let observation = structuredClone(
    active(database.observations).find((item) => item.id === editId) ??
      (!editId
        ? await readDraft<Observation>(`match:${eventId}`)
        : undefined) ??
      blankObservation(eventId, settings.team, next?.number ?? 1),
  );
  const positions: [string, string][] = [
    ["", "Not sure"],
    ...["Near", "Center", "Far", "Perimeter", "Flexible"].map(
      (position) => [position, position] as [string, string],
    ),
  ];
  const position = (value?: string) =>
    positions.some(([key]) => key === value) ? value! : "";
  const inventory =
    GAME.inventory.pollen +
    GAME.inventory.redNectar +
    GAME.inventory.blueNectar;
  const scoreMarkup = () => {
    const score = scoreObservation(observation),
      end = score.categories.telePark + score.categories.bottom;
    return `<span>Current score</span><strong>${fmt(score.total, 0)}</strong><div class="score-breakdown"><span>Auto <b>${fmt(score.auto, 0)}</b></span><span>Teleop <b>${fmt(score.tele - end, 0)}</b></span><span>End <b>${fmt(end, 0)}</b></span></div>`;
  };
  const capture = () => {
    const form = root.querySelector<HTMLFormElement>("#scout-form");
    if (!form) return;
    for (const [name, value] of Object.entries(formValues(form))) {
      if (name.startsWith("auto.") || name.startsWith("tele.")) {
        const [period, key] = name.split(".");
        (
          observation[period as "auto" | "tele"] as unknown as Record<
            string,
            unknown
          >
        )[key] = value;
      } else (observation as unknown as Record<string, unknown>)[name] = value;
    }
    observation.offense = Number(observation.offense);
    observation.compatibility = Number(observation.compatibility);
    root
      .querySelectorAll<HTMLInputElement>(".yes-no-row input")
      .forEach(
        (input) =>
          (input.parentElement!.querySelector(".yes-no-state")!.textContent =
            input.checked ? "Yes" : "No"),
      );
    void saveDraft(`match:${eventId}`, observation);
    root.querySelector("#live-score")!.innerHTML = scoreMarkup();
    const total = root.querySelector("#calculated-score");
    if (total) total.textContent = fmt(scoreObservation(observation).total, 0);
  };
  function render() {
    const autoScoring = `<div class="scout-grid">${counter("Hive tips", "auto.tips", observation.auto.tips)}${counter("Pollen launched", "auto.pollen", observation.auto.pollen)}${counter("Nectar launched", "auto.nectar", observation.auto.nectar)}${counter("Flowers placed", "auto.flowerPlaced", observation.auto.flowerPlaced ?? 0)}${counter("Garden deliveries", "auto.gardenDelivered", observation.auto.gardenDelivered ?? 0)}</div>`;
    const teleScoring = `<div class="scout-grid">${counter("Hive tips", "tele.tips", observation.tele.tips)}${counter("Pollen launched", "tele.pollen", observation.tele.pollen)}${counter("Nectar launched", "tele.nectar", observation.tele.nectar)}${counter("Flowers placed", "tele.flowerPlaced", observation.tele.flowerPlaced ?? 0)}${counter("Garden deliveries", "tele.gardenDelivered", observation.tele.gardenDelivered ?? 0)}${counter("Cell elements retained", "tele.cell", observation.tele.cell, inventory)}${counter("Owned flower elements", "tele.flower", observation.tele.flower, inventory)}${counter("Garden elements retained", "tele.garden", observation.tele.garden, inventory)}</div>`;
    const endScoring = `<div class="scout-grid">${counter("Bottom nectar bonuses", "bottom", observation.bottom, GAME.limits.flowers)}${counter("Minor fouls", "minor", observation.minor)}${counter("Major fouls", "major", observation.major)}${counter("Early nectar in flowers", "earlyNectar", observation.earlyNectar)}</div>`;
    const autoRobot = `<div class="robot-controls">${yesNo("Leave", "auto.leave", observation.auto.leave)}${yesNo("Park", "auto.park", observation.auto.park)}${select("Shooting zone", "autoLaunchPosition", position(observation.autoLaunchPosition), positions)}</div>`;
    const teleRobot = `<div class="robot-controls">${select("Shooting zone", "launchPosition", position(observation.launchPosition), positions)}${yesNo("Can select nectar / sort", "canSort", observation.canSort)}${select("Offense against defense", "offense", observation.offense, ["1", "2", "3", "4", "5"])}${yesNo("Plays defense", "defense", observation.defense)}</div>`;
    const endRobot = `<div class="robot-controls">${yesNo("Park", "tele.park", observation.tele.park)}${yesNo("Breakdown", "breakdown", observation.breakdown)}${counter("Downtime (seconds)", "downtime", observation.downtime, GAME.limits.autoSeconds + GAME.limits.teleSeconds)}${yesNo("Fixed shooting position", "fixedPosition", observation.fixedPosition)}${select("Compatibility rating", "compatibility", observation.compatibility, ["1", "2", "3", "4", "5"])}${textArea("Loading-zone execution", "loadingNotes", observation.loadingNotes)}${textArea("Notes", "note", observation.note)}</div>`;
    const identity = `<div class="identity-grid">${field("Scout name", "scout", observation.scout)}${field("Match ID", "match", observation.match, "number", 'min="1" required inputmode="numeric"')}${field("Team ID", "team", observation.team, "number", 'min="1" max="999999" required inputmode="numeric" list="team-options"')}<fieldset class="alliance-selector"><legend>Alliance</legend><div>${(["red", "blue"] as const).map((color) => `<label><input type="radio" name="alliance" value="${color}"${observation.alliance === color ? " checked" : ""}><span>${color === "red" ? "Red" : "Blue"}</span></label>`).join("")}</div></fieldset></div><datalist id="team-options">${active(
      database.teams,
    )
      .map(
        (team) => `<option value="${team.number}">${esc(team.name)}</option>`,
      )
      .join("")}</datalist>`;
    root.innerHTML = `<div class="page-heading"><h2>FTC BIOBUZZ Scout Form</h2></div><div class="live-score" id="live-score" aria-live="polite">${scoreMarkup()}</div><form id="scout-form" class="scout-form" aria-label="Match scouting"><div class="errors" id="scout-error" role="alert"></div>${identity}${section("Auto", autoScoring + autoRobot)}${section("Teleop", teleScoring + teleRobot)}${section("End", endScoring + endRobot)}<div class="match-submit"><div class="calculated-score"><span>Calculated score</span><strong id="calculated-score">${fmt(scoreObservation(observation).total, 0)}</strong></div><button type="submit" class="primary">Save</button></div></form><section class="section shared-board"><details id="board-details"><summary>Shared field outcome · match ${observation.match}</summary><div id="board-editor"></div></details></section>`;
    const form = root.querySelector<HTMLFormElement>("#scout-form")!;
    bindSteppers(form);
    form.oninput = capture;
    for (const name of ["team", "match"]) {
      const input = form.querySelector<HTMLInputElement>(`[name="${name}"]`);
      if (input)
        input.onchange = () => {
          capture();
          const saved = active(database.observations).find(
            (item) =>
              item.eventId === eventId &&
              item.team === observation.team &&
              item.match === observation.match,
          );
          if (saved && saved.id !== observation.id) {
            observation = structuredClone(saved);
            render();
          } else {
            const match = active(database.matches).find(
              (item) =>
                item.eventId === eventId && item.number === observation.match,
            );
            if (match?.red.includes(observation.team))
              observation.alliance = "red";
            if (match?.blue.includes(observation.team))
              observation.alliance = "blue";
            form
              .querySelectorAll<HTMLInputElement>('[name="alliance"]')
              .forEach(
                (radio) =>
                  (radio.checked = radio.value === observation.alliance),
              );
          }
        };
    }
    form.onsubmit = async (event) => {
      event.preventDefault();
      capture();
      const errors = validateObservation(observation, database);
      if (!form.reportValidity() || errors.length) {
        root.querySelector("#scout-error")!.innerHTML = errors
          .map(esc)
          .join("<br>");
        root
          .querySelector<HTMLElement>("#scout-error")!
          .scrollIntoView({ block: "center" });
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
      const current = active(database.events).find(
        (item) => item.id === eventId,
      )!;
      if (!current.teams.includes(observation.team))
        await saveEntity("events", {
          ...current,
          teams: [...current.teams, observation.team],
        });
      await saveEntity("observations", observation);
      await clearDraft(`match:${eventId}`);
      toast("Match saved");
      location.hash = `team/${observation.team}`;
    };
    const boardDetails =
      root.querySelector<HTMLDetailsElement>("#board-details");
    if (boardDetails)
      boardDetails.ontoggle = (event) => {
        if ((event.target as HTMLDetailsElement).open)
          void renderBoard(
            root.querySelector("#board-editor")!,
            eventId,
            observation.match,
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
