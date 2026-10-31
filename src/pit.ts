import { GAME } from "./game.js";
import {
  active,
  now,
  uid,
  type Pit,
  type PitAnswers,
  type Route,
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
} from "./ui.js";
export const pitSections: {
  title: string;
  fields: [string, string, string, string[]?][];
}[] = [
  {
    title: "Autonomous",
    fields: [
      ["leave", "LEAVE", "bool"],
      ["autoPark", "PARK", "bool"],
      ["attemptTip", "Attempts HIVE TIP", "bool"],
      ["autoTipsAvg", "Average HIVE TIPs", "average"],
      ["autoTipsMax", "Maximum HIVE TIPs", "number"],
      ["autoLaunched", "Average elements launched", "average"],
      ["cellAvg", "Average elements left in a CELL", "average"],
      ["nearSynopsis", "Near starting-position synopsis", "text"],
      ["farSynopsis", "Far starting-position synopsis", "text"],
      ["autoNotes", "AUTO notes / other starting positions", "text"],
    ],
  },
  {
    title: "TeleOp",
    fields: [
      ["teleTipsAvg", "Average HIVE TIPs", "average"],
      ["teleTipsMax", "Maximum HIVE TIPs", "number"],
      ["gardenAvg", "Average GARDEN deliveries", "average"],
      ["flowersAvg", "Average FLOWER placements", "average"],
      ["topNectar", "Can take ownership with top NECTAR", "bool"],
      ["bottomBonus", "Can earn bottom NECTAR bonus", "bool"],
      [
        "launchPosition",
        "Primary launch position",
        "select",
        ["Near", "Center", "Far", "Perimeter", "Flexible"],
      ],
      ["accuracy", "Launcher accuracy (1–5)", "rating"],
      ["cycleTime", "Estimated cycle time (seconds)", "average"],
      ["zonePreference", "Zone preference", "text"],
      ["teleNotes", "TeleOp notes", "text"],
    ],
  },
  {
    title: "Last-minute plan",
    fields: [
      ["lastPlan", "Plan when FLOWER scoring opens", "text"],
      ["park", "PARK at end of match", "bool"],
      ["humanPlayer", "Handles human-player NECTAR loading", "bool"],
      ["lastNotes", "Last-minute / loading-zone notes", "text"],
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
      ["mass", "Robot mass (kg)", "average"],
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
        r.label = String(values.routeLabel ?? r.label);
        r.start = String(values.routeStart ?? r.start);
      }
    }
    if (step === 3) pit.answers = { ...pit.answers, ...values };
  };
  function ensureRoute() {
    if (!pit.routes.length)
      pit.routes.push({
        id: uid(),
        label: "Near · primary",
        start: "Near",
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
                      answers[key],
                      type === "capacity" ? GAME.limits.possession : 999,
                      type === "average" ? 0.1 : 1,
                    ),
        )
        .join("");
    root.innerHTML = `<div class="page-heading"><div><p class="eyebrow">PIT SCOUTING / ${esc(GAME.season)}</p><h2>Pit Scouting</h2><p class="lede">One record per team. Routes, capabilities and the plan behind the numbers.</p></div><span class="quiet" id="draft-status">Draft autosaves on this device</span></div><ol class="steps" aria-label="Pit scouting steps">${["Team information", "Auto field positions", "Robot analysis"].map((s, i) => `<li${step === i + 1 ? ' aria-current="step"' : ""}><span>${i + 1}</span>${s}</li>`).join("")}</ol><form id="pit-form"><div id="pit-error" class="errors" role="alert"></div>${
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
                `<div class="route-layout"><div>${fieldSVG([{ route }], true)}<p class="hint">Draw with touch, stylus or mouse. Nominal 144 × 144 in field coordinates.</p></div><div><label class="field"><span>Saved routes</span><select id="route-select">${pit.routes.map((r) => `<option value="${esc(r.id)}"${r.id === routeId ? " selected" : ""}>${esc(r.label)}</option>`).join("")}</select></label><div class="form-grid">${field("Route label", "routeLabel", route.label)}${select("Starting position", "routeStart", route.start, ["Near", "Far", "Center", "Other"])}</div><div class="button-row"><button type="button" id="route-add">New route</button><button type="button" id="route-undo">Undo stroke</button><button type="button" id="route-clear">Clear route</button><button type="button" id="route-export">Export PNG</button></div><p class="hint">Solid off-white = this route. An alliance overlay is available in the Alliance desk. Routes are stored as vector strokes, never flattened.</p></div></div>`,
              );
            })()
          : pitSections
              .map((s) =>
                section(
                  s.title,
                  `<div class="form-grid">${fields(pit.answers, s.fields)}${s.title === "TeleOp" ? `<div class="wide launch-selector"><span>Field-position selector</span>${fieldSVG()}<div class="button-row">${["Near", "Center", "Far", "Perimeter", "Flexible"].map((pos) => `<button type="button" data-launch="${pos}" aria-pressed="${pit.answers.launchPosition === pos}">${pos}</button>`).join("")}</div></div>` : ""}${s.title === "Additional information" ? `<label class="field"><span>Robot photo · JPEG, PNG, WebP</span><input type="file" id="pit-photo" accept="image/jpeg,image/png,image/webp"></label>${pit.photo ? `<img class="robot-photo" src="${esc(pit.photo)}" alt="Robot ${pit.team}"><button type="button" id="remove-photo">Remove photo</button>` : ""}` : ""}</div>`,
                ),
              )
              .join("")
    }<div class="form-footer"><button type="button" id="pit-prev"${step === 1 ? " disabled" : ""}>← Previous</button><span>Step ${step} of 3</span>${step < 3 ? '<button class="primary" type="button" id="pit-next">Next →</button>' : '<button class="primary" type="submit">Save All Data</button>'}</div></form>`;
    const form = root.querySelector<HTMLFormElement>("#pit-form")!;
    bindSteppers(form);
    form.oninput = () => {
      capture();
      void save();
    };
    const next = root.querySelector<HTMLButtonElement>("#pit-next");
    if (next)
      next.onclick = () => {
        capture();
        if (
          step === 1 &&
          (!Number.isInteger(pit.team) || pit.team < 1 || !teamName.trim())
        ) {
          root.querySelector("#pit-error")!.textContent =
            "Team number and name are required.";
          return;
        }
        step++;
        void save();
        render();
        window.scrollTo(0, 0);
      };
    root.querySelector<HTMLButtonElement>("#pit-prev")!.onclick = () => {
      capture();
      step = Math.max(1, step - 1);
      void save();
      render();
      window.scrollTo(0, 0);
    };
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
        () => void save(),
      );
      root.querySelector<HTMLSelectElement>("#route-select")!.onchange = (
        e,
      ) => {
        capture();
        routeId = (e.target as HTMLSelectElement).value;
        void save();
        render();
      };
      root.querySelector<HTMLButtonElement>("#route-add")!.onclick = () => {
        capture();
        const r: Route = {
          id: uid(),
          label: `Route ${pit.routes.length + 1}`,
          start: "Near",
          paths: [],
        };
        pit.routes.push(r);
        routeId = r.id;
        void save();
        render();
      };
      root.querySelector<HTMLButtonElement>("#route-undo")!.onclick = () => {
        capture();
        route.paths.pop();
        void save();
        render();
      };
      root.querySelector<HTMLButtonElement>("#route-clear")!.onclick = () => {
        capture();
        route.paths = [];
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
      if (!form.reportValidity()) return;
      const a = pit.answers;
      if (
        Number(a.autoTipsAvg ?? 0) > Number(a.autoTipsMax ?? Infinity) ||
        Number(a.teleTipsAvg ?? 0) > Number(a.teleTipsMax ?? Infinity)
      ) {
        root.querySelector("#pit-error")!.textContent =
          "Average TIPs cannot exceed maximum TIPs.";
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
