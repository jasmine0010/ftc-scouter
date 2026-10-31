import assert from "node:assert/strict";
const base = process.env.SCOUT_TEST_URL ?? "http://127.0.0.1:8766";
const checks = await Promise.all([
  fetch(base).then(async (r) => {
    assert.equal(r.status, 200);
    assert.match(await r.text(), /Curiosity/);
    return "HTML";
  }),
  fetch(base + "/biobuzz-field.png").then((r) => {
    assert.equal(r.status, 200);
    assert.match(r.headers.get("content-type"), /image\/png/);
    return "official field";
  }),
  fetch(base + "/archivo-regular.ttf").then((r) => {
    assert.equal(r.status, 200);
    assert.match(r.headers.get("content-type"), /font\/ttf/);
    return "offline font";
  }),
  fetch(base + "/api/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  }).then((r) => {
    assert.equal(r.status, 400);
    return "invalid sync rejected";
  }),
  fetch(base + "/api/sync", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://unrelated.invalid",
    },
    body: "{}",
  }).then((r) => {
    assert.equal(r.status, 403);
    return "cross-origin sync rejected";
  }),
]);
console.log("Passed:", checks.join(", "));
