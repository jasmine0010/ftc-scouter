/** Remove retired presentation copy from retained analysis and pit views. */
export function simplifyContent(root: HTMLElement) {
  const sentenceCase = (text: string) => {
    const lower = text.replace(
      /\b(?:HIVE|TIPs?|POLLEN|NECTAR|CELLs?|FLOWERs?|GARDENs?|LEAVE|PARK|AUTO|TELEOP|TeleOp|SWARM|POLLINATOR)\b/g,
      (word) => word.toLowerCase(),
    );
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  };
  root
    .querySelectorAll(
      "label > span:first-child,legend,th,dt,.rp-grid > div > span",
    )
    .forEach((el) => {
      for (const node of el.childNodes) {
        if (node.nodeType !== Node.TEXT_NODE) continue;
        const text = node.textContent ?? "";
        const plain = sentenceCase(text);
        if (plain !== text) node.textContent = plain;
      }
    });
  root
    .querySelectorAll(
      ".eyebrow,.lede,.hint,.quiet,.source-note,.table-meta,.standings-context,.reason-list,.pit-heading,.section-head > p,.projection small,.pick-recommendation > p,.overlay-layout > div > p",
    )
    .forEach((el) => el.remove());
  root
    .querySelectorAll<HTMLElement>(".steps li")
    .forEach((el) => el.querySelector("span")?.remove());
  root
    .querySelectorAll<HTMLElement>(".section > details > p,.empty > p")
    .forEach((el) => el.remove());
  root
    .querySelectorAll<HTMLElement>(".section-head, .page-heading")
    .forEach((el) => {
      if (!el.textContent?.trim()) el.remove();
    });
  [...root.querySelectorAll<HTMLElement>(".primary")]
    .slice(1)
    .forEach((el) => el.classList.remove("primary"));
  root
    .querySelectorAll<HTMLElement>("[title]")
    .forEach((el) => el.removeAttribute("title"));
}
