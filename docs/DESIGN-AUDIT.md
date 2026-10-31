# Team website design inventory

Reference inspected before implementation: `../curiosity11770`, especially `README.md`, `home.html`, `assets/design/site.css`, `typography.css`, `site.js`, and `preview.cjs`. The source is a static site: generated HTML, shared CSS, vanilla JavaScript, Python-standard-library generation, and a Node-standard-library preview server. There is no React, Tailwind, component framework, or package manifest to inherit.

## Tokens and conventions

- Background `#000`; panel `#070302`; text `#f3f1eb`; muted text `#beb9b6`; accent `#802010`; hover accent `#9b2d1b`. Borders: `#342c2a`, soft `#241d1b`, strong `#4a2c25`.
- Archivo 400/500/600, with Arial/sans-serif fallback. Body 17px/1.7–1.8; mobile reading 16px. Reading headings 40px/1.2 and 26px/1.3, reduced to 32/24 at 700px. Large editorial titles use responsive 48–92px sizing and negative tracking. Tabular numerals already appear on numeric labels.
- Desktop gutters 6.4%, mobile 6%; content widths generally 1100px, technical/team pages 1200px. Common spacing: 12, 14, 18, 22, 24, 28, 32, 38, 48px. Large editorial section spacing is 72–128px; the app deliberately uses tighter table/form spacing within the same typography and gutter system.
- Hairline section borders, short red rules, quiet black panels, square corners. A few contact controls use 3px radii. Buttons use solid red/white, 14px 24px padding, 16px text, 0.2s background transitions. Secondary links use red underlines. The team source has no reusable form-input system; app inputs extend its hairline-border, dark-surface treatment.
- White 2px visible focus outlines with 5px offset. Navigation underlines animate 0.2–0.24s. Photography motion exists on the reference, but is not appropriate for the scouting app. All app motion respects reduced-motion preferences.
- Reference breakpoints include 1220/1100/1000/900/700/600/480/360px, with primary menu collapse near 1100px and stacked layouts at 600–700px.

## Application decisions

Use TypeScript modules and DOM rendering with no runtime framework; a minimal TypeScript build replaces Python page generation because this is a stateful application. Preserve static deployment and a Node-standard-library server. Reuse the original team SVG logo. Use the exact palette and Archivo family, with 18px body, label and table text, 56px minimum controls, 56px filled counter buttons, 48px counter values and a 64–72px current score. The current layout follows the legacy four-tab hub, single scrolling match form, three-step pit form, Teams/Matches data tables and team-profile cards. Redundant subtitles and helper notes are omitted. No new decorative accent colors, gradients, glass effects, rounded cards, or icon grids.

The team site loads Archivo from Google Fonts and has no local font files. The app now bundles Archivo 400/500/600 and its SIL license locally. Arial remains the fallback. No external font request is required.
