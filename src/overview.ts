import { compatibility, standings, teamStats } from "./analytics.js";
import { deriveResults } from "./scoring.js";
import { active, type Event } from "./types.js";
import { database, settings } from "./storage.js";
import { esc, fmt } from "./ui.js";

export function renderOverview(root: HTMLElement, event: Event) {
  const next = active(database.matches)
    .filter(
      (m) =>
        m.eventId === event.id &&
        !deriveResults(m, database) &&
        [...m.red, ...m.blue].includes(settings.team),
    )
    .sort((a, b) => a.number - b.number)[0];
  const color = next?.red.includes(settings.team) ? "red" : "blue";
  const partner = next?.[color].find((team) => team !== settings.team);
  const rank = standings(database, event).find(
    (row) => row.team === settings.team,
  );
  const stats = teamStats(database, settings.team, event.id);
  const candidates = event.teams
    .filter((team) => team !== settings.team)
    .map((team) => ({
      team,
      ...compatibility(database, settings.team, team, event),
    }))
    .sort((a, b) => b.index - a.index)
    .slice(0, 3);
  const scoutLink = next
    ? `#scout/match/${next.number}/${settings.team}`
    : "#scout";
  root.innerHTML = `<section class="next-hero"><div class="next-identity"><h1>${next ? `Match <span>${next.number}</span>` : "Next match"}</h1>${next ? `<span class="alliance-label">${color === "red" ? "Red" : "Blue"} alliance</span>` : ""}</div>${partner ? `<div class="hero-partner"><span>Partner</span><a href="#team/${partner}">${partner}</a></div>` : ""}<a class="button primary" href="${scoutLink}">Scout match</a></section><section class="overview-numbers" aria-label="Team summary"><a href="#standings"><span>Our rank</span><strong>${rank?.played ? rank.rank : "—"}</strong></a><a href="#team/${settings.team}"><span>Our average score</span><strong>${stats.obs.length ? fmt(stats.total.average) : "—"}</strong></a><a href="${candidates[0] ? `#alliance/partners/${candidates[0].team}` : "#alliance"}"><span>Best partner</span><strong>${candidates[0]?.team ?? "—"}</strong></a></section><section class="top-teams"><h2>Top teams</h2><div class="top-team-list">${candidates.map((candidate) => `<a class="top-team" href="#team/${candidate.team}"><strong>${candidate.team}</strong><span>${esc(active(database.teams).find((t) => t.number === candidate.team)?.name ?? "")}</span><b>${fmt(candidate.score, 0)}</b></a>`).join("")}</div></section>`;
}
