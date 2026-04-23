import { computePosition, flip, offset, shift } from "@floating-ui/dom";
import type { Arbor, TreeNode } from "./types";

const fmtCount = new Intl.NumberFormat();
const fmtPct = (p: number) => `${(p * 100).toFixed(1)}%`;
const fmtNum = (v: number, digits = 3) =>
  Math.abs(v) >= 1000 || (v !== 0 && Math.abs(v) < 0.001)
    ? v.toExponential(2)
    : v.toFixed(digits).replace(/\.?0+$/, "");

export function renderTooltip(node: TreeNode, arbor: Arbor): string {
  const head =
    arbor.response.type === "classification"
      ? `<strong>${escape(node.predicted_class ?? "?")}</strong> — node #${node.node_id}`
      : `<strong>ŷ = ${fmtNum(node.predicted_value ?? NaN, 3)}</strong> — node #${node.node_id}`;

  const rows: [string, string][] = [
    ["n", fmtCount.format(node.n)],
    ["impurity", fmtNum(node.impurity, 3)],
  ];

  if (arbor.response.type === "classification" && node.class_probs && arbor.response.levels) {
    const top = arbor.response.levels
      .map((lvl, i) => ({ lvl, p: node.class_probs![i] ?? 0 }))
      .sort((a, b) => b.p - a.p)
      .slice(0, 3)
      .map(({ lvl, p }) => `${escape(lvl)} ${fmtPct(p)}`)
      .join(" · ");
    rows.push(["probs", top]);
  }

  if (!node.is_leaf && node.split_var) {
    rows.push(["split", escape(splitLabel(node))]);
  }

  const kv = rows.map(([k, v]) => `<span class="k">${k}</span><span>${v}</span>`).join("");
  return `<div>${head}</div><div class="kv">${kv}</div>`;
}

export function splitLabel(node: TreeNode): string {
  if (!node.split || !node.split_var) return "";
  const s = node.split;
  if (s.type === "numeric") {
    const thr = fmtNum(s.threshold, 4);
    return `${node.split_var} ${s.left_op} ${thr}`;
  }
  const left = s.left_levels.join(", ");
  return `${node.split_var} ∈ {${left}}`;
}

export async function positionTooltip(
  el: HTMLElement,
  reference: { getBoundingClientRect(): DOMRect },
  container: HTMLElement,
): Promise<void> {
  const { x, y } = await computePosition(reference, el, {
    placement: "top",
    strategy: "absolute",
    middleware: [offset(10), flip(), shift({ padding: 8, boundary: container })],
  });
  el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
}

function escape(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );
}
