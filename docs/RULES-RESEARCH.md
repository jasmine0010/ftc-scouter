# BIOBUZZ rules and event-data verification

Verified 2026-10-30 against FIRST's current resource listing: TU07, dated 2026-10-29.

## Competition model

Source: [official BIOBUZZ manual](https://ftc-resources.firstinspires.org/ftc/game/cm-html), sections 9, 10.5, 10.6, G407-G418, G426-G427 and Table 13-1.

- Points: HIVE TIP 20 in either period; AUTO LEAVE 3; PARK 5 in each period; final upward CELL element 2; owned FLOWER element 2; bottom NECTAR bonus 5; GARDEN element 1.
- RP: SWARM at 16 combined LEAVE/PARK points; POLLINATOR at 4 and 7 tips; one RP each. Win 3 RP; tie 1. Championship thresholds remain TBA; Premier events may customize them.
- Fouls credit the opponent: minor 5, major 20.
- FLOWER owner follows its top qualifying NECTAR; owner receives every qualifying element's points. Track each alliance's bottom-NECTAR bonus independently per FLOWER.
- G410 specifically prohibits NECTAR entering FLOWERS before the last 60 seconds: one major per NECTAR. Section 10.5.2 uses broader last-minute language; early achievements still score. Preserve an explicit early-NECTAR count; do not silently discard those elements.
- Rank by average RP, average alliance points excluding fouls, average tips, average AUTO points, then official random order. Exclude surrogate matches; DQ contributes zero to all criteria.
- Inventory: 40 POLLEN, 8 red NECTAR, 8 blue NECTAR. Maximum simultaneous robot control: four elements.

## Field geometry and asset references

Source: [official Event Field Setup Guide](https://ftc-resources.firstinspires.org/ftc/field/eventfieldguide), sections 6, 8-11, plus manual section 9.

The nominal field is 144 by 144 inches, with six columns A-F left-to-right and rows 1-6 bottom-to-top on nominal 24-inch tiles. Audience is below the drawing; red is left. Red LOADING ZONE is on A5; blue is on F2, each 23 inches along the perimeter by 11 inches deep. Red GARDEN is bottom-left on A1; blue is top-right on F6, each 23 by 2 inches. The shared HIVE frame is centered; red HIVE is on its left, blue on its right, with each HIVE's two CELLS north/south. FLOWERS attach at top perimeter seam 2, right seam 4, bottom seam 4, and left seam 2 (seam indices measured from bottom-left). Thus for an SVG origin at top-left: top FLOWER x≈48; right FLOWER y≈48; bottom FLOWER x≈96; left FLOWER y≈96 inches.

Official graphic assets discovered:

- [Figure 9-2: top-down zones](https://ftc-resources.firstinspires.org/ftc/game/cm-html/BIOBUZZ%20Competition%20Manual%20-%20TU07_files/image024.png)
- [Figure 9-3: zone dimensions](https://ftc-resources.firstinspires.org/ftc/game/cm-html/BIOBUZZ%20Competition%20Manual%20-%20TU07_files/image025.png)
- [Figure 9-5: tile coordinates](https://ftc-resources.firstinspires.org/ftc/game/cm-html/BIOBUZZ%20Competition%20Manual%20-%20TU07_files/image027.png)

Figures 9-2, 9-3 and 9-5 were visually inspected in the browser. These confirm the orientation, zone tiles and perimeter joints above. Direct shell asset download failed DNS; an SVG can reproduce the verified schematic in 0-144 inch coordinates. Zone widths follow actual tile seams (nominally 23 inches), so nominal 24-inch-grid coordinates have small offsets. FLOWER scoring-volume centers sit slightly inside the walls. Treat the SVG as a scouting schematic, not an autonomous localization calibration drawing. Link the official CAD for exact machining/localization coordinates.

## Data-model recommendations and assumptions

These are implementation decisions, not additional FIRST rules:

- Separate cumulative actions from final locations. Recycled POLLEN can be launched repeatedly; a cumulative launch count above 40 is not intrinsically impossible. Validate simultaneous final-state locations against the physical inventory. Early counts can be flagged for scout review without incorrectly treating all action counts as unique balls.
- Store shared FLOWER snapshots once per match, not four inconsistent copies. Keep robot deliveries separate from alliance ownership scores. Team analytics should label attributed contribution estimates; official qualification standings require alliance results.
- A shared HIVE TIP has no official per-robot attribution rule in the cited scoring definitions. Let scouts credit it once and document the attribution; reconcile duplicate partner credit.
- Never add both an explicit early-NECTAR penalty and the same violation again in the generic major-foul counter. Keep penalties separate from earned points and expose net contribution separately.
- Monte Carlo win, RP and rank estimates are model outputs, not official standings. Resolve an otherwise exact tie with a seeded deterministic random key for reproducibility and label it provisional.

## Official FTC Events API

Sources: [API information](https://ftc-events.firstinspires.org/services/API) and [v2.0 API documentation](https://ftc-events.firstinspires.org/api-docs/index.html).

Use HTTPS at `https://ftc-api.firstinspires.org/v2.0`. Every request needs Basic authentication formed from username and token. Registration is free. Tokens must never be published in client source, static bundles, or exports; a server proxy can read environment variables. No credentials were provided for this task.

Relevant resources under `/{season}`: `/events`, `/teams?eventCode=...`, `/schedule/{eventCode}?tournamentLevel=qual`, `/schedule/{eventCode}/qual/hybrid`, `/matches/{eventCode}?tournamentLevel=qual`, `/scores/{eventCode}/qual`, and `/rankings/{eventCode}`. Match results include final, foul and AUTO totals plus team stations, DQ and on-field state; schedule teams include surrogate flags. Hybrid results merge future schedule and completed results.

FIRST notes publication depends on event upload; the API is not a guaranteed live event feed. Support CSV/JSON import while offline and show import freshness. Respect conditional-fetch headers where practical; link FIRST's API information on screens using its data. Validate the API's current season index instead of assuming calendar-end-year semantics.
