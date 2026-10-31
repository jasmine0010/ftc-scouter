import { GAME } from "./game.js";
import { DEMO_STAMP, DEMO_TEAMS } from "./seed.js";
import { type Database, type Entity, type Team } from "./types.js";

const demoEvents = new Set(["demo-la", "demo-league"]);
const demoNames = new Map(DEMO_TEAMS.filter(([number]) => number !== 11770));
const placeholder = (team: Team) =>
  demoNames.get(team.number) === team.name ||
  (team.number === 1 && team.name.trim() === "a");

export function placeholderTeams(db: Database): Set<number> {
  return new Set(db.teams.filter(placeholder).map((team) => team.number));
}

export function createDatabase(stamp = new Date().toISOString()): Database {
  return {
    schemaVersion: 1,
    teams: [
      { id: "11770", number: 11770, name: "Curiosity", updatedAt: stamp },
    ],
    events: [
      {
        id: "local-event",
        name: "New event",
        code: "",
        season: Number(GAME.season.slice(0, 4)),
        teams: [11770],
        thresholds: { ...GAME.thresholds },
        updatedAt: stamp,
      },
    ],
    observations: [],
    boards: [],
    matches: [],
    pits: [],
    notes: [],
    picks: [],
  };
}

/** Tombstones keep older scout exports and sync peers from restoring sample data. */
export function removePlaceholderData(
  source: Database,
  stamp = new Date().toISOString(),
): Database {
  const db = structuredClone(source),
    removed = placeholderTeams(db);
  const retire = (entity: Entity) => {
    if (!entity.deleted) {
      entity.deleted = true;
      entity.updatedAt = stamp;
    }
  };
  const sample = (entity: Entity & { eventId: string }) =>
    demoEvents.has(entity.eventId) && entity.updatedAt === DEMO_STAMP;
  db.teams.filter(placeholder).forEach(retire);
  const retiredMatches = new Set<string>();
  for (const match of db.matches) {
    if (
      sample(match) ||
      [...match.red, ...match.blue].some((number) => removed.has(number))
    ) {
      retiredMatches.add(`${match.eventId}:${match.number}`);
      retire(match);
    }
  }
  for (const board of db.boards)
    if (sample(board) || retiredMatches.has(`${board.eventId}:${board.match}`))
      retire(board);
  for (const key of ["observations", "pits", "notes", "picks"] as const)
    for (const record of db[key])
      if (removed.has(record.team) || sample(record)) retire(record);
  for (const event of db.events) {
    const teams = event.teams.filter((number) => !removed.has(number));
    if (teams.length !== event.teams.length) {
      event.teams = teams;
      event.updatedAt = stamp;
    }
  }
  return db;
}
