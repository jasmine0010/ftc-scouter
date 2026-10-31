# Verified API mappings

Verified 2026-10-30 from [FIRST's Swagger JSON](https://ftc-events.firstinspires.org/swagger/v2.0/swagger.json). A focused schema snapshot is in `references/ftc-events-biobuzz-schema.json`.

## FIRST BIOBUZZ score details

Endpoint: `GET https://ftc-api.firstinspires.org/v2.0/2026/scores/{eventCode}/qual`.

Envelope: `matchScores[]`, schema `ScoreDetailModel_2026`. Match identity fields are `matchLevel`, `matchSeries`, and `matchNumber`; score rows are `alliances[]`, schema `ScoreDetailAllianceModel_2026`.

Exact field names:

```text
autoHiveTips
autoRobot1Leave, autoRobot2Leave
autoRobot1Park, autoRobot2Park
autoLeavePoints, autoParkPoints, autoHivePoints
teleopHiveTips, teleopHivePollenNectar
redAllianceFlower[], scoringFlower[], blueAllianceFlower[], audienceFlower[]
teleopGardenPollenNectar
teleopRobot1Park, teleopRobot2Park
teleopHivePoints, teleopFlowerPoints, teleopGardenPoints, teleopParkPoints
autoPoints, teleopPoints
foulPointsCommitted, preFoulTotal, totalPoints
swarmRP, pollinator1RP, pollinator2RP
majorFouls, minorFouls
alliance, team
```

Flower arrays contain `RED_NECTAR`, `BLUE_NECTAR`, or `POLLEN`. Swagger does not document their bottom-to-top ordering: preserve raw arrays and avoid asserting inferred ownership without a verified ordering contract.

Movement points for SWARM are `autoLeavePoints + autoParkPoints + teleopParkPoints`. Total tips are `autoHiveTips + teleopHiveTips`. AUTO tie-break points use `autoPoints`. Use the supplied RP booleans for imported official outcomes rather than recalculating them using an event's possibly outdated thresholds. Earned points use `preFoulTotal`; final `totalPoints` includes opponent penalties, whereas `foulPointsCommitted` is credited to the opponent.

`matchLevel` enum: `PRACTICE`, `QUALIFICATION`, `SEMIFINAL`, `FINAL`, `PLAYOFF`, `OTHER`. Endpoint selectors are `qual` and `playoff`; normalize aliases when joining results to schedules.

## FIRST hybrid schedule

Endpoint: `GET https://ftc-api.firstinspires.org/v2.0/2026/schedule/{eventCode}/qual/hybrid`.

Envelope `schedule[]`; each row has `matchNumber`, `series`, `tournamentLevel`, `description`, `startTime`, `actualStartTime`, `postResultTime`, `videoURL`, `scoreRedFinal`, `scoreBlueFinal`, `scoreRedFoul`, `scoreBlueFoul`, `scoreRedAuto`, `scoreBlueAuto`, `redWins`, `blueWins`, and `teams[]`. Result values are nullable for unplayed matches: zero is a valid completed score.

Each team has `teamNumber`, `displayTeamNumber`, `station`, `surrogate`, `noShow`, `dq`, `onField`, and `teamName`. Join score details on normalized level plus series plus match number, not match number alone. Parse stations by alliance and station number; never rely on the order of `teams[]`.

## FTCScout REST

Verified against [FTCScout's published documentation source](https://github.com/ftc-scout/ftc-scout/blob/main/packages/web/src/routes/api/rest/+page.svelte) and a live public response. Base URL is `https://api.ftcscout.org/rest/v1`; no additional authentication headers.

```text
GET /teams/{number}/quick-stats?season=2026&region=...
GET /teams/{number}/events/2026
GET /teams/{number}/awards?season=2026&eventCode=...
GET /events/2026/{code}/awards
GET /events/2026/{code}/teams
GET /events/2026/{code}/matches
```

The season in team-event participation requests is a path suffix, not a query parameter. Quick stats contain `season`, `number`, `tot: {value, rank}`, `auto: {value, rank}`, `dc: {value, rank}`, `eg: {value, rank}`, and `count`. The 2025 response for team 11770 confirmed that structure. The same team's 2026 endpoint currently returns 404 because it has no season stats; an absent season is not evidence that the team does not exist. BIOBUZZ has no separate endgame, so avoid presenting `eg` as a season scoring category.

FTCScout's [BIOBUZZ descriptor](https://github.com/ftc-scout/ftc-scout/blob/main/packages/common/src/logic/descriptors/seasons/BioBuzzDescriptor.ts) independently verifies that TeleOp HIVE points combine tip points with remaining-CELL points and that final points add opponent foul points to earned points.
