import test from "node:test";
import assert from "node:assert/strict";
import { mergeDatabases, teamRecords } from "../dist/assets/storage.js";
import { createDatabase } from "../dist/assets/data-cleanup.js";
import { active, blankObservation } from "../dist/assets/types.js";

const stamp = "2026-11-01T00:00:00.000Z";
const later = "2026-11-02T00:00:00.000Z";

function dataset() {
  const db = createDatabase(stamp);
  const event = db.events[0].id;
  const obs = (team, match, eventId = event) => ({
    ...blankObservation(eventId, team, match),
    id: `o-${team}-${match}-${eventId}`,
    updatedAt: stamp,
  });
  db.observations.push(
    obs(1177, 1),
    obs(1177, 2),
    obs(24079, 1),
    obs(1177, 1, "other"),
  );
  db.notes.push(
    {
      id: "n1",
      team: 1177,
      eventId: event,
      text: "fast",
      author: "",
      updatedAt: stamp,
    },
    {
      id: "n2",
      team: 24079,
      eventId: event,
      text: "slow",
      author: "",
      updatedAt: stamp,
    },
  );
  return { db, event };
}

test("Delete team collects only that team's records at that event", () => {
  const { db, event } = dataset();
  const r = teamRecords(db, 1177, event);
  assert.deepEqual(r.observations.map((o) => o.id).sort(), [
    `o-1177-1-${event}`,
    `o-1177-2-${event}`,
  ]);
  assert.deepEqual(
    r.notes.map((n) => n.id),
    ["n1"],
  );
  assert.equal(r.pits.length, 0);
});

test("a deletion syncs: it beats an older copy from another phone", () => {
  const phoneA = dataset().db;
  const phoneB = structuredClone(phoneA);
  const note = phoneA.notes.find((n) => n.id === "n1");
  Object.assign(note, { deleted: true, updatedAt: later });
  for (const merged of [
    mergeDatabases(phoneA, phoneB),
    mergeDatabases(phoneB, phoneA),
  ]) {
    assert.ok(!active(merged.notes).some((n) => n.id === "n1"));
    assert.ok(active(merged.notes).some((n) => n.id === "n2"));
  }
});
