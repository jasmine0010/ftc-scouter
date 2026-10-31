import { exportFile } from "./storage.js";
import type { Route } from "./types.js";
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
  return `<label class="field"><span>${esc(label)}</span><input name="${esc(name)}" type="${type}" value="${esc(value)}" ${extra}></label>`;
}
export function select(
  label: string,
  name: string,
  value: unknown,
  options: (string | [string, string])[],
) {
  return `<label class="field"><span>${esc(label)}</span><select name="${esc(name)}">${options
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
  return `<label class="field wide"><span>${esc(label)}</span><textarea name="${esc(name)}" rows="3" ${extra}>${esc(value)}</textarea></label>`;
}
export function toggle(label: string, name: string, value: unknown) {
  return `<label class="toggle"><span>${esc(label)}</span><input type="checkbox" name="${esc(name)}"${checked(value)}><span class="toggle-ui" aria-hidden="true"></span></label>`;
}
export function counter(
  label: string,
  name: string,
  value: unknown,
  max = 999,
  step = 1,
) {
  return `<label class="counter"><span>${esc(label)}</span><span class="stepper"><button type="button" data-step="-${step}" data-for="${esc(name)}" aria-label="Decrease ${esc(label)}">−</button><input type="number" inputmode="${step < 1 ? "decimal" : "numeric"}" name="${esc(name)}" value="${esc(value ?? 0)}" min="0" max="${max}" step="${step}" aria-label="${esc(label)}"><button type="button" data-step="${step}" data-for="${esc(name)}" aria-label="Increase ${esc(label)}">+</button></span></label>`;
}
export function bindSteppers(root: HTMLElement) {
  const refresh = () =>
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
  root.addEventListener("input", refresh);
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
  return `<section class="section"><header class="section-head"><h2>${esc(title)}</h2></header>${content}</section>`;
}
export function table(headers: string[], rows: string[][], label = "Data") {
  return `<div class="table-wrap" tabindex="0" role="region" aria-label="${esc(label)}"><table><thead><tr>${headers.map((h) => `<th scope="col">${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((c, i) => `<td${i === 0 ? ' class="first"' : ""}>${c}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
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
  return `<svg class="trend" viewBox="0 0 ${width} ${height}" role="img" aria-label="Points trend: ${values.map((v) => fmt(v, 0)).join(", ")}"><line x1="16" y1="${height - 24}" x2="${width - 12}" y2="${height - 24}" class="grid-line"/><polyline points="${points}" fill="none" stroke="var(--white)" stroke-width="1.5"/>${values.map((v, i) => `<circle cx="${16 + i * step}" cy="${height - 24 - (v / max) * (height - 40)}" r="2.5" fill="var(--white)"/><text x="${16 + i * step}" y="${height - 7}" text-anchor="middle">${esc(labels?.[i] ?? i + 1)}</text>`).join("")}</svg>`;
}
const routeMarkup = (routes: { route: Route; partner?: boolean }[]) =>
  routes
    .map(({ route, partner }) =>
      route.paths
        .map(
          (path) =>
            `<polyline points="${path.map((p) => `${p.x},${p.y}`).join(" ")}" fill="none" stroke="${partner ? "#beb9b6" : "#f3f1eb"}" stroke-width="1.4"${partner ? ' stroke-dasharray="3 2"' : ""} stroke-linecap="round" stroke-linejoin="round"/>${path[0] ? `<circle cx="${path[0].x}" cy="${path[0].y}" r="2.5" fill="${partner ? "#f3f1eb" : "#beb9b6"}"/>` : ""}`,
        )
        .join(""),
    )
    .join("");
/** Nominal-inch SVG: top-left origin, audience below, red left. See RULES-RESEARCH.md. */
export function fieldSVG(
  routes: { route: Route; partner?: boolean }[] = [],
  interactive = false,
) {
  return `<svg ${interactive ? 'id="route-canvas"' : ""} class="field-map${interactive ? " drawable" : ""}" viewBox="-10 -10 164 169" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="BIOBUZZ top-down field, 144 by 144 inches. Red left, blue right, audience below."><rect x="0" y="0" width="144" height="144" fill="#070302" stroke="#beb9b6" stroke-width=".6"/><defs><clipPath id="official-field-clip"><rect x="0" y="0" width="144" height="144"/></clipPath></defs><image href="/biobuzz-field.png" x="-58.07" y="-9.02" width="260.14" height="165.58" preserveAspectRatio="none" clip-path="url(#official-field-clip)" style="filter:grayscale(1) brightness(.4)"/>${[24, 48, 72, 96, 120].map((n) => `<path d="M${n} 0V144 M0 ${n}H144" fill="none" stroke="#342c2a" stroke-width=".35"/>`).join("")}<rect x="0" y="24" width="11" height="23" fill="#241d1b" stroke="#beb9b6" stroke-width=".5"/><rect x="133" y="97" width="11" height="23" fill="#241d1b" stroke="#beb9b6" stroke-width=".5"/><rect x="0" y="142" width="23" height="2" fill="#beb9b6"/><rect x="121" y="0" width="23" height="2" fill="#beb9b6"/><rect x="47.3" y="52.5" width="49.4" height="39" rx=".5" fill="none" stroke="#beb9b6" stroke-width=".8"/><path d="M60 54V90 M84 54V90" stroke="#beb9b6" stroke-width=".6"/>${[60, 84].map((x) => [56, 88].map((y) => `<rect x="${x - 7}" y="${y - 5}" width="14" height="10" fill="#241d1b" stroke="#beb9b6" stroke-width=".6"/>`).join("")).join("")}<g fill="#f3f1eb" font-family="Archivo,Arial,sans-serif" font-size="8" text-anchor="middle"><text x="60" y="74">R Hive</text><text x="84" y="74">B Hive</text><text x="18" y="35">R Load</text><text x="123" y="109">B Load</text><text x="16" y="138">R Garden</text><text x="127" y="8">B Garden</text><text x="72" y="155">Audience</text>${[12, 36, 60, 84, 108, 132].map((x, i) => `<text x="${x}" y="-4">${"ABCDEF"[i]}</text><text x="-5" y="${x}">${6 - i}</text>`).join("")}</g>${[
    [48, 2],
    [142, 48],
    [96, 142],
    [2, 96],
  ]
    .map(
      ([x, y], i) =>
        `<circle cx="${x}" cy="${y}" r="2" fill="#f3f1eb"/><text x="${x + (x < 5 ? 10 : x > 140 ? -10 : 0)}" y="${y < 5 ? 12 : y > 140 ? y - 6 : y - 5}" fill="#f3f1eb" font-family="Archivo,Arial,sans-serif" font-size="8" text-anchor="middle">F${i + 1}</text>`,
    )
    .join(
      "",
    )}<g id="route-paths">${routeMarkup(routes)}</g><g id="route-conflicts"></g></svg>`;
}
export function bindDrawing(
  svg: SVGSVGElement,
  route: Route,
  onChange: () => void,
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
    const blob = await (await fetch("/biobuzz-field.png")).blob();
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    sourceImage.setAttribute("href", data);
  }
  clone.setAttribute("width", "1000");
  clone.setAttribute("height", "1030");
  const xml = new XMLSerializer().serializeToString(clone),
    url = URL.createObjectURL(new Blob([xml], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = 1000;
    canvas.height = 1030;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, 1000, 1030);
    ctx.drawImage(img, 0, 0, 1000, 1030);
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
