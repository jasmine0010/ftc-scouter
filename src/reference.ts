import { GAME } from "./game.js";
import type { Event } from "./types.js";
import { section, table } from "./ui.js";
export function renderReference(root: HTMLElement, event: Event) {
  const p = GAME.points;
  root.innerHTML = `<div class="page-heading"><div><p class="eyebrow">FIELD REFERENCE / ${GAME.manualVersion}</p><h1>BIOBUZZ reference.</h1><p class="lede">Verified ${GAME.verified} · FIRST Competition Manual, sections 10.5 and 13.6.3.</p></div><a class="button" href="${GAME.manual}" target="_blank" rel="noreferrer">Official manual ↗</a></div>${section(
    "Point values",
    table(
      ["Achievement", "AUTO", "TELEOP", "Assessment"],
      [
        [
          "HIVE TIP",
          String(p.tip),
          String(p.tip),
          "Completed tip; credit once",
        ],
        [
          "LEAVE",
          String(p.leave),
          "—",
          "No longer contacting the perimeter wall",
        ],
        [
          "PARK",
          String(p.park),
          String(p.park),
          "At least partially in the LOADING ZONE",
        ],
        [
          "Element remaining in upward CELL",
          "—",
          String(p.cell),
          "Final field state",
        ],
        [
          "Element in owned FLOWER",
          "—",
          String(p.flower),
          "Every qualifying element counts for the owner",
        ],
        [
          "Bottom NECTAR bonus",
          "—",
          String(p.bottom),
          "Per alliance per FLOWER",
        ],
        [
          "Element in alliance GARDEN",
          "—",
          String(p.garden),
          "Either color NECTAR or POLLEN counts",
        ],
        ["Minor foul", "—", String(p.minor), "Credited to opponent"],
        [
          "Major / early NECTAR foul",
          "—",
          String(p.major),
          "Credited to opponent",
        ],
      ],
      "BIOBUZZ point values",
    ),
  )}${section(
    "Ranking points",
    table(
      ["Achievement", "This event", "RP"],
      [
        [
          "SWARM",
          `≥ ${event.thresholds.swarm} combined LEAVE + PARK points`,
          String(GAME.rp.achievement),
        ],
        [
          "POLLINATOR 1",
          `≥ ${event.thresholds.pollinator1} HIVE TIPs`,
          String(GAME.rp.achievement),
        ],
        [
          "POLLINATOR 2",
          `≥ ${event.thresholds.pollinator2} HIVE TIPs`,
          String(GAME.rp.achievement),
        ],
        ["Win", "More final points", String(GAME.rp.win)],
        ["Tie", "Equal final points", String(GAME.rp.tie)],
      ],
      "Ranking point thresholds",
    ),
  )}${section("FLOWER ownership", `<div class="prose"><p>The top-most qualifying NECTAR determines ownership. That alliance scores every qualifying element in that FLOWER. Record all four FLOWERs separately.</p><p>Track each alliance’s bottom-NECTAR bonus independently. Both alliances can earn that bonus in the same FLOWER.</p><p>FLOWER scoring opens with ${GAME.limits.flowerSeconds} seconds left. G410 specifically penalizes early NECTAR, at one major per element. Early elements still score; record the foul separately.</p></div>`)}${section("Inventory & human player", `<div class="prose"><p>${GAME.inventory.pollen} POLLEN, ${GAME.inventory.redNectar} red NECTAR and ${GAME.inventory.blueNectar} blue NECTAR exist. A robot may control at most ${GAME.limits.possession} elements at once. Launch and delivery totals can exceed inventory through recycling; final locations cannot.</p><p>Each HIVE TIP releases permission for one additional staged NECTAR; remaining NECTAR can enter when 60 seconds remain. NECTAR enters through the LOADING ZONE and must contact its TILE before a robot or field element.</p></div>`)}${section("Qualification order", `<ol class="rules-list"><li>Average RP across eligible qualification matches.</li><li>Average alliance points excluding foul credits.</li><li>Average HIVE TIPs.</li><li>Average AUTO points.</li><li>FIRST’s random tie order.</li></ol><p class="hint">Exclude surrogate matches. A disqualified team contributes zero to every sort criterion. Official results override scouted shared outcomes.</p>`)}<p class="source-note">Source: <a href="${GAME.manual}" target="_blank" rel="noreferrer">FIRST BIOBUZZ Competition Manual ${GAME.manualVersion}</a>. Championship thresholds may change; edit them per event in Event data. Local model assumptions are documented in the README.</p>`;
}
