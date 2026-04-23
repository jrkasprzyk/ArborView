/**
 * tooltip.ts — Tooltip content generation and positioning.
 *
 * renderTooltip()  – Returns an HTML string for the tooltip inner content.
 * splitLabel()     – Returns a human-readable split condition string.
 * positionTooltip() – Uses Floating UI to place the tooltip next to a node.
 */

import { computePosition, flip, offset, shift } from "@floating-ui/dom";
import type { Arbor, TreeNode } from "./types";
import { escapeHtml, formatNum } from "./utils";

// Number formatter for sample counts (adds thousands separators, e.g. "1,234").
const fmtCount = new Intl.NumberFormat();

// Percentage formatter: 0.456 → "45.6%"
const fmtPct = (p: number) => `${(p * 100).toFixed(1)}%`;

// ---------------------------------------------------------------------------
// Tooltip HTML
// ---------------------------------------------------------------------------

/**
 * Build the HTML string shown inside the tooltip when hovering a node.
 *
 * The tooltip has two sections:
 *   1. A header line: predicted class/value + node ID.
 *   2. A key-value grid with sample count, impurity, top probabilities, split.
 *
 * All user-supplied strings are escaped via escapeHtml() to prevent XSS.
 */
export function renderTooltip(node: TreeNode, arbor: Arbor): string {
  const head =
    arbor.response.type === "classification"
      ? `<strong>${escapeHtml(node.predicted_class ?? "?")}</strong> — node #${node.node_id}`
      : `<strong>ŷ = ${formatNum(node.predicted_value ?? NaN, 3)}</strong> — node #${node.node_id}`;

  const rows: [string, string][] = [
    ["n",        fmtCount.format(node.n)],
    ["impurity", formatNum(node.impurity, 3)],
  ];

  // For classification, show the top-3 class probabilities.
  if (arbor.response.type === "classification" && node.class_probs && arbor.response.levels) {
    const top = arbor.response.levels
      .map((lvl, i) => ({ lvl, p: node.class_probs![i] ?? 0 }))
      .sort((a, b) => b.p - a.p)
      .slice(0, 3)
      .map(({ lvl, p }) => `${escapeHtml(lvl)} ${fmtPct(p)}`)
      .join(" · ");
    rows.push(["probs", top]);
  }

  // For internal nodes, show the split condition.
  if (!node.is_leaf && node.split_var) {
    rows.push(["split", escapeHtml(splitLabel(node))]);
  }

  const kv = rows.map(([k, v]) => `<span class="k">${k}</span><span>${v}</span>`).join("");
  return `<div>${head}</div><div class="kv">${kv}</div>`;
}

// ---------------------------------------------------------------------------
// Split label
// ---------------------------------------------------------------------------

/**
 * Return a human-readable string describing the split at an internal node.
 *
 * Examples:
 *   Numeric:     "age < 12.5"
 *   Categorical: "region ∈ {West, South}"
 *
 * For categorical splits with many levels the level list is truncated to
 * keep the label readable in the UI.
 */
export function splitLabel(node: TreeNode): string {
  if (!node.split || !node.split_var) return "";
  const s = node.split;

  if (s.type === "numeric") {
    const thr = formatNum(s.threshold, 4);
    return `${node.split_var} ${s.left_op} ${thr}`;
  }

  // Categorical split: join levels, truncate if the string gets very long.
  let left = s.left_levels.join(", ");
  if (left.length > 60) left = left.slice(0, 57) + "…";
  return `${node.split_var} ∈ {${left}}`;
}

// ---------------------------------------------------------------------------
// Positioning
// ---------------------------------------------------------------------------

/**
 * Compute the best position for the tooltip relative to a tree node and
 * apply it via CSS transform.
 *
 * Uses Floating UI's middleware stack:
 *   offset(10)  – 10px gap between the node and tooltip edge
 *   flip()      – switch to "below" if there's not enough space above
 *   shift()     – slide horizontally to keep the tooltip inside the canvas
 */
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
  // Math.round() prevents sub-pixel blurriness on non-retina displays.
  el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
}
