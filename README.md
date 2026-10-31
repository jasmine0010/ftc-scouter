# Curiosity / BIOBUZZ Scout

Typed, local-first FTC 2026–27 scouting and match analysis, using the design language of the adjacent `curiosity11770` team website. No runtime framework or third-party browser dependencies. Archivo fonts and FIRST's field graphic are bundled for offline use.

## Run

Requires Node.js 22 or newer and npm. Verified with Node 24.19.0.

```sh
npm ci
npm run dev
```

Open **http://127.0.0.1:8766**. `dev` builds once and starts the standard-library Node server; after source edits, run `npm run build` and reload. Restart the server after changing `server.mjs`. `PORT` changes the port. `npm start` serves an existing build. No account is required.

```sh
npm run check
npm test
npm run build
```

The first visit starts with Curiosity (11770) and an empty event. Import an event roster and schedule in Event data. Legacy placeholder teams and their sample records are retired automatically; deletion markers prevent older devices or exports from restoring them. The synthetic dataset in `src/seed.ts` is retained only as a test fixture.

## Screens

The four top tabs follow the previous scouter: Scout Form, Pit Scouting, Rankings & Data, Team Profiles. Event tools in the header contains event selection, our team number, Alliance, standings, the rank simulator, pit coverage, imports and Reference.

- **Rankings & data:** Teams and Matches views with shared filters and sortable tables. Match records include score breakdowns and the event schedule.
- **Scout form:** one scrolling form in the legacy section order, with a live score above it and Save below; one canonical observation per team/match/event, accessible steppers, explicit early-NECTAR fouls, breakdowns, loading notes and compatibility observations. A separate shared field-outcome editor records four FLOWERs plus both CELL and GARDEN totals.
- **Pit scouting:** team info → vector field drawing → questionnaire, in the old section sequence. Known teams autofill; existing pit records open for editing. Every quantity is numeric. Photos compress to JPEG at up to 1000px. Named routes support touch/stylus, undo, clear and PNG export.
- **Team profiles:** category mean/median/best/population SD, selectable category trends, OPR-style comparison, pit/match disagreements, pit answers, route drawings, notes and optional online FTCScout enrichment. Season view combines match evidence and notes across events; OPR stays event-specific.
- **Alliance desk:** partner projections and RP probabilities, role complementarity, route overlays, four-team head-to-head simulation, editable pick tiers, taken/available status, drag ordering and keyboard reorder buttons.
- **Event data:** multiple events, editable RP thresholds, official API import, manual roster/schedule CSV, complete dataset JSON/CSV merge/export, and sync status.
- **Reference:** current point values, event-specific RP thresholds and rule reminders with FIRST links.

## Audit deliverables

- [Old scouter inventory](docs/OLD-SCOUTER-AUDIT.md): every observed page, entity, input/choice and calculation, with observed defects and unknown formulas distinguished.
- [Team design inventory](docs/DESIGN-AUDIT.md): source files, exact palette, typography, spacing, borders, controls, motion and breakpoints; stack and implementation decisions.
- [Rules research](docs/RULES-RESEARCH.md), [API mapping](docs/API-MAPPING.md), and the [verified API schema subset](docs/references/ftc-events-biobuzz-schema.json).
- [Mapping and assumptions](docs/MAPPING-AND-ASSUMPTIONS.md).

## Change season rules

`src/game.ts` is the single source for scoring point values, RP values, default achievement thresholds, inventory, timing and field limits. It records **TU07, October 29, 2026**, verified October 30. Recheck FIRST's latest English manual before changing it, then run the tests.

Event data overrides the SWARM / POLLINATOR thresholds separately for each event. Championship values are not silently guessed. Rankings follow Table 13-1: average RP, average alliance score excluding foul credits, average TIPs, average AUTO, then random ordering. The app marks otherwise exact ties provisional because FIRST's random tie key is unavailable. Surrogate matches are excluded; DQs receive zero in all sort criteria.

Fouls add to the opponent's official score. The form displays earned points with an Auto/Teleop/End breakdown; fouls remain separate in match data. Never subtract fouls from the official score of the committing alliance.

## Actions versus final state

POLLEN and NECTAR can circulate through the HIVE more than once. Cumulative launch and delivery counts may exceed inventory. The app validates the **sum of final locations**, independently for 40 POLLEN, 8 red NECTAR and 8 blue NECTAR. Unscored elements may remain on the floor.

Per-robot placements and deliveries are action counts, not automatically score. Separate attributed final CELL/FLOWER/GARDEN counts support individual contribution estimates. Team attribution is a scouting judgment; it is not an official robot score.

Shared board snapshots are stored **once per event/match**. Each FLOWER records owner, POLLEN and both NECTAR counts, plus independent bottom bonuses for each alliance. The snapshot determines alliance end-state scoring once; partner observation counts are never added again. A confirmed shared board and all four observations are needed to derive a scouted alliance result. Imported official results have precedence.

## Import event data

### Official FTC Events API

Use the [FIRST API registration](https://ftc-events.firstinspires.org/services/API) to obtain a username and token. Configure them in the **server process environment**, never the browser, Git, a public `.env` file or exported datasets. In PowerShell:

```powershell
$env:FTC_API_USERNAME = 'your-api-username'
$env:FTC_API_TOKEN = 'your-api-token'
npm start
```

Set the season **start year** (2026) and official event code in Event data, save, and choose **Import from FTC Events API**. The same-origin `/api/ftc` proxy requests roster, hybrid qualification schedule and BIOBUZZ score detail. Mapping is based on the checked-in official Swagger schema. It preserves surrogate/DQ flags and original score arrays; undocumented FLOWER array orientation is not guessed. FIRST upload delays can leave future or recent results unavailable. No credentials were supplied during development, so live authenticated ingestion is unverified; its mapping is covered by a schema-based fixture test.

Optional FTCScout enrichment uses a separate same-origin proxy. Missing 2026–27 statistics are displayed as unavailable; external averages and awards never replace scouted observations.

### Roster CSV

```csv
number,name
11770,Curiosity
24079,Partner team
```

### Schedule / official results CSV

Download the template in Event data. Required schedule columns:

```csv
match,red1,red2,blue1,blue2,redScore,blueScore,redFoul,blueFoul,redMovement,blueMovement,redTips,blueTips,redAuto,blueAuto,redRP,blueRP,surrogate,dq
1,11770,24079,21380,3526,250,230,20,5,21,16,7,6,51,40,,,24079,
2,21380,11770,3526,24079,,,,,,,,,,,,,,
```

Leave both scores blank for future matches. Completed matches require final score, **received foul-credit points**, combined LEAVE/PARK movement points, TIP count and AUTO points for each alliance. Optional RP values override the locally calculated RP; otherwise thresholds and win/tie points apply. Use `|` between multiple surrogate or DQ team numbers. Import is validated before schedule records are written. Existing match numbers are updated within that event.

### Scout datasets

**Export all JSON** and **Export all CSV** are lossless and can be merged back. Dataset CSV has `collection,id,updatedAt,data`; the JSON `data` cell preserves nested vectors, photos and all scoring fields. RFC-style quoted commas, quotes and newlines are supported. The separate match-log observation CSV is for human analysis, not the complete import format.

Merges resolve observations by event/match/team, pits and picks by event/team, teams by number, and other entities by ID. The newest timestamp wins; exact timestamp ties use deterministic serialized ordering. Repeated imports are idempotent. Synchronize device clocks before the event. Concurrent edits to the **same** canonical record use last-write-wins rather than field-level merging; export disputed versions before reconciling them.

## Offline storage and sync

Records, compressed photos, settings and drafts live in IndexedDB. The service worker caches the app, modules, fonts and field graphic after the first successful load. Test offline **after** that first load. Service workers require HTTPS or localhost; plain HTTP on a LAN address does not provide the offline page cache.

The included server's `/api/sync` endpoint merges datasets into ignored `.data/store.json`. Local writes finish before network sync; failed requests show **Local · sync pending** and retry on reconnect and every 30 seconds. The server serializes writes, and browser persistence merges existing state within a transaction so multiple tabs do not overwrite unrelated records. Keep `.data/` backed up for a hosted team server.

The server binds localhost by default. For multiple scouts, run it behind a team-controlled HTTPS host/reverse proxy; set `HOST` only for the intended deployment. There is no user/account permission system; this is a shared team dataset. A static `dist/` deployment supports local scouting and export/merge; automatic cross-device sync requires the same-origin server endpoint. No cloud credentials, database subscription or deployed shared service are assumed.

## Analysis assumptions

OPR-style estimates minimize `||Ax-y||² + 0.6 ||x-prior||²` over alliance scores without foul credits, with scouted averages as priors. They are nonnegative displayed estimates and can disagree with individual attribution. Insufficient alliance data falls back to the priors.

Pit priors carry `3 / (3 + match count)` weight. Unknown teams have no invented high-performance prior. Forecasts use observed scoring variation, reliability, role coverage and movement probabilities; they are estimates, not referee scores. Partner rankings add role complementarity, observed pairing-fit ratings and a route-overlap deduction. Head-to-head output accounts approximately for the finite shared end-state pool and opponent foul credits. Flower possession changes, defense, exact ball trajectories and timing are not a full game simulation.

Route paths are vectors in nominal 0–144 inch field coordinates. The official FIRST image is cropped to the field boundaries and shown in its original colors beneath vector routes. This supports scouting and overlays, not calibrated autonomous localization. Overlay markers detect line crossings/shared segments, without time or robot footprint; teams must review delays and clearance.

## Structure

```text
src/game.ts          Rule constants and provenance
src/types.ts         Canonical entities and route coordinates
src/scoring.ts       Robot attribution, alliance scoring, validation, RP
src/analytics.ts     Statistics, ridge OPR, standings, forecasts, conflicts
src/storage.ts       IndexedDB, drafts, merge, sync, CSV/JSON
src/seed.ts          Synthetic multi-event dataset
src/pit.ts           Three-step pit workflow
src/scout.ts         Phone match form and shared board
src/rankings.ts      Analytics, standings, match log and rank simulator
src/profiles.ts      Team directory, evidence, notes, coverage
src/alliance.ts      Partner analysis, overlays, head-to-head, pick list
src/event-data.ts    Roster/schedule import and official API adapter
src/ui.ts            Accessible controls, SVG routes, photo/PNG handling
src/app.ts           Routing and app shell
public/             Shared design, logo, fonts/license, FIRST field graphic
server.mjs          Static server, serialized sync and credentialed proxies
tests/              Domain and import fixtures, run with node:test
```

Fonts: Archivo, SIL Open Font License (bundled). Team logo: supplied team website. Field graphic: FIRST BIOBUZZ Competition Manual, Figure 9-2; [official source](https://ftc-resources.firstinspires.org/ftc/game/cm-html/BIOBUZZ%20Competition%20Manual%20-%20TU07_files/image024.png).
