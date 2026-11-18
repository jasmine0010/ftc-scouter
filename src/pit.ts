import { GAME } from "./game.js";
import {
  active,
  now,
  uid,
  type Pit,
  type PitAnswers,
  routeIsEmpty,
  undoRouteStep,
  type Route,
  type RouteMarkType,
} from "./types.js";
import {
  database,
  settings,
  saveEntity,
  readDraft,
  saveDraft,
  clearDraft,
} from "./storage.js";
import {
  bindDrawing,
  bindSteppers,
  checked,
  compressPhoto,
  counter,
  esc,
  exportRoutePNG,
  field,
  fieldSVG,
  formValues,
  section,
  select,
  textArea,
  toast,
  toggle,
  routeLegend,
} from "./ui.js";

/** Pit quantities are scout estimates, so every counter is a whole number.
 *  Older records may hold decimals (e.g. 12.8 kg); they open rounded. */
const wholeNumber = (value: unknown) =>
  value === undefined || value === "" || !Number.isFinite(Number(value))
    ? value
    : Math.round(Number(value));
export const pitSections: {
  title: string;
  fields: [string, string, string, string[]?][];
}[] = [
  {
    title: "Autonomous",
    fields: [
      ["leave", "LEAVE", "bool"],
      ["autoPark", "PARK", "bool"],
      ["attemptTip", "Can launch", "bool"],
      ["autoTipsAvg", "Average HIVE TIPs", "number"],
      ["autoTipsMax", "Maximum HIVE TIPs", "number"],
      ["autoLaunched", "Average elements launched", "number"],
      ["cellAvg", "Average elements left in a CELL", "number"],
      ["nearSynopsis", "Near starting-position synopsis", "text"],
      ["farSynopsis", "Far starting-position synopsis", "text"],
      ["autoNotes", "AUTO notes / other starting positions", "text"],
    ],
  },
  {
    title: "TeleOp",
    fields: [
      ["teleTipsAvg", "Average HIVE TIPs", "number"],
      ["teleTipsMax", "Maximum HIVE TIPs", "number"],
      ["gardenAvg", "Average GARDEN deliveries", "number"],
      ["flowersAvg", "Average FLOWER placements", "number"],
      [
        "launchPosition",
        "Primary launch position",
        "select",
        ["Near", "Center", "Far", "Perimeter", "Flexible"],
      ],
      ["accuracy", "Launcher accuracy (1–5)", "rating"],
      ["cycleTime", "Estimated cycle time (sec)", "number"],
      ["zonePreference", "Zone preference", "text"],
      ["teleNotes", "TeleOp notes", "text"],
    ],
  },
  {
    title: "Endgame",
    fields: [
      ["topNectar", "Can take ownership with top NECTAR", "bool"],
      ["bottomBonus", "Can earn bottom NECTAR bonus", "bool"],
      ["park", "PARK at end of match", "bool"],
      ["humanPlayer", "Handles human-player NECTAR loading", "bool"],
      ["lastPlan", "Plan when FLOWER scoring opens", "text"],
      ["lastNotes", "Endgame / loading-zone notes", "text"],
    ],
  },
  {
    title: "Robot information",
    fields: [
      ["drive", "Drive type", "select", ["Mecanum", "Tank", "Swerve", "Other"]],
      [
        "intake",
        "Elements collected",
        "select",
        ["POLLEN + own NECTAR", "POLLEN only", "Own NECTAR only", "Other"],
      ],
      [
        "intakeType",
        "Intake type",
        "select",
        ["Active roller", "Passive", "Conveyor", "Other"],
      ],
      [
        "mechanism",
        "Scoring mechanism / launcher",
        "select",
        [
          "Flywheel shooter",
          "Catapult",
          "Linear slide",
          "Articulating arm",
          "Other",
        ],
      ],
      ["capacity", "Capacity held at once", "capacity"],
      [
        "strategy",
        "Strategy preference",
        "select",
        ["Offense", "FLOWER / GARDEN specialist", "Defense", "Flexible"],
      ],
      ["strengths", "Strengths", "text"],
      ["weaknesses", "Weaknesses", "text"],
      ["mass", "Robot mass (kg)", "number"],
      [
        "reliability",
        "Reliability concerns",
        "select",
        ["Low", "Medium", "High"],
      ],
      ["reliabilityNotes", "Reliability details", "text"],
    ],
  },
  {
    title: "Additional information",
    fields: [
      ["additionalNotes", "Additional notes", "text"],
      ["rating", "Overall scout rating (1–5)", "rating"],
    ],
  },
];
export async function renderPit(root: HTMLElement, editTeam?: number) {
  const eventId = settings.eventId,
    draft = await readDraft<{
      pit: Pit;
      teamName: string;
      step: number;
      routeId: string;
    }>(`pit:${eventId}`);
  let pit = structuredClone(
    active(database.pits).find(
      (p) => p.eventId === eventId && p.team === editTeam,
    ) ??
      (!editTeam ? draft?.pit : undefined) ?? {
        id: uid(),
        updatedAt: now(),
        eventId,
        team: editTeam ?? 0,
        scout: "",
        talkedAt: "",
        routes: [],
        answers: {},
        photo: "",
      },
  ) as Pit;
  let teamName =
      active(database.teams).find((t) => t.number === pit.team)?.name ??
      (!editTeam ? draft?.teamName : "") ??
      "",
    step = !editTeam ? (draft?.step ?? 1) : 1,
    routeId = draft?.routeId ?? pit.routes[0]?.id ?? "";
  const save = async () => {
    pit.updatedAt = now();
    await saveDraft(`pit:${eventId}`, { pit, teamName, step, routeId });
    const e = root.querySelector("#draft-status");
    if (e) e.textContent = "Draft saved on this device";
  };
  const capture = () => {
    const f = root.querySelector<HTMLFormElement>("#pit-form");
    if (!f) return;
    const values = formValues(f);
    if (step === 1) {
      pit.team = Number(values.team);
      teamName = String(values.teamName ?? "");
      pit.scout = String(values.scout ?? "");
      pit.talkedAt = String(values.talkedAt ?? "");
    }
    if (step === 2) {
      const r = pit.routes.find((r) => r.id === routeId);
      if (r) {
        r.label =
          String(values.routeLabel ?? r.label).trim() || autoLabel(r.id);
        r.notes = String(values.routeNotes ?? r.notes ?? "");
      }
    }
    if (step === 3) {
      for (const key of Object.keys(values))
        if (key.startsWith("routeNote.")) {
          const r = pit.routes.find((r) => `routeNote.${r.id}` === key);
          if (r) r.notes = String(values[key]);
          delete values[key];
        }
      pit.answers = { ...pit.answers, ...values };
    }
  };
  let cleared:
    | {
        id: string;
        paths: Route["paths"];
        marks: Route["marks"];
        origin: Route["origin"];
      }
    | undefined;
  let tool: RouteMarkType | null = null;
  function routeHint(route: Route) {
    if (!route.origin) return "Tap where the robot starts.";
    if (tool)
      return `Tap the spot where it ${tool === "launch" ? "launches" : "intakes"}.`;
    if (!route.paths.length) return "Drag from the robot to draw its path.";
    return "Tap Intake or Launch to mark where it picks up or shoots. Draw again to continue the path.";
  }
  function autoLabel(excludeId: string) {
    const taken = new Set(
      pit.routes.filter((r) => r.id !== excludeId).map((r) => r.label),
    );
    for (let n = 1; ; n++) {
      const label = `Route ${n}`;
      if (!taken.has(label)) return label;
    }
  }
  function ensureRoute() {
    if (!pit.routes.length)
      pit.routes.push({
        id: uid(),
        label: "Route 1",
        start: "",
        paths: [],
      });
    if (!pit.routes.some((r) => r.id === routeId)) routeId = pit.routes[0].id;
  }
  function render() {
    const fields = (
      answers: PitAnswers,
      list: (typeof pitSections)[number]["fields"],
    ) =>
      list
        .map(([key, label, type, options]) =>
          type === "bool"
            ? toggle(label, key, answers[key])
            : type === "text"
              ? textArea(label, key, answers[key])
              : type === "select"
                ? select(label, key, answers[key] ?? "", [
                    ["", "Not recorded"],
                    ...(options ?? []),
                  ])
                : type === "rating"
                  ? select(label, key, answers[key] ?? "", [
                      ["", "Not recorded"],
                      ...["1", "2", "3", "4", "5"],
                    ])
                  : counter(
                      label,
                      key,
                      wholeNumber(answers[key]),
                      type === "capacity" ? GAME.limits.possession : 999,
                    ),
        )
        .join("");
    const autonomous = () => {
      const input = (key: string, label?: string) => {
        const definition = pitSections[0].fields.find(
          ([name]) => name === key,
        )!;
        return fields(pit.answers, [
          [key, label ?? definition[1], definition[2], definition[3]],
        ]);
      };
      const group = (title: string, content: string) =>
        `<fieldset class="pit-auto-group"><legend>${esc(title)}</legend><div class="pit-auto-fields">${content}</div></fieldset>`;
      const description = (title: string, key: string) =>
        `<details class="pit-auto-description"><summary>${esc(title)}</summary>${input(key)}</details>`;
      return `<div class="pit-auto-groups">${group("Movement", `<div class="pit-auto-movement">${input("leave", "Leave")}${input("autoPark", "Park")}</div>`)}${group("Hive tips", `${input("attemptTip", "Can launch")}<div class="pit-counter-pair">${input("autoTipsAvg", "Average")}${input("autoTipsMax", "Maximum")}</div>`)}${group("Elements", `<div class="pit-counter-pair">${input("autoLaunched", "Launched")}${input("cellAvg", "Left in cell")}</div>`)}${group("Auto routes", `${pit.routes.map((r) => `<details class="pit-auto-description" open><summary>${esc(r.label)}</summary>${textArea(`Notes for ${r.label}`, `routeNote.${r.id}`, r.notes ?? "", 'rows="3" maxlength="1000"')}</details>`).join("")}${pit.answers.nearSynopsis ? description("Near (earlier notes)", "nearSynopsis") : ""}${pit.answers.farSynopsis ? description("Far (earlier notes)", "farSynopsis") : ""}${description("Other notes", "autoNotes")}`)}</div>`;
    };
    root.innerHTML = `<div class="page-heading"><div><p class="eyebrow">PIT SCOUTING / ${esc(GAME.season)}</p><h2>Pit Scouting</h2><p class="lede">One record per team. Routes, capabilities and the plan behind the numbers.</p></div><span class="quiet" id="draft-status">Draft autosaves on this device</span></div><ol class="steps" aria-label="Pit scouting steps">${["Team information", "Auto field positions", "Robot analysis"].map((s, i) => `<li${step === i + 1 ? ' aria-current="step"' : ""}><button type="button" data-pit-step="${i + 1}"${step === i + 1 ? ' aria-current="step"' : ""}><span>${i + 1}</span>${s}</button></li>`).join("")}</ol><form id="pit-form"><div id="pit-error" class="errors" role="alert"></div>${
      step === 1
        ? section(
            "Team information",
            `<div class="form-grid">${field("Scouter name", "scout", pit.scout)}${field("Team name", "teamName", teamName, "text", 'required maxlength="100"')}${field("Team ID", "team", pit.team || "", "number", 'min="1" max="999999" required inputmode="numeric"')}${field("Time talked to", "talkedAt", pit.talkedAt, "time")}</div><p class="hint">Known names autofill from event data. An existing pit record opens for editing.</p>`,
          )
        : step === 2
          ? (() => {
              ensureRoute();
              const route = pit.routes.find((r) => r.id === routeId)!;
              return section(
                "Auto field positions",
                `<div class="route-layout"><div><div class="route-canvas-wrap">${fieldSVG([{ route }], true)}${route.origin ? "" : '<p class="map-prompt" aria-hidden="true">Tap where the robot starts</p>'}</div>${routeLegend(routeIsEmpty(route), false)}<div class="route-tools" role="group" aria-label="Map tool">${(
                  [
                    [null, "Draw"],
                    ["intake", "Intake"],
                    ["launch", "Launch"],
                  ] as const
                )
                  .map(
                    ([t, label]) =>
                      `<button type="button" data-route-tool="${t ?? "draw"}" aria-pressed="${!!route.origin && tool === t}"${route.origin ? "" : ' aria-disabled="true"'}>${t ? `<span class="tool-stamp ${t}" aria-hidden="true">${t === "launch" ? "L" : "I"}</span>` : ""}${label}</button>`,
                  )
                  .join(
                    "",
                  )}</div><p class="route-hint" id="route-hint" aria-live="polite">${routeHint(route)}</p></div><div>${pit.routes.length > 1 ? `<div class="route-tabs" role="group" aria-label="Saved routes">${pit.routes.map((r) => `<button type="button" data-route-id="${esc(r.id)}" aria-pressed="${r.id === routeId}">${esc(r.label)}</button>`).join("")}</div>` : ""}<input class="route-name" name="routeLabel" type="text" value="${esc(route.label)}" placeholder="${esc(route.label)}" aria-label="Route name" maxlength="40"><div class="button-row"><button type="button" id="route-add" class="with-icon"${routeIsEmpty(route) ? ' disabled title="Draw this route first"' : ""}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>New route</button><button type="button" id="route-undo" class="icon-button" aria-label="${routeIsEmpty(route) && cleared?.id === route.id ? "Restore cleared route" : "Undo last step"}" title="${routeIsEmpty(route) && cleared?.id === route.id ? "Restore cleared route" : "Undo last step"}"${!routeIsEmpty(route) || cleared?.id === route.id ? "" : " disabled"}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg></button><button type="button" id="route-clear" class="icon-button" aria-label="${routeIsEmpty(route) ? "Delete route" : "Clear route"}" title="${routeIsEmpty(route) ? "Delete route" : "Clear route"}"${!routeIsEmpty(route) || pit.routes.length > 1 ? "" : " disabled"}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/></svg></button><button type="button" id="route-export" class="icon-button" aria-label="Export route as PNG" title="Export PNG"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></svg></button></div>${textArea(`Notes for ${route.label}`, "routeNotes", route.notes ?? "", 'rows="6" maxlength="1000" placeholder="What does this auto do? e.g. scores preload, tips the HIVE, parks"')}</div></div>`,
              );
            })()
          : pitSections
              .map((s) =>
                section(
                  s.title,
                  s.title === "Autonomous"
                    ? autonomous()
                    : `<div class="form-grid">${fields(pit.answers, s.fields)}${s.title === "TeleOp" ? `<div class="wide launch-selector"><span>Field-position selector</span>${fieldSVG()}<div class="button-row">${["Near", "Center", "Far", "Perimeter", "Flexible"].map((pos) => `<button type="button" data-launch="${pos}" aria-pressed="${pit.answers.launchPosition === pos}">${pos}</button>`).join("")}</div></div>` : ""}${s.title === "Additional information" ? `<label class="field"><span>Robot photo · JPEG, PNG, WebP</span><input type="file" id="pit-photo" accept="image/jpeg,image/png,image/webp"></label>${pit.photo ? `<img class="robot-photo" src="${esc(pit.photo)}" alt="Robot ${pit.team}"><button type="button" id="remove-photo">Remove photo</button>` : ""}` : ""}</div>`,
                ),
              )
              .join("")
    }<div class="form-footer"><button type="button" id="pit-prev"${step === 1 ? " disabled" : ""}>← Previous</button><span>Step ${step} of 3</span>${step < 3 ? '<button class="primary" type="button" id="pit-next">Next →</button>' : '<button class="primary" type="submit">Save All Data</button>'}</div></form>`;
    const form = root.querySelector<HTMLFormElement>("#pit-form")!;
    bindSteppers(form);
    form.oninput = () => {
      form
        .querySelectorAll<HTMLInputElement>(
          '[name="autoTipsMax"], [name="teleTipsMax"]',
        )
        .forEach((input) => input.setCustomValidity(""));
      capture();
      void save();
    };
    const goTo = (target: number) => {
      capture();
      if (
        target > 1 &&
        (!Number.isInteger(pit.team) || pit.team < 1 || !teamName.trim())
      ) {
        root.querySelector("#pit-error")!.textContent =
          "Team number and name are required.";
        toast("Enter the team number and name first.");
        return;
      }
      step = Math.min(3, Math.max(1, target));
      void save();
      render();
      window.scrollTo(0, 0);
    };
    root
      .querySelector<HTMLButtonElement>("#pit-next")
      ?.addEventListener("click", () => goTo(step + 1));
    root.querySelector<HTMLButtonElement>("#pit-prev")!.onclick = () =>
      goTo(step - 1);
    root
      .querySelectorAll<HTMLButtonElement>("[data-pit-step]")
      .forEach((b) => (b.onclick = () => goTo(Number(b.dataset.pitStep))));
    const number = form.querySelector<HTMLInputElement>('[name="team"]');
    if (number) {
      const loadTeam = () => {
        capture();
        const known = active(database.teams).find((t) => t.number === pit.team),
          existing = active(database.pits).find(
            (p) => p.team === pit.team && p.eventId === eventId,
          );
        if (existing) {
          pit = structuredClone(existing);
          teamName = known?.name ?? teamName;
          toast("Existing pit record opened for editing.");
          render();
        } else if (known) {
          teamName = known.name;
          form.querySelector<HTMLInputElement>('[name="teamName"]')!.value =
            teamName;
        }
        void save();
      };
      number.onchange = loadTeam;
      number.oninput = loadTeam;
    }
    if (step === 2) {
      const route = pit.routes.find((r) => r.id === routeId)!;
      bindDrawing(
        root.querySelector<SVGSVGElement>("#route-canvas")!,
        route,
        () => {
          cleared = undefined;
          for (const [id, label] of [
            ["route-add", ""],
            ["route-undo", "Undo last step"],
            ["route-clear", "Clear route"],
          ]) {
            const button = root.querySelector<HTMLButtonElement>(`#${id}`)!;
            button.disabled = false;
            button.removeAttribute("title");
            if (label) {
              button.title = label;
              button.setAttribute("aria-label", label);
            }
          }
          root.querySelector("#route-hint")!.textContent = routeHint(route);
          root.querySelector<HTMLElement>(".route-legend")!.hidden = false;
          void save();
        },
        () => (route.origin ? tool : "start"),
        () => {
          cleared = undefined;
          tool = null;
          void save();
          render();
        },
      );
      root.querySelectorAll<HTMLButtonElement>("[data-route-id]").forEach(
        (b) =>
          (b.onclick = () => {
            capture();
            routeId = b.dataset.routeId!;
            void save();
            render();
          }),
      );
      root.querySelectorAll<HTMLButtonElement>("[data-route-tool]").forEach(
        (b) =>
          (b.onclick = () => {
            if (!route.origin) {
              const hint = root.querySelector<HTMLElement>("#route-hint")!;
              hint.textContent =
                "Place the start first: tap where the robot starts.";
              hint.classList.remove("flash");
              void hint.offsetWidth;
              hint.classList.add("flash");
              return;
            }
            capture();
            const t = b.dataset.routeTool;
            tool = t === "intake" || t === "launch" ? t : null;
            render();
          }),
      );
      root.querySelector<HTMLButtonElement>("#route-add")!.onclick = () => {
        capture();
        const r: Route = {
          id: uid(),
          label: autoLabel(""),
          start: "",
          paths: [],
        };
        pit.routes.push(r);
        routeId = r.id;
        void save();
        render();
      };
      root.querySelector<HTMLButtonElement>("#route-undo")!.onclick = () => {
        capture();
        if (!routeIsEmpty(route)) undoRouteStep(route);
        else if (cleared?.id === route.id) {
          route.paths = cleared.paths;
          route.marks = cleared.marks;
          route.origin = cleared.origin;
        }
        cleared = undefined;
        void save();
        render();
      };
      root.querySelector<HTMLButtonElement>("#route-clear")!.onclick = () => {
        capture();
        if (!routeIsEmpty(route)) {
          cleared = {
            id: route.id,
            paths: route.paths,
            marks: route.marks,
            origin: route.origin,
          };
          route.paths = [];
          route.marks = [];
          delete route.origin;
        } else if (pit.routes.length > 1) {
          pit.routes = pit.routes.filter((r) => r.id !== route.id);
          routeId = pit.routes[0].id;
        }
        void save();
        render();
      };
      root.querySelector<HTMLButtonElement>("#route-export")!.onclick = () =>
        void exportRoutePNG(
          root.querySelector<SVGSVGElement>("#route-canvas")!,
          `${pit.team}-${route.label}.png`,
        );
    }
    root.querySelectorAll<HTMLButtonElement>("[data-launch]").forEach(
      (b) =>
        (b.onclick = () => {
          capture();
          pit.answers.launchPosition = b.dataset.launch!;
          void save();
          render();
        }),
    );
    const photo = root.querySelector<HTMLInputElement>("#pit-photo");
    if (photo)
      photo.onchange = async () => {
        if (!photo.files?.[0]) return;
        capture();
        try {
          pit.photo = await compressPhoto(photo.files[0]);
          await save();
          render();
        } catch (e) {
          toast((e as Error).message);
        }
      };
    const remove = root.querySelector<HTMLButtonElement>("#remove-photo");
    if (remove)
      remove.onclick = () => {
        capture();
        pit.photo = "";
        void save();
        render();
      };
    form.onsubmit = async (e) => {
      e.preventDefault();
      capture();
      if (!pit.team || !teamName.trim()) {
        toast("Team number and name are required.");
        return;
      }
      // Flag the Maximum counter itself so the browser scrolls to it and explains.
      for (const [avg, max, phase] of [
        ["autoTipsAvg", "autoTipsMax", "AUTO"],
        ["teleTipsAvg", "teleTipsMax", "TeleOp"],
      ]) {
        const input = form.querySelector<HTMLInputElement>(`[name="${max}"]`);
        const average = Number(pit.answers[avg] ?? 0);
        input?.setCustomValidity(
          average > Number(pit.answers[max] ?? Infinity)
            ? `Maximum ${phase} HIVE TIPs can't be lower than the average (${average}).`
            : "",
        );
      }
      if (!form.reportValidity()) {
        const invalid = [...form.elements].find(
          (e) => e instanceof HTMLInputElement && !e.validity.valid,
        ) as HTMLInputElement | undefined;
        if (invalid) toast(invalid.validationMessage);
        return;
      }
      const existing = active(database.pits).find(
        (p) => p.team === pit.team && p.eventId === eventId,
      );
      if (existing) pit.id = existing.id;
      await saveEntity("teams", {
        id: String(pit.team),
        number: pit.team,
        name: teamName.trim(),
        updatedAt: now(),
      });
      const event = active(database.events).find((e) => e.id === eventId)!;
      if (!event.teams.includes(pit.team))
        await saveEntity("events", {
          ...event,
          teams: [...event.teams, pit.team],
        });
      await saveEntity("pits", pit);
      await clearDraft(`pit:${eventId}`);
      toast(`Pit record saved for ${pit.team}.`);
      location.hash = `team/${pit.team}`;
    };
  }
  render();
}
