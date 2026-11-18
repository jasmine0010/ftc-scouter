# Project handoff: Curiosity BIOBUZZ FTC scouter

This document is for an engineer or coding agent starting with no prior conversation context. It describes the project, its users, the season and game, the design and technical structure, recent work, and practical instructions for continuing safely.

## What FTC is

FIRST Tech Challenge (FTC) is a robotics competition for student teams. Each season has a new game, rules, scoring system, and field. Teams compete in qualification matches as two-team alliances (red or blue). Teams build robots, score game elements, earn ranking points (RPs), and are later considered for alliance selection. At events, teams commonly scout: they observe matches and inspect robots in the pit, record performance and strategy, then use those observations to choose partners and plan matches.

FIRST is the competition's governing organization. Official season manuals and team updates define the rules. The Events API can supply event rosters, schedules, and results when an organization has credentials. Imported official data and human observations have different meanings and must remain distinguishable.

## What this project is

This repository contains the **Curiosity / BIOBUZZ Scout**, a local-first scouting and match-analysis web app for team **11770, Curiosity**, for FTC season **2026–27** and the **BIOBUZZ** game. It is intended for phones and tablets used in noisy, low-connectivity competition venues, as well as desktop analysis after matches.

The app's intended jobs are:

- Record a robot's actions during each match, including AUTO and TELEOP observations and match notes.
- Record pit scouting answers and draw autonomous routes on the official field image.
- Track event teams, schedules, results, and shared field outcomes.
- Summarize team performance, compare pit claims with match observations, estimate contributions, rank teams, and analyze alliance compatibility.
- Keep records on-device when offline, then sync or merge datasets when online.

This is a scouting aid. It is not an official scorekeeper, referee system, robot-control application, or full physics simulation.

## Product references and interaction design

The old scouter at https://scouterftc.web.app/ was the functional and information-architecture reference. The adjacent Curiosity team website in the original workspace was the visual reference. Audit notes and details are in:

- **docs/OLD-SCOUTER-AUDIT.md** — old scouter pages, data, controls, calculations, and feature mapping.
- **docs/DESIGN-AUDIT.md** — team site design tokens and implementation mapping.
- **docs/MAPPING-AND-ASSUMPTIONS.md** — what mapped to BIOBUZZ and what assumptions remain.
- **docs/RULES-RESEARCH.md** — official rule verification and relevant scoring details.
- **docs/API-MAPPING.md** and **docs/references/ftc-events-biobuzz-schema.json** — official API import mapping.
- **docs/VERIFICATION.md** — implementation verification history.

The current visual direction is the Curiosity site's understated red-and-black identity, paired with the familiar old scouter structure. Use the bundled Archivo grotesque sans family. The page background is pure black; neutral dark panels, off-white text, muted gray labels, fine borders, and a restrained red-brown accent establish hierarchy. Current CSS variables in public/style.css are the source of truth: --black: #000, --panel: #070302, --white: #f3f1eb, --red: #802010, --red-hover: #9b2d1b, --muted: #beb9b6, and the line colors. Typography uses Archivo at 18px body size with tabular numerals. Controls should be legible and touch-friendly, with visible keyboard focus. Avoid gradients, glass effects, shadows, decorative emoji, generic feature-card layouts, and color used without meaning.

The app follows the old scouter's four primary sections: **Scout Form**, **Pit Scouting**, **Rankings & Data**, and **Team Profiles**. Event tools live in the header's Event tools menu; Alliance has its own analysis area. Read the README Screens section and the old-scouter audit before changing navigation or removing a feature. User-directed design changes in recent conversation also emphasized compact but legible mobile controls, the same counter component/style between match and pit scouting, and a phone-friendly pit form. Keep the existing interaction patterns unless asked to redesign them.

## Game and rules model

BIOBUZZ game constants are centralized in src/game.ts. Do not copy point values or ranking thresholds into UI components. That module records the official manual version and verification date, point values, RP values, default thresholds, element inventory, timing, field dimensions, and Table 13-1 qualification sort order. The rules were checked against FIRST's BIOBUZZ Competition Manual TU07; official source links and research are recorded in docs/RULES-RESEARCH.md and the README. If FIRST issues a newer Team Update, verify it before modifying the constants.

Relevant model distinctions:

- A HIVE TIP is worth 20 points and releases one staged NECTAR to the alliance.
- LEAVE and PARK are separate robot actions; scoring and SWARM qualification must use the rule module.
- The app tracks per-robot action counts separately from shared end-state counts. Launches/deliveries can exceed the finite field inventory because elements can circulate; final remaining locations are validated against 40 POLLEN and 8 NECTAR of each color.
- FLOWER ownership is per FLOWER and is determined by qualifying NECTAR placement; bottom bonuses are independently tracked for both alliances.
- Fouls award points to the opponent. They are not subtracted from the committing alliance's official score.
- Qualification ranking follows Table 13-1 with average RP, average non-foul alliance score, average TIPs, average AUTO, then a random tiebreak. The app marks otherwise exact ties provisional because it cannot know FIRST's random key.

## Technical setup

This is a typed TypeScript app with **no runtime framework and no third-party browser dependencies**. Node's standard library serves the app and API proxies. TypeScript and Prettier are development dependencies only. The project uses native ES modules and builds source modules into dist/.

Requirements and commands (Node.js 22+, npm; verified with Node 24.19.0):

    npm ci
    npm run dev

Open http://127.0.0.1:8766. The dev command builds once and starts the server. Rebuild after source edits and reload; restart the server after server.mjs changes. Useful project commands:

    npm run check   # TypeScript type check
    npm test        # builds and runs node:test tests
    npm run build   # produce dist/
    npm start       # serve an existing build

PORT changes the port. FIRST API credentials, if ever supplied, belong only in server-process environment variables. Never commit credentials or put them in browser code or exports.

## Code map

- src/app.ts — application shell, top-level navigation and routing.
- src/ui.ts — common accessible controls, counters, field SVG/drawing, image compression and shared rendering helpers.
- src/game.ts — authoritative BIOBUZZ constants.
- src/types.ts — typed records and common constructors.
- src/scoring.ts — validation, action attribution, alliance end-state score and RP logic.
- src/analytics.ts — statistics, OPR-style estimate, standings, forecasts and route conflicts.
- src/storage.ts — IndexedDB, drafts, merge, sync, CSV/JSON.
- src/seed.ts — synthetic multi-event dataset, retained as a test fixture only.
- src/data-cleanup.ts — clean first-run DB and legacy placeholder retirement/tombstoning.
- src/scout.ts — match scouting form and shared field outcome editor.
- src/pit.ts — three-step pit form, fields, route drawing, photo and autosaved draft.
- src/rankings.ts — rankings/data views, match log and rank simulator.
- src/profiles.ts — team directory and team profile views, pit coverage and evidence.
- src/alliance.ts — compatibility, route overlays, head-to-head projection and pick list.
- src/event-data.ts — roster/schedule CSV and FTC Events API import.
- src/reference.ts — quick rules and scoring reference.
- src/presentation.ts — view formatting and reusable presentation calculations.
- public/style.css — all app styling/design tokens.
- public/index.html — app entry, metadata and loading shell.
- public/biobuzz-field.png — official colored BIOBUZZ field image, cropped to the playing field.
- public/archivo-*.ttf and public/ARCHIVO-LICENSE.txt — bundled Archivo weights and license.
- server.mjs — static hosting, serialized sync and credentialed proxies.
- tests/ — Node built-in tests for scoring, rules, imports, and data cleanup.

## Data, sync, and privacy expectations

The canonical database has teams, events, observations, boards, matches, pits, notes, and picks collections. The core types are in src/types.ts. A team is identified by its number; observations are canonical per event/match/team; pits and picks are per event/team; shared board state is stored once per event/match. Tombstones (deleted: true) are retained to stop sync and dataset merges from resurrecting deleted records.

The browser stores data, settings, photos, and drafts in IndexedDB. The service worker caches app assets after the first successful load. Offline use should be checked after that first load. Local records persist before a network request is attempted. The included server merges sync writes into ignored .data/store.json; synchronize device clocks because same-record conflicts use last-write-wins, not field-level merging. Back up .data/ if it contains the team's live data. There is no login or user-level access control; an HTTPS hosted instance is a shared team dataset.

New installations start with only Curiosity (11770) and an empty local event. The app does **not** seed pretend opponents or matches. Event rosters/schedules need to be imported or entered. When modifying storage or merge logic, preserve this clean-start behavior and ensure tombstones continue to dominate stale data.

## Recent completed work

The latest changes were requested to remove every placeholder team, including a manually entered **1 — a** record, and then to make pit average HIVE TIPs integer-only.

### Placeholder cleanup

- src/data-cleanup.ts creates the clean new database and identifies/tombstones seeded opponents and the confirmed 1 — a placeholder. It retires linked sample records and removes retired team numbers from event rosters.
- src/seed.ts still exports sample fixture data for tests; it is not the runtime default.
- src/storage.ts cleans during startup/persistence and protects merge/sync behavior.
- server.mjs cleans the merged server dataset so old clients cannot restore deleted sample records.
- README.md documents clean install and legacy data retirement.
- tests/data-cleanup.test.mjs covers fresh data, related record tombstones, merge non-resurrection, and preservation of real event teams.

The active local .data/store.json was cleaned as well. It retained team 11770 Curiosity, the empty/default event plus the user's second event, and Curiosity's pit record. The 15 seeded opponents and team 1 — a were removed, along with sample observations, matches, notes, picks, and boards. A pre-cleanup backup was made in ignored .data/ storage. Do not restore that backup wholesale unless explicitly requested; it contains the placeholder records that the user asked to delete. Future real team records should remain untouched by cleanup.

### Integer average HIVE TIP fields

autoTipsAvg and teleTipsAvg in src/pit.ts now use the integer number input kind rather than decimal average. The UI renderer maps that field kind to whole-number increments. This change was committed as 4f71317 Use integer steps for average hive tip inputs after cleanup commit 07b7bf9 Retire placeholder teams and disable automatic demo seeding.

The remaining decimal/float pit fields are:

1. Average elements launched (autoLaunched)
2. Average elements left in a CELL (cellAvg)
3. Average GARDEN deliveries (gardenAvg)
4. Average FLOWER placements (flowersAvg)
5. Estimated cycle time in seconds (cycleTime)
6. Robot mass in kg (mass)

These use the average input kind in pitSections; decide with the user before changing their precision because fractional averages and mass/cycle measurements may need decimals. Other quantity-style fields can use specialized input kinds such as capacity or rating, and match action counters are integers.

## Verification already performed

After the recent implementation, npm test passed all 25 tests, npm run build passed, npm run check passed, and git diff --check passed. The app was also opened in the local browser and the team list checked after cleanup. Run the relevant checks again after further source changes; this handoff does not claim that checks have been rerun since any later modifications.

## Workspace cautions for the next agent

- Work in C:\Users\Jasmi\OneDrive\Documents\GitHub\ftc-scouter.
- At handoff time, the only known untracked top-level item is ?? ftc-scouter/. It is pre-existing user data and must not be deleted, staged, or modified as part of unrelated work.
- Check git status --short before and after changes. Recent implementation commits are already present on the current branch; do not amend or rewrite them unless specifically asked.
- Do not seed fake teams to make screenshots look populated. If a review/demo dataset is needed, use a test fixture or an explicitly separate demo mode.
- Be careful with .data/: it contains local team data and a historical pre-cleanup backup. It is ignored by Git, but that does not make its contents disposable.
- Keep official rule values centralized in src/game.ts; do not duplicate constants in UI or analytics code.
- Before changing how imports merge, preserve round-trip support for JSON/CSV, tombstone semantics, local-first operation, and server synchronization.

## Practical next steps for future requests

1. Read the specific audit document relevant to the requested feature and inspect the actual component/module before editing.
2. Identify whether the work affects scoring, storage schema, sync, or just presentation; keep these boundaries clean.
3. Preserve mobile usability, accessible controls, shared counter styling, team-site design tokens, and current information architecture unless the user explicitly requests a redesign.
4. If scoring or ranking behavior changes, verify the current official manual/update and add or adjust focused tests.
5. Run npm run check, npm test, and/or npm run build as appropriate to the requested change, then report what changed and exactly which checks passed.
