import test from "node:test";
import assert from "node:assert/strict";
import { GAME } from "../dist/assets/game.js";
import { blankBoard, blankObservation, phase } from "../dist/assets/types.js";
import {
  achievementRP,
  resultRP,
  scoreObservation,
  scoreAlliance,
  validateBoard,
  validateObservation,
  deriveResults,
} from "../dist/assets/scoring.js";
import {
  estimateOPR,
  sortQualification,
  standings,
  summary,
  teamStats,
  simulateRanks,
  routeConflicts,
  strength,
  allianceProjection,
  headToHead,
} from "../dist/assets/analytics.js";
import {
  mergeDatabases,
  validateDatabase,
  exportCSV,
  datasetFromCSV,
  parseCSV,
} from "../dist/assets/storage.js";
import { seedDatabase } from "../dist/assets/seed.js";
import { officialToCSV } from "../dist/assets/event-data.js";
const approx = (a, b, t = 0.000001) =>
  assert.ok(Math.abs(a - b) < t, `${a} is not near ${b}`);
test("phase scoring uses only permitted BIOBUZZ achievements", () => {
  const o = blankObservation("e", 1);
  Object.assign(o.auto, {
    leave: true,
    park: true,
    tips: 2,
    pollen: 30,
    nectar: 6,
    cell: 4,
    flower: 5,
    garden: 5,
  });
  Object.assign(o.tele, { park: true, tips: 3, cell: 4, flower: 7, garden: 6 });
  o.bottom = 2;
  const s = scoreObservation(o);
  assert.equal(s.auto, 48);
  assert.equal(s.tele, 103);
  assert.equal(s.total, 151);
  assert.equal(s.movement, 13);
  assert.equal(s.tips, 5);
});
test("placement and launch action counts are not final-state points", () => {
  const o = blankObservation("e", 1);
  o.tele.flowerPlaced = 80;
  o.tele.gardenDelivered = 90;
  o.tele.pollen = 100;
  o.tele.nectar = 20;
  assert.equal(scoreObservation(o).total, 0);
  assert.deepEqual(validateObservation(o), []);
});
test("fouls credit opponent; own earned score stays intact and net is labeled separately", () => {
  const a = blankObservation("e", 1),
    b = blankObservation("e", 2);
  a.auto.tips = 1;
  a.minor = 1;
  a.major = 1;
  a.earlyNectar = 2;
  b.alliance = "blue";
  const board = blankBoard("e", 1);
  const own = scoreObservation(a);
  assert.equal(own.total, 20);
  assert.equal(own.penalties, 65);
  assert.equal(own.net, -45);
  assert.equal(scoreAlliance([a, b], board, "red").score, 20);
  assert.equal(scoreAlliance([a, b], board, "blue").score, 65);
});
test("shared FLOWER ownership scores ALL colors for owner; both bottom bonuses can coexist", () => {
  const b = blankBoard("e", 1);
  b.flowers[0] = {
    pollen: 3,
    redNectar: 1,
    blueNectar: 1,
    owner: "red",
    bottomRed: true,
    bottomBlue: true,
  };
  assert.deepEqual(validateBoard(b), []);
  assert.equal(scoreAlliance([], b, "red").score, 15);
  assert.equal(scoreAlliance([], b, "blue").score, 5);
});
test("alliance scorer ignores duplicated per-robot final-state attribution", () => {
  const a = blankObservation("e", 1),
    b = blankObservation("e", 2),
    board = blankBoard("e", 1);
  a.tele.flower = 8;
  b.tele.flower = 8;
  a.bottom = 2;
  b.bottom = 2;
  board.flowers[0] = {
    pollen: 4,
    redNectar: 1,
    blueNectar: 0,
    owner: "red",
    bottomRed: true,
    bottomBlue: false,
  };
  assert.equal(scoreAlliance([a, b], board, "red").score, 15);
});
test("inventory validation spans every final location, independently by element color", () => {
  const b = blankBoard("e", 1);
  b.redCell.pollen = GAME.inventory.pollen;
  b.blueGarden.pollen = 1;
  assert.ok(validateBoard(b).some((e) => e.includes("pollen")));
  b.blueGarden.pollen = 0;
  b.redCell.redNectar = 9;
  assert.ok(validateBoard(b).some((e) => e.includes("redNectar")));
  b.redCell.redNectar = 8;
  assert.deepEqual(validateBoard(b), []);
});
test("FLOWER owner and bottom bonus require matching NECTAR", () => {
  const b = blankBoard("e", 1);
  b.flowers[0].owner = "red";
  b.flowers[0].bottomBlue = true;
  assert.equal(validateBoard(b).length, 2);
});
test("RP threshold equality and both independent pollinator thresholds", () => {
  assert.equal(achievementRP(15, 3), 0);
  assert.equal(achievementRP(16, 4), 2);
  assert.equal(achievementRP(16, 7), 3);
  assert.equal(achievementRP(0, 7), 2);
  assert.equal(
    achievementRP(16, 7, { swarm: 20, pollinator1: 8, pollinator2: 10 }),
    0,
  );
  assert.equal(resultRP(101, 100), 3);
  assert.equal(resultRP(100, 100), 1);
  assert.equal(resultRP(99, 100), 0);
});
test("bad numeric, missing and duplicate observation fields are rejected", () => {
  const o = blankObservation("e", 1);
  o.auto.tips = -1;
  assert.ok(validateObservation(o).length);
  o.auto.tips = NaN;
  assert.ok(validateObservation(o).length);
  delete o.auto.tips;
  assert.ok(validateObservation(o).length);
  o.auto.tips = 1;
  const db = seedDatabase();
  const existing = db.observations[0];
  assert.ok(
    validateObservation({ ...existing, id: "another-id" }, db).some((e) =>
      e.includes("already"),
    ),
  );
});
test("ridge OPR recovers a known full-rank fixture and handles no or sparse data", () => {
  const teams = [1, 2, 3, 4],
    truth = { 1: 30, 2: 50, 3: 70, 4: 90 },
    rows = [];
  for (let i = 0; i < 4; i++)
    for (let j = i + 1; j < 4; j++)
      rows.push({
        teams: [teams[i], teams[j]],
        score: truth[teams[i]] + truth[teams[j]],
      });
  const fit = estimateOPR(teams, rows, {}, 0);
  for (const team of teams) approx(fit[team], truth[team]);
  assert.deepEqual(estimateOPR([1, 2], [], { 1: 45, 2: 70 }), { 1: 45, 2: 70 });
  const sparse = estimateOPR(
    [1, 2],
    [{ teams: [1, 2], score: 100 }],
    { 1: 40, 2: 40 },
    1,
  );
  approx(sparse[1], sparse[2]);
  assert.ok(sparse[1] > 40 && sparse[1] < 50);
});
test("qualification sorting follows every Table 13-1 tiebreak in order", () => {
  const row = {
    played: 4,
    rankingScore: 3,
    averageNonFoulScore: 200,
    averageTips: 5,
    averageAuto: 40,
    randomTiebreak: 9,
  };
  const rows = [
    { ...row, team: 1 },
    { ...row, team: 2, rankingScore: 4 },
    { ...row, team: 3, averageNonFoulScore: 201 },
    { ...row, team: 4, averageTips: 6 },
    { ...row, team: 5, averageAuto: 41 },
    { ...row, team: 6, randomTiebreak: 1 },
  ];
  assert.deepEqual(
    sortQualification(rows).map((r) => r.team),
    [2, 3, 4, 5, 6, 1],
  );
});
test("surrogates excluded; DQ contributes zero; foul credits excluded from sort points", () => {
  const db = seedDatabase(),
    e = db.events[0];
  e.teams = [1, 2, 3, 4];
  db.matches = [
    {
      id: "m",
      updatedAt: new Date().toISOString(),
      eventId: e.id,
      number: 1,
      red: [1, 2],
      blue: [3, 4],
      played: true,
      surrogate: [2],
      dq: [4],
      redResult: {
        score: 200,
        foulPoints: 20,
        movement: 16,
        tips: 7,
        auto: 50,
      },
      blueResult: {
        score: 150,
        foulPoints: 5,
        movement: 10,
        tips: 3,
        auto: 30,
      },
    },
  ];
  const rows = standings(db, e);
  const one = rows.find((r) => r.team === 1),
    two = rows.find((r) => r.team === 2),
    four = rows.find((r) => r.team === 4);
  assert.equal(one.rankingScore, 6);
  assert.equal(one.averageNonFoulScore, 180);
  assert.equal(two.played, 0);
  assert.equal(four.played, 1);
  assert.equal(four.rankingScore, 0);
  assert.equal(four.averageAuto, 0);
});
test("population statistics return correct median and SD, including empty samples", () => {
  const s = summary([10, 20, 30, 40]);
  assert.equal(s.average, 25);
  assert.equal(s.median, 25);
  assert.equal(s.best, 40);
  approx(s.sd, Math.sqrt(125));
  assert.equal(summary([]).sd, 0);
});
test("seed has reviewable, valid multi-event data and deterministic simulations", () => {
  const db = seedDatabase();
  validateDatabase(db);
  const e = db.events[0];
  assert.equal(e.teams.length, 16);
  assert.equal(db.matches.length, 72);
  assert.equal(db.observations.length, 144);
  assert.deepEqual(
    simulateRanks(db, e, 11770, 20),
    simulateRanks(db, e, 11770, 20),
  );
  const p = allianceProjection(db, [11770, 24079], e.id, e.thresholds, 20);
  assert.ok(p.score > 0 && p.rp.every((v) => v >= 0 && v <= 1));
  const h = headToHead(db, [11770, 24079], [21380, 3526], e, 30);
  assert.ok(h.win >= 0 && h.win <= 1);
});
test("pit prior shrinks as scouting evidence grows", () => {
  const db = seedDatabase(),
    e = db.events[0];
  const prior = strength(db, 11770, e.id);
  db.observations = db.observations.filter(
    (o) => o.team !== 11770 || o.eventId !== e.id,
  );
  const noMatches = strength(db, 11770, e.id);
  assert.equal(noMatches.pitWeight, 1);
  assert.ok(prior.pitWeight < noMatches.pitWeight);
  assert.equal(noMatches.sample, 0);
});
test("CSV roundtrip preserves photos, vectors, multiline notes and quotes", () => {
  const db = seedDatabase();
  db.notes[0].text = 'Line one, "quoted"\nLine two';
  db.pits[0].photo = "data:image/jpeg;base64,YWJj";
  db.observations[0].autoLaunchPosition = "Far";
  const imported = datasetFromCSV(exportCSV(db));
  assert.deepEqual(imported, db);
  assert.deepEqual(parseCSV('a,b\r\n"x,y","z""q"\r\n'), [
    { a: "x,y", b: 'z"q' },
  ]);
});
test("merge is idempotent and canonical team/match identity resolves device duplicates", () => {
  const a = seedDatabase(),
    b = structuredClone(a);
  b.observations[0].id = "different-device";
  b.observations[0].updatedAt = "2026-11-01T00:00:00.000Z";
  b.observations[0].note = "Updated scout note";
  const out = mergeDatabases(a, b);
  assert.equal(out.observations.length, a.observations.length);
  assert.equal(
    out.observations.find(
      (o) =>
        o.team === b.observations[0].team &&
        o.match === b.observations[0].match &&
        o.eventId === b.observations[0].eventId,
    ).note,
    "Updated scout note",
  );
  assert.deepEqual(mergeDatabases(out, b), out);
});
test("official results take precedence over a conflicting scouted board", () => {
  const db = seedDatabase(),
    m = db.matches[0];
  const old = m.redResult.score;
  db.boards[0].redCell.pollen = 30;
  assert.equal(deriveResults(m, db).red.score, old);
  assert.equal(deriveResults(m, db).official, true);
});
test("route overlays identify true intersections", () => {
  const route = (paths) => ({ id: "r", label: "route", start: "Near", paths });
  const hits = routeConflicts(
    route([
      [
        { x: 10, y: 10 },
        { x: 100, y: 100 },
      ],
    ]),
    route([
      [
        { x: 10, y: 100 },
        { x: 100, y: 10 },
      ],
    ]),
  );
  assert.equal(hits.length, 1);
  approx(hits[0].x, 55);
});
test("route overlays also flag shared collinear segments", () => {
  const route = (paths) => ({ id: "r", label: "route", start: "Near", paths });
  assert.equal(
    routeConflicts(
      route([
        [
          { x: 10, y: 10 },
          { x: 80, y: 10 },
        ],
      ]),
      route([
        [
          { x: 40, y: 10 },
          { x: 100, y: 10 },
        ],
      ]),
    ).length,
    1,
  );
  assert.equal(
    routeConflicts(
      route([
        [
          { x: 10, y: 10 },
          { x: 30, y: 10 },
        ],
      ]),
      route([
        [
          { x: 40, y: 10 },
          { x: 100, y: 10 },
        ],
      ]),
    ).length,
    0,
  );
});
test("official BIOBUZZ adapter maps verified Swagger names, RP, DQ and surrogates", () => {
  const alliance = (alliance, totalPoints, preFoulTotal) => ({
    alliance,
    totalPoints,
    preFoulTotal,
    autoLeavePoints: 6,
    autoParkPoints: 5,
    teleopParkPoints: 10,
    autoHiveTips: 2,
    teleopHiveTips: 5,
    autoPoints: 51,
    swarmRP: true,
    pollinator1RP: true,
    pollinator2RP: true,
  });
  const payload = {
    teams: {
      teams: [
        { teamNumber: 1, nameShort: "One" },
        { teamNumber: 2, nameShort: "Two" },
        { teamNumber: 3, nameShort: "Three" },
        { teamNumber: 4, nameShort: "Four" },
      ],
    },
    schedule: {
      schedule: [
        {
          matchNumber: 1,
          series: 0,
          tournamentLevel: "QUALIFICATION",
          teams: [
            { teamNumber: 1, station: "Red1", surrogate: true },
            { teamNumber: 2, station: "Red2" },
            { teamNumber: 3, station: "Blue1", dq: true },
            { teamNumber: 4, station: "Blue2" },
          ],
        },
      ],
    },
    scores: {
      matchScores: [
        {
          matchNumber: 1,
          matchSeries: 0,
          matchLevel: "QUALIFICATION",
          alliances: [alliance("Red", 250, 230), alliance("Blue", 230, 225)],
        },
      ],
    },
  };
  const converted = officialToCSV(payload),
    row = parseCSV(converted.schedule)[0];
  assert.equal(row.redScore, "250");
  assert.equal(row.redFoul, "20");
  assert.equal(row.redMovement, "21");
  assert.equal(row.redTips, "7");
  assert.equal(row.redRP, "6");
  assert.equal(row.blueRP, "3");
  assert.equal(row.surrogate, "1");
  assert.equal(row.dq, "3");
  assert.equal(parseCSV(converted.teams).length, 4);
});
