import test from "node:test";
import assert from "node:assert/strict";
import {
  routeIsEmpty,
  routeSequence,
  undoRouteStep,
} from "../dist/assets/types.js";

const route = () => ({
  id: "r",
  label: "Route 1",
  start: "",
  paths: [[{ x: 1, y: 1 }], [{ x: 2, y: 2 }]],
  marks: [
    { x: 5, y: 5, type: "intake", at: 1 },
    { x: 6, y: 6, type: "launch", at: 2 },
  ],
});

test("strokes and AUTO marks share one numbered order", () => {
  const steps = routeSequence(route());
  assert.deepEqual(
    steps.map((s) => (s.kind === "path" ? `p${s.n}` : `${s.mark.type}${s.n}`)),
    ["p1", "intake2", "p3", "launch4"],
  );
});

test("routes saved before marks still sequence", () => {
  const r = route();
  delete r.marks;
  assert.equal(routeSequence(r).length, 2);
  assert.equal(routeIsEmpty(r), false);
});

test("undo removes whichever step was added last", () => {
  const r = route();
  undoRouteStep(r);
  assert.equal(r.marks.length, 1);
  assert.equal(r.paths.length, 2);
  undoRouteStep(r);
  assert.equal(r.paths.length, 1);
  undoRouteStep(r);
  assert.equal(r.marks.length, 0);
  undoRouteStep(r);
  assert.ok(routeIsEmpty(r));
});

test("the starting spot is undone last and counts as content", () => {
  const r = {
    id: "s",
    label: "Route 1",
    start: "",
    paths: [[{ x: 1, y: 1 }]],
    origin: { x: 20, y: 20 },
  };
  assert.equal(routeIsEmpty({ ...r, paths: [] }), false);
  undoRouteStep(r);
  assert.equal(r.paths.length, 0);
  assert.deepEqual(r.origin, { x: 20, y: 20 });
  undoRouteStep(r);
  assert.equal(r.origin, undefined);
  assert.ok(routeIsEmpty(r));
});
