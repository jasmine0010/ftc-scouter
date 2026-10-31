# Old scouter inventory

Audited live at https://scouterftc.web.app/ on 2026-10-30. This is a browser-observed contract, not a claim to have its unpublished source or database schema. No records were submitted, notes saved, or photos uploaded. Navigation uses four top-level buttons inside one React application: Scout Form, Pit Scouting, Rankings & Data, Team Profiles. Browser title is `React App` and the product heading is `FTC DECODE Scout Hub`.

## Pages and views

1. **Scout Form:** live total and Auto/Teleop/End breakdown, match identification, game counters, capability/defense observations, parking/penalties, compatibility assessment, note, final calculated score and Submit Match Data.
2. **Pit Scouting:** three sequential steps (Team Information → Auto Field Positions → Robot Analysis), Previous/Next navigation, final Save All Data. The questionnaire is grouped Autonomous, TeleOp, Endgame, Robot Information, Additional Information, then an overall rating.
3. **Rankings & Data:** Teams and Matches subviews with common filters and Clear Filters. Teams is a sortable aggregate table with View Details links. Matches is a sortable entry table with score breakdowns and notes.
4. **Team Profiles:** search by number or name, team cards, then a complete analysis page. Cards show number/name, match count, pit-profile count, average score. Detail shows match summaries, every saved pit profile, the auto field drawing, optional robot photo, external FTCScout statistics/awards when available, and a free-form team-notes feed. Back to Teams returns to the directory. Add Note opens a modal with a 500-character counter, Cancel, close control and Add Note (disabled while empty).

## Observable data entities

- **Match observation:** team number, match ID, scouter name, alliance, auto/teleop zone counts, binary leave, observed shooting zones, sorting capability, offense rating, plays-defense flag, park choice, minor/major counts, fixed-shooting-position flag, compatibility rating, note and calculated score. Multiple observations per team feed aggregates.
- **Pit profile:** team number/name, scout name, interview time, submission date, field drawing, questionnaire responses, robot picture and overall rating. The legacy detail explicitly supports multiple profiles per team.
- **Team aggregate:** union of teams occurring in match or pit data; computed match count, averages, maxima, compatibility, sorting percentage, consistency, and display name (fallback `Team <number>`).
- **Team note:** team number, note text (maximum 500 characters), and displayed chronological metadata when present; actual persistence keys were not inspected.
- **External FTCScout enrichment:** team information, score statistics (total, autonomous, teleop) and awards. This loads asynchronously and is absent/empty for some teams.

No event selector, schedule import, CSV/JSON export, pick list, OPR, Monte Carlo, route overlay or rule reference was visible. These are requested additions, not legacy features. The backend/database identifiers and merge semantics cannot be established from the UI.

## Match form: every field and choice

- Scout Name (text), Match ID (number), Team ID (number), Alliance (Red/Blue; Red initially selected).
- **Autonomous Scoring:** Close Zone Artifacts (nonnegative +/- counter), Far Zone Artifacts (counter), Leave Launch Zone (0 or 1; `+` disables at 1).
- **Autonomous Shooting Zone:** Primary Shooting Zone = None/Not Observed, Close Zone, Far Zone.
- **TeleOp Scoring:** Close Zone Artifacts and Far Zone Artifacts (nonnegative counters).
- **Robot Capabilities:** Can Sort / Pattern (checkbox).
- **TeleOp Shooting Zone:** Primary Shooting Zone = None/Not Observed, Close Zone, Far Zone, Both Zones; Offense Ability (vs Defense) = Not Observed or 1 Struggles / 2 Below Average / 3 Average / 4 Above Average / 5 Excellent; Plays Defense? (checkbox).
- **End Game & Penalties:** Parking = None (0), Partial Park (5), Full Park (10), Double Full Park (30); Minor Fouls Against Team (counter, displayed 5 points); Major Fouls Against Team (counter, displayed 10 points).
- **Team Compatibility Assessment:** Fixed Shooting Position (Boolean button switch); Compatibility Rating = 1 Least Compatible through 5 Most Compatible, default 3; Notes (multiline).
- Submit is initially disabled when identification fields are missing. It was not submitted during this audit, so server-side validation and successful reset behavior remain unverified.

## Pit flow: every field and choice

### Step 1: Team Information

Scouter Name (required text), Team Name (optional text), Team ID (required number, minimum 1), Time Talked To (optional time). Next is disabled until required fields are supplied. A team name is not required in the old app. The new specification intentionally changes required fields to team number and name, keeping scout/time optional.

### Step 2: Auto Field Positions

DECODE top-down field image, touch drawing surface, Clear Drawing, Near (Blue), Far (Red), Previous: Team Info, Next: Questions. A drawing is not required to proceed. The saved team page renders the field image with drawing. No undo, route labels, multi-route manager, overlay or export control was observed. Whether the old persisted strokes are vectors or a raster cannot be proven from the visible UI.

### Step 3: Robot Analysis

- **Autonomous:** Leave the launch zone?; Score motifs?; Max auto close zone; Max auto far zone (all four are checkboxes, including the incorrectly typed quantity fields); Average classified artifacts scored (number, minimum 0, default 0); Average overflow artifacts (same); Average unclassified (number, minimum 0); Near Zone Auto Synopsis; Far Zone Auto Synopsis; Auto Notes (multiline).
- **TeleOp:** Empty the classifier?; Teleop average artifacts — close/far/total; Teleop max close/far (all checkboxes, including five quantity mistakes); Average classified artifacts sorted; Average overflow artifacts (numbers, minimum 0, default 0); shooting zones = Far zone only / Close zone only / Both zones; accuracy = 1 through 5, initially unselected; Zone preference (text); TeleOp Notes (multiline).
- **Endgame:** Score a motif at the end of the game? (checkbox); Bottom or top robot (or none)? = Bottom / Top / Both / Neither; Endgame Notes (multiline).
- **Robot Information:** Drive Type = Tank / Mecanum / Swerve / Other; Intake Type = Passive / Active / Conveyor System / Other; Scoring Mechanism = Launcher/Catapult / Flywheel Shooter / Linear Slide / Articulating Arm / Other; Strategy Preference = Offensive Focus / Defensive Focus / Balanced Approach / Specialist (Auto/Teleop Focus); Strengths and Weaknesses (text).
- **Additional Information:** Robot Picture (file input), Additional Notes (multiline), overall Rate This Robot 1–5 (Poor / Below Average / Average / Above Average / Excellent, default 3). Previous: Field Drawing and Save All Data complete the flow.

## Calculations and analytics

Verified by changing form values without submitting:

```text
Auto = 3 × (autoClose + autoFar + leave)
Teleop = 3 × (teleClose + teleFar)
End = park choice (0, 5, 10, or 30)
Total = Auto + Teleop + End − 5 × minorFouls − 10 × majorFouls
```

Total can become negative (observed −9). Can Sort, shooting-zone selections, offense/defense, Fixed Shooting Position and compatibility do not add points. The breakdown shows positive phase scores even when fouls reduce the displayed total. Minus controls disable at zero; Leave is capped at one. The old match form has no separate classified/overflow/depot/pattern score counters. Its 10-point major foul and per-robot 30-point double park are legacy scoring defects to correct, not preserve.

**Teams table columns, all sortable except Actions:** Team #, Team Name, Matches, Avg Score, Auto Avg, TeleOp Avg, End Game Avg, Avg Artifacts, Max Close, Max Far, Max Total, Avg Compat, Consistency, Sort %, Actions. Match count and arithmetic averages are observable. Avg Artifacts combines all four artifact counters. Max Close/Far/Total appear to be per-match maxima across both phases, not sums of separate maxima (e.g. maximum close 15, far 31, total 41). Sort % is the proportion of observations with Can Sort checked. The exact Consistency formula is unknown: all 52 displayed rows showed 0.0 despite variable match scores, so it must not be treated as a verified standard deviation.

**Common filters:** exact/numeric Team ID input; Auto = All / High (>10) / Medium (5–10) / Low (<5); TeleOp = All / High (>15) / Medium (8–15) / Low (<8); Min Score; Max Score; Clear Filters. Boundary wording is visible; hidden filter implementation and whether averages are recomputed from filtered observations were not inspected.

**Matches table:** Score, Team, Match, Alliance, Scores Breakdown, Notes. Score/Team/Match/Alliance headers sort. Breakdown shows Auto Close/Far, Tele Close/Far, Can Sort, Base/Fouls. Empty note displays `No notes.`. Total Entries gives observation count.

**Team detail:** average total, auto, teleop and end scores; average artifacts; match/alliance/score/sort table; pit-profile cards with scout, date/time and overall rating; field drawing, autonomous, teleop, endgame and robot/additional responses. Empty fields have readable fallbacks. External FTCScout total/auto/teleop averages and awards are distinct from locally scouted averages.

## Behaviors and defects to carry forward or replace

- Preserve asynchronous enrichment, union of match and pit teams, optional photo, free-form notes, scout identity/interview time, compatibility/offense/defense observations and starting-position-specific autonomous descriptions.
- Convert quantity checkboxes to numeric fields; retain numeric zero versus unobserved deliberately.
- Retarget motif/sorting and classifier questions to BIOBUZZ flower ownership/hive operation; replace top/bottom stacking and DECODE launch-zone choices with BIOBUZZ last-minute plan and field positions.
- The old app showed `NaN` averages for a pit-only team and `Team null` for a Rankings detail. New empty states must show no sample, not NaN, and use canonical team identity.
- Local autosave/offline durability, editing a canonical team, duplicate resolution, official qualification ranking and route conflict analysis were not demonstrated by the old UI. Implement these from the new requirements without claiming inherited behavior.
