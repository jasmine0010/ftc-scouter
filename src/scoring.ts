import { GAME, sumElements } from "./game.js";
import {
  active,
  type Alliance,
  type Board,
  type Database,
  type Match,
  type Observation,
  type RPThresholds,
  type OfficialResult,
} from "./types.js";
/**
 * What a robot's scout recorded, in one shape for old and new forms.
 * Older matches recorded end-of-match CELL/FLOWER/GARDEN counts per robot; when any
 * are present they are used as-is. Newer matches record live actions (shots scored,
 * FLOWER placements, GARDEN drops), which become an estimate of the same counts.
 */
export function robotCounts(o: Observation) {
  const legacy = o.tele.cell + o.tele.flower + o.tele.garden > 0;
  const scored = (o.auto.scored ?? 0) + (o.tele.scored ?? 0),
    missed = (o.auto.missed ?? 0) + (o.tele.missed ?? 0),
    tracked = o.auto.scored !== undefined || o.tele.scored !== undefined;
  return {
    cell: legacy ? o.tele.cell : scored,
    flower: legacy
      ? o.tele.flower
      : (o.auto.flowerPlaced ?? 0) + (o.tele.flowerPlaced ?? 0),
    garden: legacy
      ? o.tele.garden
      : (o.auto.gardenDelivered ?? 0) + (o.tele.gardenDelivered ?? 0),
    shots: tracked
      ? scored + missed
      : o.auto.pollen + o.auto.nectar + o.tele.pollen + o.tele.nectar,
    scored,
    missed,
    /** Share of shots that went in; null when the match has no Scored/Missed data. */
    accuracy:
      tracked && scored + missed > 0 ? scored / (scored + missed) : null,
  };
}
/** Scored ÷ (scored + missed) across matches that recorded shots; null if none did. */
export function shotAccuracy(obs: Observation[]): number | null {
  let scored = 0,
    shots = 0;
  for (const o of obs) {
    const c = robotCounts(o);
    if (c.accuracy === null) continue;
    scored += c.scored;
    shots += c.scored + c.missed;
  }
  return shots ? scored / shots : null;
}
export function scoreObservation(o: Observation) {
  const p = GAME.points,
    counts = robotCounts(o);
  const c = {
    leave: +o.auto.leave * p.leave,
    autoPark: +o.auto.park * p.park,
    autoTips: o.auto.tips * p.tip,
    telePark: +o.tele.park * p.park,
    teleTips: o.tele.tips * p.tip,
    cell: counts.cell * p.cell,
    flower: counts.flower * p.flower,
    bottom: o.bottom * p.bottom,
    garden: counts.garden * p.garden,
  };
  const auto = c.leave + c.autoPark + c.autoTips,
    tele = c.telePark + c.teleTips + c.cell + c.flower + c.bottom + c.garden;
  const penalties = o.minor * p.minor + (o.major + o.earlyNectar) * p.major;
  return {
    categories: c,
    auto,
    tele,
    total: auto + tele,
    penalties,
    net: auto + tele - penalties,
    movement: c.leave + c.autoPark + c.telePark,
    tips: o.auto.tips + o.tele.tips,
  };
}
export function achievementRP(
  movement: number,
  tips: number,
  t: RPThresholds = GAME.thresholds,
): number {
  return (
    (+(movement >= t.swarm) +
      +(tips >= t.pollinator1) +
      +(tips >= t.pollinator2)) *
    GAME.rp.achievement
  );
}
export function resultRP(score: number, opponent: number): number {
  return score > opponent ? GAME.rp.win : score === opponent ? GAME.rp.tie : 0;
}
/** Shared board is counted once; credited per-robot end-state estimates are ignored here. */
export function scoreAlliance(
  obs: Observation[],
  board: Board,
  alliance: Alliance,
): OfficialResult & { nonFoul: number } {
  const own = obs.filter((o) => o.alliance === alliance),
    opponent = obs.filter((o) => o.alliance !== alliance),
    p = GAME.points;
  const robot = own.reduce(
    (n, o) =>
      n + scoreObservation(o).movement + scoreObservation(o).tips * p.tip,
    0,
  );
  const cell =
    sumElements(alliance === "red" ? board.redCell : board.blueCell) * p.cell;
  const garden =
    sumElements(alliance === "red" ? board.redGarden : board.blueGarden) *
    p.garden;
  const flower = board.flowers.reduce(
    (n, f) =>
      n +
      (f.owner === alliance ? sumElements(f) * p.flower : 0) +
      (f[alliance === "red" ? "bottomRed" : "bottomBlue"] ? p.bottom : 0),
    0,
  );
  const fouls = opponent.reduce((n, o) => n + scoreObservation(o).penalties, 0);
  return {
    score: robot + cell + garden + flower + fouls,
    nonFoul: robot + cell + garden + flower,
    foulPoints: fouls,
    movement: own.reduce((n, o) => n + scoreObservation(o).movement, 0),
    tips: own.reduce((n, o) => n + scoreObservation(o).tips, 0),
    auto: own.reduce((n, o) => n + scoreObservation(o).auto, 0),
  };
}
export function validateObservation(o: Observation, db?: Database): string[] {
  const errors: string[] = [];
  if (!Number.isInteger(o.team) || o.team < 1 || o.team > 999999)
    errors.push("Team number must be a positive integer (1–999999).");
  if (!Number.isInteger(o.match) || o.match < 1)
    errors.push("Match number must be a positive integer.");
  for (const phase of [o.auto, o.tele]) {
    for (const key of [
      "tips",
      "pollen",
      "nectar",
      "cell",
      "flower",
      "garden",
    ] as const) {
      const value = phase[key];
      if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value))
        errors.push(`${key} must be a nonnegative whole number.`);
    }
    for (const key of [
      "flowerPlaced",
      "gardenDelivered",
      "scored",
      "missed",
    ] as const)
      if (
        phase[key] !== undefined &&
        (!Number.isInteger(phase[key]) || phase[key] < 0)
      )
        errors.push(`${key} must be a nonnegative whole number.`);
    if (typeof phase.leave !== "boolean" || typeof phase.park !== "boolean")
      errors.push("LEAVE and PARK must be Boolean values.");
  }
  for (const key of [
    "bottom",
    "minor",
    "major",
    "earlyNectar",
    "downtime",
  ] as const)
    if (!Number.isInteger(o[key]) || o[key] < 0)
      errors.push(`${key} must be a nonnegative whole number.`);
  if (o.bottom > GAME.limits.flowers)
    errors.push("Bottom bonuses cannot exceed the number of FLOWERs.");
  const finite =
    GAME.inventory.pollen +
    GAME.inventory.redNectar +
    GAME.inventory.blueNectar;
  if (o.tele.cell + o.tele.flower + o.tele.garden > finite)
    errors.push(
      "Credited end-state elements exceed all 56 elements on the field.",
    );
  if (o.stopped !== undefined && !["no", "briefly", "most"].includes(o.stopped))
    errors.push("Stopped working must be No, Briefly or Most of match.");
  if (o.downtime > GAME.limits.autoSeconds + GAME.limits.teleSeconds)
    errors.push("Downtime exceeds match duration.");
  if (
    db &&
    active(db.observations).some(
      (x) =>
        x.id !== o.id &&
        x.eventId === o.eventId &&
        x.match === o.match &&
        x.team === o.team,
    )
  )
    errors.push(
      "This team already has an observation for this match. Open and edit that observation.",
    );
  if (db) {
    const match = active(db.matches).find(
      (m) => m.eventId === o.eventId && m.number === o.match,
    );
    if (match && !match[o.alliance].includes(o.team))
      errors.push("Team/alliance does not match the imported schedule.");
  }
  return [...new Set(errors)];
}
export function validateBoard(b: Board): string[] {
  const errors: string[] = [];
  const totals = { pollen: 0, redNectar: 0, blueNectar: 0 };
  if (b.flowers.length !== GAME.limits.flowers)
    errors.push("Exactly four FLOWERs are required.");
  for (const [i, f] of b.flowers.entries()) {
    if (!["red", "blue", "none"].includes(f.owner))
      errors.push(`FLOWER ${i + 1}: invalid owner.`);
    if (
      (f.owner === "red" && !f.redNectar) ||
      (f.owner === "blue" && !f.blueNectar)
    )
      errors.push(
        `FLOWER ${i + 1}: owner needs qualifying NECTAR of that color.`,
      );
    if (f.owner === "none" && (f.redNectar || f.blueNectar))
      errors.push(`FLOWER ${i + 1}: NECTAR requires an owner.`);
    if ((f.bottomRed && !f.redNectar) || (f.bottomBlue && !f.blueNectar))
      errors.push(
        `FLOWER ${i + 1}: bottom bonus requires that alliance's NECTAR.`,
      );
  }
  for (const e of [
    ...b.flowers,
    b.redCell,
    b.blueCell,
    b.redGarden,
    b.blueGarden,
  ])
    for (const k of ["pollen", "redNectar", "blueNectar"] as const) {
      if (!Number.isInteger(e[k]) || e[k] < 0)
        errors.push("End-state counts must be nonnegative whole numbers.");
      totals[k] += e[k];
    }
  for (const k of ["pollen", "redNectar", "blueNectar"] as const)
    if (totals[k] > GAME.inventory[k])
      errors.push(
        `${k}: ${totals[k]} end-state elements exceed field limit ${GAME.inventory[k]}.`,
      );
  return [...new Set(errors)];
}
export function deriveResults(m: Match, db: Database) {
  if (m.played && m.redResult && m.blueResult)
    return { red: m.redResult, blue: m.blueResult, official: true };
  const board = active(db.boards).find(
    (b) => b.eventId === m.eventId && b.match === m.number && b.confirmed,
  );
  const obs = active(db.observations).filter(
    (o) => o.eventId === m.eventId && o.match === m.number,
  );
  if (
    !board ||
    [...m.red, ...m.blue].some((t) => !obs.some((o) => o.team === t))
  )
    return null;
  return {
    red: scoreAlliance(obs, board, "red"),
    blue: scoreAlliance(obs, board, "blue"),
    official: false,
  };
}
