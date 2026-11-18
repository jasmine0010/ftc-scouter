import { exportFile } from "./storage.js";
import { routeSequence, type Route, type RouteMarkType } from "./types.js";
export const esc = (v: unknown) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export const fmt = (n: number, d = 1) =>
  Number.isFinite(n) ? n.toFixed(d) : "—";
export const pct = (n: number) => `${Math.round(n * 100)}%`;
export const selected = (a: unknown, b: unknown) =>
  a === b ? " selected" : "";
export const checked = (v: unknown) => (v ? " checked" : "");
export const plainLabel = (label: string) => {
  const text = label.replace(
    /\b(?:LEAVE|PARK|HIVE|TIPs?|CELLs?|FLOWERs?|GARDENs?|NECTAR|POLLEN|AUTO|TELEOP|SWARM|POLLINATOR)\b/g,
    (word) => word.toLowerCase(),
  );
  return text.charAt(0).toUpperCase() + text.slice(1);
};
export function toast(message: string) {
  const e = document.querySelector<HTMLElement>("#toast")!;
  e.textContent = message;
  e.classList.add("visible");
  setTimeout(() => e.classList.remove("visible"), 4500);
}
export function field(
  label: string,
  name: string,
  value: unknown = "",
  type = "text",
  extra = "",
) {
  const mark = /(^|\s)required(\s|=|$)/.test(extra)
    ? '<span class="required-mark" aria-hidden="true"> *</span>'
    : "";
  return `<label class="field"><span>${esc(plainLabel(label))}${mark}</span><input name="${esc(name)}" type="${type}" value="${esc(value)}" ${extra}></label>`;
}
export function select(
  label: string,
  name: string,
  value: unknown,
  options: (string | [string, string])[],
) {
  return `<label class="field"><span>${esc(plainLabel(label))}</span><select name="${esc(name)}">${options
    .map((o) => {
      const [v, l] = Array.isArray(o) ? o : [o, o];
      return `<option value="${esc(v)}"${selected(String(value ?? ""), v)}>${esc(l)}</option>`;
    })
    .join("")}</select></label>`;
}
export function textArea(
  label: string,
  name: string,
  value: unknown = "",
  extra = "",
) {
  return `<label class="field wide"><span>${esc(plainLabel(label))}</span><textarea name="${esc(name)}" rows="3" ${extra}>${esc(value)}</textarea></label>`;
}
/** A row of large tap targets backed by radio inputs (one answer). */
export function choices(
  label: string,
  name: string,
  value: unknown,
  options: [string, string][],
) {
  return `<fieldset class="choice-group"><legend>${esc(plainLabel(label))}</legend><div>${options.map(([v, text]) => `<label><input type="radio" name="${esc(name)}" value="${esc(v)}"${String(value) === v ? " checked" : ""}><span>${esc(text)}</span></label>`).join("")}</div></fieldset>`;
}
export function toggle(label: string, name: string, value: unknown) {
  return `<label class="yes-no-row"><input type="checkbox" name="${esc(name)}"${checked(value)}><span>${esc(plainLabel(label))}</span><strong class="yes-no-state" aria-hidden="true">${value ? "Yes" : "No"}</strong></label>`;
}
/** Characters in a counter value; the stepper's number box is that many characters wide. */
const digits = (value: unknown) => Math.max(1, String(value).length);
export function counter(
  label: string,
  name: string,
  value: unknown,
  max = 999,
  step = 1,
) {
  const icon = (plus: boolean) =>
    `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M5 12h14${plus ? "M12 5v14" : ""}"/></svg>`;
  return `<label class="counter"><span>${esc(plainLabel(label))}</span><span class="stepper"><button type="button" data-step="-${step}" data-for="${esc(name)}" aria-label="Decrease ${esc(plainLabel(label))}">${icon(false)}</button><input type="number" inputmode="${step < 1 ? "decimal" : "numeric"}" name="${esc(name)}" value="${esc(value ?? 0)}" style="--digits: ${digits(value ?? 0)}" min="0" max="${max}" step="${step}" aria-label="${esc(plainLabel(label))}"><button type="button" data-step="${step}" data-for="${esc(name)}" aria-label="Increase ${esc(plainLabel(label))}">${icon(true)}</button></span></label>`;
}
export function bindSteppers(root: HTMLElement) {
  const refresh = () => {
    root
      .querySelectorAll<HTMLInputElement>(".stepper input")
      .forEach((input) =>
        input.style.setProperty("--digits", String(digits(input.value))),
      );
    root.querySelectorAll<HTMLButtonElement>("[data-step]").forEach((b) => {
      const input = root.querySelector<HTMLInputElement>(
        `[name="${b.dataset.for}"]`,
      );
      if (input)
        b.disabled =
          Number(b.dataset.step) < 0
            ? Number(input.value) <= Number(input.min || 0)
            : Number(input.value) >= Number(input.max || Infinity);
    });
  };
  root.addEventListener("input", () => {
    refresh();
    root
      .querySelectorAll<HTMLInputElement>(".yes-no-row input")
      .forEach((input) => {
        const state = input.parentElement?.querySelector(".yes-no-state");
        if (state) state.textContent = input.checked ? "Yes" : "No";
      });
  });
  refresh();
  root.querySelectorAll<HTMLButtonElement>("[data-step]").forEach(
    (b) =>
      (b.onclick = () => {
        const input = root.querySelector<HTMLInputElement>(
          `[name="${b.dataset.for}"]`,
        )!;
        input.value = String(
          Math.min(
            Number(input.max || Infinity),
            Math.max(
              Number(input.min || 0),
              Math.round((Number(input.value) + Number(b.dataset.step)) * 100) /
                100,
            ),
          ),
        );
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }),
  );
}
export function formValues(
  form: HTMLFormElement,
): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const el of form.elements) {
    if (el instanceof HTMLInputElement && el.type === "radio" && !el.checked)
      continue;
    if (el instanceof HTMLInputElement && el.name)
      out[el.name] =
        el.type === "checkbox"
          ? el.checked
          : el.type === "number"
            ? Number(el.value)
            : el.value;
    else if (
      (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) &&
      el.name
    )
      out[el.name] = el.value;
  }
  return out;
}
export const empty = (title: string, body: string) =>
  `<div class="empty"><h3>${esc(title)}</h3></div>`;
export function section(title: string, content: string, hint = "") {
  return `<section class="section"><header class="section-head"><h3>${esc(plainLabel(title))}</h3></header>${content}</section>`;
}
export function table(headers: string[], rows: string[][], label = "Data") {
  return `<div class="table-wrap" tabindex="0" role="region" aria-label="${esc(plainLabel(label))}"><table><thead><tr>${headers.map((h) => `<th scope="col">${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((c, i) => `<td${i === 0 ? ' class="first"' : ""}>${c}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}
export function sparkline(
  values: number[],
  width = 400,
  height = 100,
  labels?: string[],
) {
  if (!values.length) return '<p class="muted">No scouted matches.</p>';
  const max = Math.max(...values, 1),
    step = (width - 32) / Math.max(1, values.length - 1),
    points = values
      .map(
        (v, i) => `${16 + i * step},${height - 24 - (v / max) * (height - 40)}`,
      )
      .join(" ");
  return `<svg class="trend" viewBox="0 0 ${width} ${height}" role="img" aria-label="Points trend: ${values.map((v) => fmt(v, 0)).join(", ")}"><line x1="16" y1="${height - 24}" x2="${width - 12}" y2="${height - 24}" class="grid-line"/><polyline points="${points}" fill="none" stroke="var(--white)" stroke-width="1.5"/>${values.map((v, i) => `<circle cx="${16 + i * step}" cy="${height - 24 - (v / max) * (height - 40)}" r="2.5" fill="var(--red)"/><text x="${16 + i * step}" y="${height - 7}" text-anchor="middle">${esc(labels?.[i] ?? i + 1)}</text>`).join("")}</svg>`;
}
const routeMarkup = (routes: { route: Route; partner?: boolean }[]) =>
  routes
    .map(({ route, partner }) => {
      const stroke = partner ? "#beb9b6" : "#f3f1eb",
        dot = partner ? "#f3f1eb" : "#802010",
        ink = partner ? "#000" : "#f3f1eb";
      const lines = route.paths
        .map(
          (path) =>
            `<polyline points="${path.map((p) => `${p.x},${p.y}`).join(" ")}" fill="none" stroke="${stroke}" stroke-width="1.4"${partner ? ' stroke-dasharray="3 2"' : ""} stroke-linecap="round" stroke-linejoin="round"/>`,
        )
        .join("");
      // The starting spot is drawn as an 18-inch robot footprint.
      const o = route.origin,
        origin = o
          ? `<g class="stroke-marker route-origin"><title>Start</title><rect x="${o.x - 9}" y="${o.y - 9}" width="18" height="18" rx="1.5" fill="${partner ? "rgba(190,185,182,0.18)" : "rgba(128,32,16,0.35)"}" stroke="${stroke}" stroke-width="0.9" stroke-dasharray="2.4 1.6"/><text x="${o.x}" y="${o.y}" text-anchor="middle" dominant-baseline="central" font-family="Archivo, Arial, sans-serif" font-size="4" font-weight="700" fill="${stroke}">START</text></g>`
          : "";
      // Numbered start markers and action stamps sit above every line.
      const markers = routeSequence(route)
        .map((step) => {
          if (step.kind === "path") {
            const p = step.path[0];
            return p
              ? `<g class="stroke-marker"><circle cx="${p.x}" cy="${p.y}" r="3.6" fill="${dot}" stroke="#000" stroke-width="0.5"/><text x="${p.x}" y="${p.y}" text-anchor="middle" dominant-baseline="central" font-family="Archivo, Arial, sans-serif" font-size="4.4" font-weight="700" fill="${ink}">${step.n}</text></g>`
              : "";
          }
          const { x, y, type } = step.mark,
            launch = type === "launch";
          return `<g class="stroke-marker route-mark"><title>${step.n}. ${launch ? "Launch" : "Intake"}</title><rect x="${x - 3.8}" y="${y - 3.8}" width="7.6" height="7.6" rx="1" fill="${launch ? "#f3f1eb" : "#000"}" stroke="${launch ? "#000" : "#f3f1eb"}" stroke-width="0.6"/><text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="central" font-family="Archivo, Arial, sans-serif" font-size="4.6" font-weight="700" fill="${launch ? "#000" : "#f3f1eb"}">${launch ? "L" : "I"}</text><text x="${x + 4.6}" y="${y - 4.2}" font-family="Archivo, Arial, sans-serif" font-size="3.2" font-weight="700" fill="#f3f1eb" stroke="#000" stroke-width="0.6" paint-order="stroke">${step.n}</text></g>`;
        })
        .join("");
      return origin + lines + markers;
    })
    .join("");
// Image bounds preserve the existing 0–144 inch route coordinate system.
const FIELD_ARTWORK = { x: -58.07, y: -9.02, width: 260.14, height: 165.58 };
/** One-line key for route drawings: start footprint, path order and AUTO stamps. */
export function routeLegend(hidden = false, stamps = true) {
  return `<p class="route-legend"${hidden ? " hidden" : ""}><span><i class="key-start" aria-hidden="true"></i>Start</span><span><i class="key-step" aria-hidden="true">1</i>Path order</span>${stamps ? `<span><i class="tool-stamp intake" aria-hidden="true">I</i>Intake</span><span><i class="tool-stamp launch" aria-hidden="true">L</i>Launch</span>` : ""}</p>`;
}
export function fieldSVG(
  routes: { route: Route; partner?: boolean }[] = [],
  interactive = false,
) {
  const { x, y, width, height } = FIELD_ARTWORK;
  return `<svg ${interactive ? 'id="route-canvas"' : ""} class="field-map${interactive ? " drawable" : ""}" viewBox="0 0 144 144" overflow="hidden" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Official BIOBUZZ field"><image href="./biobuzz-field.png" x="${x}" y="${y}" width="${width}" height="${height}"/><g id="route-paths">${routeMarkup(routes)}</g><g id="route-conflicts"></g></svg>`;
}
export function bindDrawing(
  svg: SVGSVGElement,
  route: Route,
  onChange: () => void,
  /** When it returns a stamp type, a tap places that stamp instead of drawing. */
  stamp: () => RouteMarkType | "start" | null = () => null,
  onStamp: () => void = onChange,
) {
  let drawing = false;
  const point = (e: PointerEvent) => {
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(
      svg.getScreenCTM()!.inverse(),
    );
    return {
      x: Math.round(Math.min(144, Math.max(0, p.x)) * 10) / 10,
      y: Math.round(Math.min(144, Math.max(0, p.y)) * 10) / 10,
    };
  };
  const redraw = () => {
    svg.querySelector("#route-paths")!.innerHTML = routeMarkup([{ route }]);
  };
  svg.onpointerdown = (e) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    e.preventDefault();
    const type = stamp();
    if (type === "start") {
      route.origin = point(e);
      redraw();
      onStamp();
      return;
    }
    if (type) {
      (route.marks ??= []).push({ ...point(e), type, at: route.paths.length });
      redraw();
      onStamp();
      return;
    }
    svg.setPointerCapture(e.pointerId);
    drawing = true;
    route.paths.push([point(e)]);
    redraw();
  };
  svg.onpointermove = (e) => {
    if (!drawing) return;
    const p = point(e),
      path = route.paths[route.paths.length - 1],
      last = path[path.length - 1];
    if (Math.hypot(p.x - last.x, p.y - last.y) > 0.6) {
      path.push(p);
      redraw();
    }
  };
  const finish = () => {
    if (drawing) {
      drawing = false;
      onChange();
    }
  };
  svg.onpointerup = finish;
  svg.onpointercancel = finish;
}
export async function exportRoutePNG(svg: SVGSVGElement, name: string) {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const sourceImage = clone.querySelector("image");
  if (sourceImage) {
    const blob = await (await fetch("./biobuzz-field.png")).blob();
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    sourceImage.setAttribute("href", data);
  }
  const exportWidth = 1000;
  const exportHeight = Math.round(
    (exportWidth * svg.viewBox.baseVal.height) / svg.viewBox.baseVal.width,
  );
  clone.setAttribute("width", String(exportWidth));
  clone.setAttribute("height", String(exportHeight));
  const xml = new XMLSerializer().serializeToString(clone),
    url = URL.createObjectURL(new Blob([xml], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = exportWidth;
    canvas.height = exportHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, exportWidth, exportHeight);
    ctx.drawImage(img, 0, 0, exportWidth, exportHeight);
    const blob = await new Promise<Blob | null>((r) =>
      canvas.toBlob(r, "image/png"),
    );
    if (blob) exportFile(name, blob);
  } finally {
    URL.revokeObjectURL(url);
  }
}
export async function compressPhoto(file: File): Promise<string> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new Error("Use a JPEG, PNG or WebP image.");
  if (file.size > 20 * 1024 * 1024)
    throw new Error("Photo must be smaller than 20 MB.");
  const bitmap = await createImageBitmap(file),
    scale = Math.min(1, 1000 / Math.max(bitmap.width, bitmap.height)),
    canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.72);
}
