# Legacy mappings and explicit assumptions

## Legacy features without a direct BIOBUZZ equivalent

- DECODE motifs, PATTERN points and the classifier gate have no direct BIOBUZZ score. Capability questions now cover HIVE cycles, own-NECTAR selection, FLOWER ownership and bottom bonuses. A generic sorting observation is retained for continuity, without awarding points.
- Close/far DECODE legal launch zones are replaced by scouting-defined Near / Center / Far / Perimeter / Flexible positions. Near is the audience side, Far the opposite side; these are descriptive labels, not new BIOBUZZ rules.
- Partial/full/stacked BASE parking and top/bottom robot roles are replaced by AUTO/TELEOP binary PARK plus last-minute FLOWER/NECTAR planning. The legacy per-robot 30-point double park is not carried over.
- The old app allowed multiple pit interviews for a team. The requested editing behavior becomes one canonical pit record per team/event; scout/time metadata and notes remain. Repeated edits update that record rather than create duplicate teams or interviews.
- Broken/unknown legacy Consistency arithmetic is replaced by explicitly labeled population standard deviation. NaN empty averages and null team headings are fixed.

All other observed capabilities are represented: scout identity, interview time, field routes, photographs, robot descriptions, per-phase scoring, observed sorting/offense/defense/fixed position/fit, filters, sortable data, profiles, notes and optional external FTCScout data. New event/selection/forecast/export capabilities are documented separately rather than presented as inherited features.

## Manual / API assumptions

- TU07 is the verified baseline. Championship thresholds remain unknown until FIRST publishes them; each event can override the All Other Events defaults.
- Per-robot HIVE TIP and final-element credit are scouting attribution, since alliance achievements do not define an official division between partners. Credit shared TIPs once. Official alliance results and canonical shared field snapshots take precedence for standings and OPR.
- Cumulative actions may reuse the same physical elements. Finite-inventory checks apply to final locations, not cumulative launch counts. The match form separates placements/deliveries from attributed final retained elements.
- G410 explicitly penalizes early NECTAR; broad FLOWER-opening wording is shown as a rules reminder, without inventing an early-POLLEN penalty. Early NECTAR still participates in final scoring. Generic major fouls exclude the separately entered early-NECTAR incidents.
- FLOWER ownership must be entered from the top qualifying NECTAR. Count-only API arrays have no documented ordering direction, so raw arrays are preserved and the adapter does not infer ownership from their index order.
- Official random ranking keys are unavailable. Exact ties are visibly provisional; deterministic display order uses team number, while rank simulation samples random tie keys.
- API data is not guaranteed live and no token was provided. A server-side credential proxy and tested schema mapping are supplied; CSV is the working credential-free fallback. FTCScout may have no current-season data for a team.
- Statistical projections are heuristic and reproducible. They are limited by sample size, judgment-based attribution, independence assumptions and approximate shared-element competition. They do not model exact defense, simultaneous ownership changes or cycle timing.
- Field vectors use nominal inches and official image bounds. Intersections/shared segments are conflict candidates, not timed collision predictions. The image is not a CAD/localization calibration source.
- Latest timestamp wins during dataset merge; same-record concurrent edits are not combined field by field. Browser-local durability is distinct from completed cross-device sync. The included shared server is intended for a trusted team deployment.
