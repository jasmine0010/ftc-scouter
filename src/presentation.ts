/** Keep data and controls; remove redundant explanatory presentation copy. */
import { plainLabel } from "./ui.js";
export function cleanView(root: HTMLElement) {
  root.querySelectorAll("dt,legend").forEach((element) => {
    const current = element.textContent ?? "";
    const label = plainLabel(current);
    if (current !== label) element.textContent = label;
  });
  root
    .querySelectorAll(
      ".eyebrow,.lede,.hint,.quiet,.source-note,.save-state,.section-head > p,.empty > p,.standings-context > p:first-child",
    )
    .forEach((element) => element.remove());
  root
    .querySelectorAll("[title]")
    .forEach((element) => element.removeAttribute("title"));
}
