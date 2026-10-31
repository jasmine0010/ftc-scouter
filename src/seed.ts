import { GAME } from "./game.js";
import { randomGenerator } from "./analytics.js";
import { scoreAlliance } from "./scoring.js";
import {
  blankBoard,
  blankObservation,
  type Database,
  type Event,
  type Match,
  type Pit,
} from "./types.js";
export const DEMO_STAMP = "2026-10-30T12:00:00.000Z";
export const DEMO_TEAMS: [number, string][] = [
  [11770, "Curiosity"],
  [24079, "Circuit Breakers"],
  [21380, "Vector Mechanics"],
  [3526, "Torque Theory"],
  [30110, "Redshift"],
  [26504, "Parallel Motion"],
  [9881, "Copper Circuit"],
  [15046, "Afterburn"],
  [23564, "Signal Theory"],
  [20406, "Kinetic Union"],
  [19198, "Orbit Robotics"],
  [13277, "Drive Current"],
  [21930, "Static Friction"],
  [21830, "Phase Shift"],
  [30099, "Arc Assembly"],
  [6371, "Northstar"],
];
/** Synthetic fixture for tests; never used to initialize the live database. */
export function seedDatabase(): Database {
  const stamp = DEMO_STAMP,
    numbers = DEMO_TEAMS.map(([number]) => number),
    names = DEMO_TEAMS.map(([, name]) => name);
  const e: Event = {
    id: "demo-la",
    updatedAt: stamp,
    name: "Los Angeles Scrimmage",
    code: "DEMO-LA",
    season: 2026,
    teams: numbers,
    thresholds: { ...GAME.thresholds },
  };
  const e2: Event = {
    ...e,
    id: "demo-league",
    name: "SoCal League Meet",
    code: "DEMO-SOCAL",
  };
  const db: Database = {
    schemaVersion: 1,
    teams: numbers.map((number, i) => ({
      id: String(number),
      updatedAt: stamp,
      number,
      name: names[i],
    })),
    events: [e, e2],
    observations: [],
    boards: [],
    matches: [],
    pits: [],
    notes: [],
    picks: [],
  };
  const r = randomGenerator(1234);
  for (const [eventIndex, event] of [e, e2].entries()) {
    for (let n = 1; n <= 36; n++) {
      const round = Math.floor((n - 1) / 4),
        group = (n - 1) % 4,
        shift = round % 4;
      const order = Array.from(
        { length: 16 },
        (_, i) => numbers[(i * 5 + shift + round * 3) % 16],
      );
      const four = order.slice(group * 4, group * 4 + 4),
        m: Match = {
          id: `${event.id}:${n}`,
          updatedAt: stamp,
          eventId: event.id,
          number: n,
          red: four.slice(0, 2),
          blue: four.slice(2),
          played: n <= (eventIndex ? 12 : 24),
        };
      db.matches.push(m);
      if (!m.played) continue;
      const b = blankBoard(event.id, n);
      b.updatedAt = stamp;
      b.confirmed = true;
      b.flowers = b.flowers.map((_, i) => ({
        pollen: 2 + Math.floor(r() * 2),
        redNectar: i % 2 === 0 ? 1 : 0,
        blueNectar: i % 2 ? 1 : 0,
        owner: i % 2 ? "blue" : "red",
        bottomRed: i % 2 === 0,
        bottomBlue: i % 2 === 1,
      }));
      b.redCell = { pollen: 2, redNectar: 0, blueNectar: 0 };
      b.blueCell = { pollen: 2, redNectar: 0, blueNectar: 0 };
      b.redGarden = { pollen: 3, redNectar: 0, blueNectar: 0 };
      b.blueGarden = { pollen: 3, redNectar: 0, blueNectar: 0 };
      db.boards.push(b);
      for (const color of ["red", "blue"] as const)
        for (const [j, t] of m[color].entries()) {
          const index = numbers.indexOf(t),
            hive = index === 0 ? 1.25 : 1 + (15 - index) / 20,
            flowerSpecial = index % 4 === 1;
          const o = blankObservation(event.id, t, n);
          o.id = `${event.id}:${n}:${t}`;
          o.updatedAt = stamp;
          o.alliance = color;
          o.scout = ["Avery", "Morgan", "Riley", "Jordan"][
            j + (color === "blue" ? 2 : 0)
          ];
          o.auto.leave = r() > 0.06;
          o.auto.park = r() > 0.55;
          o.auto.tips = Math.floor(r() * 2 * hive);
          o.auto.pollen = 4 + Math.floor(r() * 7);
          o.auto.nectar = 0;
          o.tele.tips = Math.max(
            0,
            Math.floor((flowerSpecial ? 1.5 : 3) * hive + r() * 3),
          );
          o.tele.pollen = 15 + Math.floor(r() * 26);
          o.tele.nectar = 1 + Math.floor(r() * 2);
          o.tele.park = r() > 0.16;
          o.tele.cell = 1;
          const owned = b.flowers
            .filter((f) => f.owner === color)
            .reduce((a, f) => a + f.pollen + f.redNectar + f.blueNectar, 0);
          o.tele.flower =
            j === 0 ? Math.floor(owned * 0.6) : owned - Math.floor(owned * 0.6);
          o.tele.garden = j === 0 ? 2 : 1;
          o.tele.flowerPlaced = o.tele.flower + 1;
          o.tele.gardenDelivered = o.tele.garden + 1;
          o.bottom = 1;
          o.minor = r() > 0.83 ? 1 : 0;
          o.major = r() > 0.98 ? 1 : 0;
          o.breakdown = r() > 0.94;
          o.downtime = o.breakdown ? 25 + Math.floor(r() * 50) : 0;
          if (o.breakdown) {
            o.tele.tips = Math.floor(o.tele.tips / 2);
            o.tele.park = false;
          }
          o.canSort = true;
          o.offense = 3 + Math.floor(r() * 3);
          o.defense = flowerSpecial;
          o.compatibility = 3 + Math.floor(r() * 3);
          o.fixedPosition = index % 3 === 0;
          o.launchPosition = flowerSpecial ? "Perimeter" : "Center";
          o.note = o.breakdown
            ? "Intake stalled during the second cycle; recovered late."
            : flowerSpecial
              ? "Switched to FLOWER work at 60 seconds. Clean human-player handoff."
              : "Consistent HIVE cycles. Needs clear access through center.";
          o.loadingNotes = "Human player waited for a clear loading zone.";
          db.observations.push(o);
        }
      const obs = db.observations.filter(
        (o) => o.eventId === event.id && o.match === n,
      );
      m.redResult = scoreAlliance(obs, b, "red");
      m.blueResult = scoreAlliance(obs, b, "blue");
      // Synthetic scouting uncertainty: published results retain the true cooperative TIP tally.
      for (const o of obs)
        if ((o.team + n) % 7 === 0 && o.tele.tips > 0) {
          o.tele.tips--;
          o.note += " One cooperative TIP was difficult to attribute.";
        }
    }
    for (const [i, t] of numbers.slice(0, eventIndex ? 7 : 12).entries()) {
      const pit: Pit = {
        id: `${event.id}:${t}`,
        updatedAt: stamp,
        eventId: event.id,
        team: t,
        scout: "Avery",
        talkedAt: "09:15",
        photo: "",
        routes: [
          {
            id: `near-${t}`,
            label: "Near · two-cycle",
            start: "Near",
            paths: [
              [
                { x: 12, y: 108 },
                { x: 30, y: 96 },
                { x: 54, y: 78 },
                { x: 62, y: 62 },
                { x: 46, y: 40 },
                { x: 20, y: 35 },
              ],
            ],
          },
          {
            id: `far-${t}`,
            label: "Far · park finish",
            start: "Far",
            paths: [
              [
                { x: 12, y: 24 },
                { x: 34, y: 30 },
                { x: 53, y: 54 },
                { x: 62, y: 70 },
                { x: 31, y: 60 },
                { x: 8, y: 36 },
              ],
            ],
          },
        ],
        answers: {
          leave: true,
          autoPark: i % 2 === 0,
          attemptTip: true,
          autoTipsAvg: 1,
          autoTipsMax: i === 0 ? 2 : 1,
          autoLaunched: 8,
          cellAvg: 1,
          nearSynopsis:
            "Launch preload, collect center POLLEN, return to loading zone.",
          farSynopsis: "One HIVE cycle, then PARK.",
          autoNotes: "Allow the partner to clear the center lane first.",
          teleTipsAvg: i % 4 === 1 ? 2 : 4,
          teleTipsMax: 6,
          gardenAvg: i % 4 === 1 ? 4 : 1,
          flowersAvg: i % 4 === 1 ? 5 : 2,
          topNectar: true,
          bottomBonus: true,
          launchPosition: i % 4 === 1 ? "Perimeter" : "Center",
          accuracy: 4,
          cycleTime: 11,
          zonePreference: "Keep central lane open",
          teleNotes: "Can switch roles when the HIVE lane is blocked.",
          lastPlan: "Take top NECTAR ownership, then PARK.",
          park: true,
          humanPlayer: true,
          lastNotes: "Needs about 8 seconds to park.",
          drive: "Mecanum",
          intake: "POLLEN + own NECTAR",
          mechanism: "Flywheel shooter",
          capacity: 4,
          strategy: i % 4 === 1 ? "FLOWER / GARDEN specialist" : "Offense",
          strengths: "Repeatable launch speed and consistent pickup.",
          weaknesses: "Slower when collecting against the wall.",
          mass: 12.8,
          reliability: "Low",
          reliabilityNotes: "Check intake belt tension between matches.",
          additionalNotes: "Interviewed before qualification round 1.",
          rating: 4,
        },
      };
      db.pits.push(pit);
    }
    numbers
      .filter((t) => t !== 11770)
      .forEach((t, i) =>
        db.picks.push({
          id: `${event.id}:${t}`,
          updatedAt: stamp,
          eventId: event.id,
          team: t,
          tier: i < 3 ? "A" : i < 8 ? "B" : "C",
          order: i,
          available: i !== 4,
          note: i === 0 ? "Strong last-minute ownership game." : "",
        }),
      );
  }
  db.notes.push({
    id: "demo-note",
    updatedAt: stamp,
    eventId: e.id,
    team: 24079,
    text: "Coordinate FLOWER assignments before queueing. Their near auto crosses our center pickup lane.",
    author: "Morgan",
  });
  return db;
}
