import { GAME } from "./game.js";
import {
  achievementRP,
  deriveResults,
  resultRP,
  scoreObservation,
} from "./scoring.js";
import {
  active,
  type Database,
  type Event,
  type Observation,
  type Point,
  type RPThresholds,
  type Route,
} from "./types.js";
export const mean = (xs: number[]) =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
export const deviation = (xs: number[]) =>
  Math.sqrt(mean(xs.map((x) => (x - mean(xs)) ** 2)));
export function summary(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b),
    n = s.length;
  return {
    count: n,
    average: mean(xs),
    median: n ? (s[Math.floor(n / 2)] + s[Math.floor((n - 1) / 2)]) / 2 : 0,
    best: n ? Math.max(...xs) : 0,
    sd: deviation(xs),
  };
}
export function teamStats(db: Database, team: number, eventId?: string) {
  const obs = active(db.observations)
    .filter((o) => o.team === team && (!eventId || o.eventId === eventId))
    .sort(
      (a, b) =>
        db.events.findIndex((e) => e.id === a.eventId) -
          db.events.findIndex((e) => e.id === b.eventId) || a.match - b.match,
    );
  const scores = obs.map(scoreObservation);
  const keys = [
    "total",
    "auto",
    "tele",
    "penalties",
    "net",
    "movement",
    "tips",
  ] as const;
  const stats = Object.fromEntries(
    keys.map((k) => [k, summary(scores.map((s) => s[k]))]),
  ) as Record<(typeof keys)[number], ReturnType<typeof summary>>;
  const cats = Object.keys(
    scores[0]?.categories ?? {
      leave: 0,
      autoPark: 0,
      autoTips: 0,
      telePark: 0,
      teleTips: 0,
      cell: 0,
      flower: 0,
      bottom: 0,
      garden: 0,
    },
  );
  const categories = Object.fromEntries(
    cats.map((k) => [
      k,
      summary(scores.map((s) => (s.categories as Record<string, number>)[k])),
    ]),
  );
  return {
    obs,
    scores,
    ...stats,
    categories,
    reliability: obs.length
      ? 1 - obs.filter((o) => o.breakdown).length / obs.length
      : 1,
  };
}
function solve(a: number[][], b: number[]): number[] {
  const n = b.length,
    m = a.map((r, i) => [...r, b[i]]);
  for (let k = 0; k < n; k++) {
    let pivot = k;
    for (let i = k + 1; i < n; i++)
      if (Math.abs(m[i][k]) > Math.abs(m[pivot][k])) pivot = i;
    [m[k], m[pivot]] = [m[pivot], m[k]];
    const d = m[k][k];
    if (Math.abs(d) < 1e-10) continue;
    for (let j = k; j <= n; j++) m[k][j] /= d;
    for (let i = 0; i < n; i++)
      if (i !== k) {
        const f = m[i][k];
        for (let j = k; j <= n; j++) m[i][j] -= f * m[k][j];
      }
  }
  return m.map((r) => r[n]);
}
/** Ridge least squares: min ||Ax-y||² + lambda ||x-prior||². Penalties excluded. */
export function estimateOPR(
  teams: number[],
  rows: { teams: number[]; score: number }[],
  priors: Record<number, number> = {},
  lambda = 0.6,
): Record<number, number> {
  const n = teams.length,
    a = Array.from({ length: n }, (_, i) =>
      Array.from({ length: n }, (_, j) => (i === j ? lambda : 0)),
    ),
    b = teams.map((t) => lambda * (priors[t] ?? 0));
  for (const row of rows) {
    const ids = row.teams.map((t) => teams.indexOf(t)).filter((i) => i >= 0);
    for (const i of ids) {
      b[i] += row.score;
      for (const j of ids) a[i][j] += 1;
    }
  }
  const x = solve(a, b);
  return Object.fromEntries(teams.map((t, i) => [t, Math.max(0, x[i])]));
}
export function eventOPR(db: Database, event: Event) {
  const rows: { teams: number[]; score: number }[] = [];
  for (const m of active(db.matches).filter((m) => m.eventId === event.id)) {
    const r = deriveResults(m, db);
    if (r) {
      rows.push(
        { teams: m.red, score: r.red.score - r.red.foulPoints },
        { teams: m.blue, score: r.blue.score - r.blue.foulPoints },
      );
    }
  }
  const priors = Object.fromEntries(
    event.teams.map((t) => [t, teamStats(db, t, event.id).total.average]),
  );
  return { values: estimateOPR(event.teams, rows, priors), rows: rows.length };
}
export interface Standing {
  team: number;
  played: number;
  rankingScore: number;
  averageNonFoulScore: number;
  averageTips: number;
  averageAuto: number;
  randomTiebreak: number;
  rank?: number;
  unresolved?: boolean;
}
export function sortQualification(rows: Standing[]): Standing[] {
  const sorted = [...rows].sort(
    (a, b) =>
      b.rankingScore - a.rankingScore ||
      b.averageNonFoulScore - a.averageNonFoulScore ||
      b.averageTips - a.averageTips ||
      b.averageAuto - a.averageAuto ||
      a.randomTiebreak - b.randomTiebreak,
  );
  return sorted.map((r, i) => ({
    ...r,
    rank: i + 1,
    unresolved: sorted.some(
      (x) =>
        x !== r &&
        x.rankingScore === r.rankingScore &&
        x.averageNonFoulScore === r.averageNonFoulScore &&
        x.averageTips === r.averageTips &&
        x.averageAuto === r.averageAuto,
    ),
  }));
}
export function standings(db: Database, event: Event): Standing[] {
  const values = new Map(
    event.teams.map((t) => [
      t,
      { team: t, played: 0, rp: 0, score: 0, tips: 0, auto: 0 },
    ]),
  );
  for (const m of active(db.matches).filter((m) => m.eventId === event.id)) {
    const r = deriveResults(m, db);
    if (!r) continue;
    for (const color of ["red", "blue"] as const) {
      const own = r[color],
        other = r[color === "red" ? "blue" : "red"];
      const rp =
        own.rp ??
        achievementRP(own.movement, own.tips, event.thresholds) +
          resultRP(own.score, other.score);
      for (const t of m[color]) {
        const v = values.get(t);
        if (v && !m.surrogate?.includes(t)) {
          v.played++;
          if (!m.dq?.includes(t)) {
            v.rp += rp;
            v.score += own.score - own.foulPoints;
            v.tips += own.tips;
            v.auto += own.auto;
          }
        }
      }
    }
  }
  return sortQualification(
    [...values.values()].map((v) => ({
      team: v.team,
      played: v.played,
      rankingScore: v.played ? v.rp / v.played : 0,
      averageNonFoulScore: v.played ? v.score / v.played : 0,
      averageTips: v.played ? v.tips / v.played : 0,
      averageAuto: v.played ? v.auto / v.played : 0,
      randomTiebreak: v.team,
    })),
  );
}
export function strength(db: Database, team: number, eventId: string) {
  const s = teamStats(db, team, eventId),
    pit = active(db.pits).find((p) => p.team === team && p.eventId === eventId),
    a = pit?.answers ?? {},
    n = s.obs.length;
  const w = pit ? 3 / (3 + n) : 0,
    blend = (observed: number, prior: number) => observed * (1 - w) + prior * w;
  const tipPrior = Number(a.autoTipsAvg ?? 0) + Number(a.teleTipsAvg ?? 0);
  const movementPrior =
    +(a.leave === true) * GAME.points.leave +
    +(a.autoPark === true) * GAME.points.park +
    +(a.park === true) * GAME.points.park;
  const flowers = blend(
      mean(s.obs.map((o) => o.tele.flower)),
      Number(a.flowersAvg ?? 0),
    ),
    garden = blend(
      mean(s.obs.map((o) => o.tele.garden)),
      Number(a.gardenAvg ?? 0),
    );
  const tips = blend(s.tips.average, tipPrior),
    movement = blend(s.movement.average, movementPrior),
    cell = blend(mean(s.obs.map((o) => o.tele.cell)), Number(a.cellAvg ?? 0));
  const bottom = blend(mean(s.obs.map((o) => o.bottom)), a.bottomBonus ? 1 : 0),
    penalties = s.penalties.average;
  const score =
    tips * GAME.points.tip +
    movement +
    flowers * GAME.points.flower +
    garden * GAME.points.garden +
    cell * GAME.points.cell +
    bottom * GAME.points.bottom;
  const leaveChance = blend(
      mean(s.obs.map((o) => +o.auto.leave)),
      a.leave ? 1 : 0,
    ),
    autoParkChance = blend(
      mean(s.obs.map((o) => +o.auto.park)),
      a.autoPark ? 1 : 0,
    ),
    teleParkChance = blend(
      mean(s.obs.map((o) => +o.tele.park)),
      a.park ? 1 : 0,
    );
  return {
    team,
    score,
    tips,
    movement,
    flowers,
    garden,
    cell,
    bottom,
    penalties,
    leaveChance,
    autoParkChance,
    teleParkChance,
    sd: Math.max(s.total.sd, score * 0.15, 8),
    reliability: blend(s.reliability, a.reliability === "High" ? 0.75 : 0.95),
    pitWeight: w,
    sample: n,
    owns: !!a.topNectar || s.obs.some((o) => o.tele.flower > 0),
    autoTips: blend(
      mean(s.obs.map((o) => o.auto.tips)),
      Number(a.autoTipsAvg ?? 0),
    ),
  };
}
export function randomGenerator(seed = 42) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
const normal = (r: () => number) =>
  Math.sqrt(-2 * Math.log(Math.max(r(), 1e-10))) * Math.cos(2 * Math.PI * r());
/** Coherent samples: points are derived from sampled TIP and movement actions. */
export function sampleStrength(
  s: ReturnType<typeof strength>,
  r: () => number,
) {
  const healthy = r() < s.reliability;
  const tips = Math.max(
    0,
    Math.round(
      (s.tips + normal(r) * Math.max(0.7, s.tips * 0.25)) * (healthy ? 1 : 0.4),
    ),
  );
  const leave = +(r() < s.leaveChance),
    autoPark = +(r() < s.autoParkChance),
    telePark = +(r() < s.teleParkChance * (healthy ? 1 : 0.4));
  const movement =
    leave * GAME.points.leave + (autoPark + telePark) * GAME.points.park;
  const retainedMean = Math.max(
    0,
    s.score - s.tips * GAME.points.tip - s.movement,
  );
  const retained = Math.max(
    0,
    Math.round(
      (retainedMean + normal(r) * Math.max(3, retainedMean * 0.3)) *
        (healthy ? 1 : 0.4),
    ),
  );
  const autoTips = Math.min(
    tips,
    Math.max(0, Math.round((tips * s.autoTips) / Math.max(s.tips, 1))),
  );
  return {
    score: tips * GAME.points.tip + movement + retained,
    tips,
    movement,
    auto:
      leave * GAME.points.leave +
      autoPark * GAME.points.park +
      autoTips * GAME.points.tip,
  };
}
export function allianceProjection(
  db: Database,
  teams: number[],
  eventId: string,
  thresholds: RPThresholds = GAME.thresholds,
  iterations = 600,
) {
  const ss = teams.map((t) => strength(db, t, eventId)),
    r = randomGenerator(teams.reduce((a, b) => a + b, 17)),
    scores: number[] = [],
    rps = [0, 0, 0];
  for (let i = 0; i < iterations; i++) {
    const draws = ss.map((s) => sampleStrength(s, r));
    // Retained field elements are finite; cap projected non-TIP end-state elements to half the shared pool.
    const tips = draws.reduce((a, b) => a + b.tips, 0),
      movement = Math.min(
        teams.length * (GAME.points.leave + 2 * GAME.points.park),
        draws.reduce((a, b) => a + b.movement, 0),
      );
    const raw = draws.reduce((a, b) => a + b.score, 0),
      retainedCap =
        ((GAME.inventory.pollen +
          GAME.inventory.redNectar +
          GAME.inventory.blueNectar) /
          2) *
          GAME.points.flower +
        GAME.limits.flowers * GAME.points.bottom;
    scores.push(
      Math.max(
        0,
        Math.min(raw, tips * GAME.points.tip + movement + retainedCap),
      ),
    );
    rps[0] += +(movement >= thresholds.swarm);
    rps[1] += +(tips >= thresholds.pollinator1);
    rps[2] += +(tips >= thresholds.pollinator2);
  }
  return {
    teams,
    score: mean(scores),
    sd: deviation(scores),
    low: [...scores].sort((a, b) => a - b)[Math.floor(iterations * 0.1)],
    high: [...scores].sort((a, b) => a - b)[Math.floor(iterations * 0.9)],
    rp: rps.map((v) => v / iterations),
    strengths: ss,
  };
}
export function compatibility(
  db: Database,
  our: number,
  other: number,
  event: Event,
) {
  const a = strength(db, our, event.id),
    b = strength(db, other, event.id),
    p = allianceProjection(db, [our, other], event.id, event.thresholds);
  const reasons: string[] = [];
  if (b.flowers > a.flowers)
    reasons.push(
      `Adds ${b.flowers.toFixed(1)} credited FLOWER elements per match against our ${a.flowers.toFixed(1)}.`,
    );
  if (b.garden > a.garden)
    reasons.push(
      `Covers GARDEN work: ${b.garden.toFixed(1)} elements per match.`,
    );
  if (b.tips > a.tips)
    reasons.push(`Adds HIVE throughput: ${b.tips.toFixed(1)} TIPs per match.`);
  if (!a.owns && b.owns)
    reasons.push("Offers top-NECTAR ownership capability.");
  if (b.sample < 3)
    reasons.push(
      `Limited evidence: ${b.sample} matches; pit prior carries ${Math.round(b.pitWeight * 100)}% weight.`,
    );
  if (b.reliability < 0.9)
    reasons.push("Reliability reduces the projection; review breakdown notes.");
  const routesA =
      active(db.pits).find((x) => x.team === our && x.eventId === event.id)
        ?.routes ?? [],
    routesB =
      active(db.pits).find((x) => x.team === other && x.eventId === event.id)
        ?.routes ?? [];
  const conflicts = routesA.some((x) =>
    routesB.some((y) => routeConflicts(x, y).length),
  );
  if (conflicts)
    reasons.push(
      "Autonomous paths overlap geometrically; check timing in the route overlay.",
    );
  if (!reasons.length)
    reasons.push(
      "Similar role profile; coordinate launch lanes and last-minute FLOWER work.",
    );
  const complement =
    Math.max(0, b.flowers - a.flowers) * 2 +
    Math.max(0, b.garden - a.garden) +
    (b.owns && !a.owns ? 5 : 0);
  const fits = teamStats(db, other, event.id).obs.map((o) => o.compatibility),
    fit = fits.length ? mean(fits) : 3;
  if (fits.length)
    reasons.push(
      `Scouts rate pairing fit ${fit.toFixed(1)} / 5 across ${fits.length} matches.`,
    );
  return {
    ...p,
    reasons,
    conflicts,
    index: p.score + complement + (fit - 3) * 3 - (conflicts ? 8 : 0),
  };
}
export function headToHead(
  db: Database,
  red: number[],
  blue: number[],
  event: Event,
  iterations = 1000,
) {
  const a = allianceProjection(db, red, event.id, event.thresholds),
    b = allianceProjection(db, blue, event.id, event.thresholds),
    r = randomGenerator(402);
  let wins = 0,
    ties = 0;
  const samples: number[] = [];
  for (let i = 0; i < iterations; i++) {
    let x = Math.max(0, a.score + normal(r) * a.sd),
      y = Math.max(0, b.score + normal(r) * b.sd);
    // Competition for the finite field pool introduces anti-correlated end-state scoring.
    const available =
      (GAME.inventory.pollen +
        GAME.inventory.redNectar +
        GAME.inventory.blueNectar) *
        GAME.points.flower +
      GAME.limits.flowers * 2 * GAME.points.bottom;
    const retainedA = a.strengths.reduce(
        (n, s) =>
          n +
          s.flowers * GAME.points.flower +
          s.garden * GAME.points.garden +
          s.cell * GAME.points.cell +
          s.bottom * GAME.points.bottom,
        0,
      ),
      retainedB = b.strengths.reduce(
        (n, s) =>
          n +
          s.flowers * GAME.points.flower +
          s.garden * GAME.points.garden +
          s.cell * GAME.points.cell +
          s.bottom * GAME.points.bottom,
        0,
      );
    if (retainedA + retainedB > available) {
      x -= retainedA * (1 - available / (retainedA + retainedB));
      y -= retainedB * (1 - available / (retainedA + retainedB));
    }
    x += b.strengths.reduce((n, s) => n + s.penalties, 0);
    y += a.strengths.reduce((n, s) => n + s.penalties, 0);
    const d = Math.round(x) - Math.round(y);
    wins += +(d > 0);
    ties += +(d === 0);
    samples.push(d);
  }
  return {
    red: a,
    blue: b,
    win: wins / iterations,
    tie: ties / iterations,
    margin: mean(samples),
  };
}
export function simulateRanks(
  db: Database,
  event: Event,
  our: number,
  iterations = 800,
  boost = 0,
) {
  const base = standings(db, event),
    remaining = active(db.matches).filter(
      (m) => m.eventId === event.id && !deriveResults(m, db),
    );
  const r = randomGenerator(2027),
    ranks: number[] = [],
    hist = Array(event.teams.length).fill(0);
  const strengths = Object.fromEntries(
    event.teams.map((t) => [t, strength(db, t, event.id)]),
  );
  for (let i = 0; i < iterations; i++) {
    const rows = base.map((s) => ({
      ...s,
      rp: s.rankingScore * s.played,
      score: s.averageNonFoulScore * s.played,
      tips: s.averageTips * s.played,
      auto: s.averageAuto * s.played,
    }));
    for (const m of remaining) {
      const results =
        m.red.length === 2 && m.blue.length === 2
          ? (["red", "blue"] as const).map((color) => {
              const ss = m[color].map((t) => sampleStrength(strengths[t], r));
              const score = Math.max(
                  0,
                  ss.reduce((n, s) => n + s.score, 0) +
                    (m[color].includes(our) ? boost : 0),
                ),
                tips = ss.reduce((n, s) => n + s.tips, 0),
                movement = ss.reduce((n, s) => n + s.movement, 0),
                auto = ss.reduce((n, s) => n + s.auto, 0);
              const penalties = m[color].reduce(
                (n, t) => n + strengths[t].penalties,
                0,
              );
              return { score, tips, movement, auto, penalties };
            })
          : null;
      if (!results) continue;
      const retained = results.map((x) =>
        Math.max(0, x.score - x.tips * GAME.points.tip - x.movement),
      );
      const pool =
        (GAME.inventory.pollen +
          GAME.inventory.redNectar +
          GAME.inventory.blueNectar) *
          GAME.points.flower +
        GAME.limits.flowers * 2 * GAME.points.bottom;
      if (retained[0] + retained[1] > pool)
        results.forEach(
          (x, i) =>
            (x.score -= retained[i] * (1 - pool / (retained[0] + retained[1]))),
        );
      for (let c = 0; c < 2; c++) {
        const x = results[c],
          y = results[1 - c];
        for (const t of c === 0 ? m.red : m.blue) {
          const row = rows.find((v) => v.team === t)!;
          row.played++;
          row.rp +=
            achievementRP(x.movement, x.tips, event.thresholds) +
            resultRP(
              Math.round(x.score + y.penalties),
              Math.round(y.score + x.penalties),
            );
          row.score += x.score;
          row.tips += x.tips;
          row.auto += x.auto;
        }
      }
    }
    const sorted = sortQualification(
      rows.map((x) => ({
        ...x,
        rankingScore: x.played ? x.rp / x.played : 0,
        averageNonFoulScore: x.played ? x.score / x.played : 0,
        averageTips: x.played ? x.tips / x.played : 0,
        averageAuto: x.played ? x.auto / x.played : 0,
        randomTiebreak: r(),
      })),
    );
    const rank = sorted.findIndex((s) => s.team === our) + 1;
    if (rank) {
      ranks.push(rank);
      hist[rank - 1]++;
    }
  }
  return {
    hist: hist.map((v) => v / iterations),
    average: mean(ranks),
    low: ranks.length ? Math.min(...ranks) : 0,
    high: ranks.length ? Math.max(...ranks) : 0,
    remaining: remaining.length,
  };
}
function intersection(a: Point, b: Point, c: Point, d: Point): Point | null {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    ex = d.x - c.x,
    ey = d.y - c.y,
    den = dx * ey - dy * ex;
  if (Math.abs(den) < 1e-8) {
    if (Math.abs((c.x - a.x) * dy - (c.y - a.y) * dx) > 1e-8) return null;
    const inside = (p: Point, x: Point, y: Point) =>
      p.x >= Math.min(x.x, y.x) - 0.001 &&
      p.x <= Math.max(x.x, y.x) + 0.001 &&
      p.y >= Math.min(x.y, y.y) - 0.001 &&
      p.y <= Math.max(x.y, y.y) + 0.001;
    const overlap = [a, b, c, d].filter(
      (p) => inside(p, a, b) && inside(p, c, d),
    );
    return overlap.length
      ? { x: mean(overlap.map((p) => p.x)), y: mean(overlap.map((p) => p.y)) }
      : null;
  }
  const t = ((c.x - a.x) * ey - (c.y - a.y) * ex) / den,
    u = ((c.x - a.x) * dy - (c.y - a.y) * dx) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1
    ? { x: a.x + t * dx, y: a.y + t * dy }
    : null;
}
export function routeConflicts(a: Route, b: Route): Point[] {
  const hits: Point[] = [];
  for (const p of a.paths)
    for (const q of b.paths)
      for (let i = 1; i < p.length; i++)
        for (let j = 1; j < q.length; j++) {
          const hit = intersection(p[i - 1], p[i], q[j - 1], q[j]);
          if (
            hit &&
            !hits.some((x) => Math.hypot(x.x - hit.x, x.y - hit.y) < 5)
          )
            hits.push(hit);
        }
  return hits;
}
export function pitDisagreements(
  db: Database,
  team: number,
  eventId: string,
): string[] {
  const pit = active(db.pits).find(
      (p) => p.team === team && p.eventId === eventId,
    ),
    s = teamStats(db, team, eventId);
  if (!pit || !s.obs.length) return [];
  const a = pit.answers,
    notes: string[] = [];
  const claimed = Number(a.autoTipsMax ?? 0),
    observed = Math.max(...s.obs.map((o) => o.auto.tips));
  if (claimed > observed)
    notes.push(
      `Pit claims ${claimed} AUTO TIPs; observed best is ${observed} over ${s.obs.length} matches.`,
    );
  if (a.leave && !s.obs.some((o) => o.auto.leave))
    notes.push("Pit claims LEAVE; no scouted match confirms it.");
  if (a.autoPark && !s.obs.some((o) => o.auto.park))
    notes.push("Pit claims AUTO PARK; not yet observed.");
  if (a.park && !s.obs.some((o) => o.tele.park))
    notes.push("Pit claims final PARK; not yet observed.");
  return notes;
}
