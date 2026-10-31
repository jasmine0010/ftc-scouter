# Verification

## Automated

- `npm test`: **21 passing domain / import tests**. Includes legal scoring periods, early-NECTAR foul separation, opponent foul credits, shared FLOWER ownership and dual bottom bonuses, no double counting of shared end-state credit, finite final inventories, recycled cumulative action counts, RP equality boundaries, custom thresholds, known-fixture ridge OPR, all qualification tiebreaks, surrogate exclusion, DQ zeros, statistics, deterministic forecasts, pit-prior decay, CSV round trips, canonical/idempotent merges, official-result precedence, route crossings/shared segments, and the exact BIOBUZZ API adapter.
- `npm run build`: passes strict TypeScript compilation and emits the static application plus a versioned service worker cache.
- `node --check server.mjs` and generated `dist/sw.js`: pass.
- `node scripts/smoke.mjs` against the running local server: HTML, official field PNG, self-hosted font MIME types, invalid sync rejection and cross-origin sync rejection pass.

## Browser checks

Tested through the desktop app browser at **390 × 844** and **1280 × 900**.

- Match counter + HIVE TIP / LEAVE updates live score to 23; phone layout has no document-level horizontal overflow.
- Match draft survives reload. Stopped the server and reloaded: cached app and saved draft remain available, and sync correctly changes to pending. Restarted the server afterward.
- Pit number lookup autofills a known team and opens its existing record. Next / Previous retain step state. Quantity inputs are numeric.
- Draw a vector stroke with pointer input, verify stroke count increases, undo and verify count returns. Save an existing pit record and confirm navigation to the combined profile.
- Profile shows pit/match disagreement and changes its trend series when a scoring category is selected. Team note dialog updates its 500-character count; Cancel leaves notes unchanged.
- Route overlay renders both routes and conflict markers. Exported a PNG and visually inspected it: official field, both paths and markers are present.
- Four-team head-to-head produces scores, win probability and tie probability. Pick-list keyboard reorder changes the order; restored the original order. Availability/tier/note controls are present.
- Rank simulator shows a non-degenerate final-rank histogram and remaining-match count.
- Complete JSON and CSV export and re-import through the file chooser succeeds without duplicate records; original event observation counts remain 96 and 48.
- Missing FTC API credentials produce the explicit CSV/environment fallback message.

## Limits of verification

No FTC Events username/token was supplied, so a live authenticated event import could not be exercised. API normalization is tested against verified Swagger field names and a representative fixture. No cloud shared service was deployed; included Node sync is verified locally. Forecast quality requires real event evidence. Tablet stylus hardware was not available; the editor uses Pointer Events and pointer capture, and its mouse route/undo flow was exercised.
