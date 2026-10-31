import test from "node:test";
import assert from "node:assert/strict";
import {
  createDatabase,
  removePlaceholderData,
} from "../dist/assets/data-cleanup.js";
import { seedDatabase } from "../dist/assets/seed.js";
import { mergeDatabases, validateDatabase } from "../dist/assets/storage.js";
import { active } from "../dist/assets/types.js";

const stamp = "2026-10-31T16:00:00.000Z";
test("new installations contain our team and no synthetic scouting data", () => {
  const db = createDatabase(stamp);
  validateDatabase(db);
  assert.deepEqual(
    db.teams.map((team) => team.number),
    [11770],
  );
  assert.equal(db.events.length, 1);
  for (const key of [
    "observations",
    "boards",
    "matches",
    "pits",
    "notes",
    "picks",
  ])
    assert.equal(db[key].length, 0);
});

test("placeholder cleanup removes linked records but preserves real teams and edited scouting", () => {
  const db = seedDatabase();
  db.teams.push({ id: "1", number: 1, name: "a", updatedAt: stamp });
  db.teams.push({
    id: "98765",
    number: 98765,
    name: "Actual team",
    updatedAt: stamp,
  });
  db.events[0].teams.push(1, 98765);
  const ownPit = db.pits.find((pit) => pit.team === 11770);
  ownPit.updatedAt = stamp;
  ownPit.answers.autoNotes = "Actual interview notes";
  db.pits.push({ ...structuredClone(ownPit), id: "test-pit", team: 1 });
  const cleaned = removePlaceholderData(db, stamp);
  validateDatabase(cleaned);
  assert.deepEqual(
    active(cleaned.teams).map((team) => team.number),
    [11770, 98765],
  );
  assert.equal(active(cleaned.matches).length, 0);
  assert.equal(active(cleaned.observations).length, 0);
  assert.equal(active(cleaned.boards).length, 0);
  assert.equal(active(cleaned.picks).length, 0);
  assert.equal(active(cleaned.pits).length, 1);
  assert.equal(
    active(cleaned.pits)[0].answers.autoNotes,
    "Actual interview notes",
  );
  assert.deepEqual(cleaned.events[0].teams, [11770, 98765]);
  assert.deepEqual(
    removePlaceholderData(cleaned, "2026-11-01T12:00:00.000Z"),
    cleaned,
  );
  assert.equal(
    db.teams.some((team) => team.deleted),
    false,
  );
});

test("older synchronized samples cannot resurrect retired teams", () => {
  const old = seedDatabase();
  const cleaned = removePlaceholderData(old, stamp);
  const merged = mergeDatabases(cleaned, old);
  assert.deepEqual(
    active(merged.teams).map((team) => team.number),
    [11770],
  );
  assert.equal(active(merged.matches).length, 0);
});

test("real imported names sharing demo team numbers remain intact", () => {
  const db = seedDatabase();
  const team = db.teams.find((team) => team.number === 21380);
  team.name = "Imported official name";
  team.updatedAt = stamp;
  assert.equal(
    active(removePlaceholderData(db, stamp).teams).some(
      (team) => team.number === 21380,
    ),
    true,
  );
});
