/**
 * main.ts — Application entry point.
 *
 * This file is responsible for:
 *   1. Loading the dataset manifest and populating the dropdown.
 *   2. Fetching the selected dataset JSON and handing it to the tree renderer.
 *   3. Updating the sidebar panels (breadcrumb, node detail, variable importance)
 *      in response to hover and click events from the tree.
 *
 * If you are new to JavaScript/TypeScript, the most important thing to know:
 *   - Code in this file runs in the browser, not in R or Node.
 *   - `async / await` is how we wait for network requests to finish.
 *   - D3 selection objects (Hier) wrap tree nodes so D3 can position them.
 */

import * as d3 from "d3";
import { marked } from "marked";
import DOMPurify from "dompurify";
import type { Arbor, Manifest, ManifestEntry, Performance, TreeNode } from "./types";
import { renderTree } from "./tree";
import { positionTooltip, renderTooltip, splitLabel } from "./tooltip";
import { escapeHtml, formatNum } from "./utils";

// D3 adds x/y coordinates to each TreeNode when it lays out the tree.
// "Hier" is shorthand for that augmented type.
type Hier = d3.HierarchyPointNode<TreeNode>;

// ---------------------------------------------------------------------------
// DOM references
// ---------------------------------------------------------------------------
// We cache references to HTML elements once at startup so we do not have to
// search the page on every event.  The `$` helper throws immediately if an
// expected element is missing, which catches typos in HTML id attributes.

const $ = <T extends Element>(sel: string): T => {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`ArborView: required DOM element not found: "${sel}". Check index.html.`);
  return el;
};

const svg           = $<SVGSVGElement>("#tree");
const tooltipEl     = $<HTMLDivElement>("#tooltip");
const canvasEl      = $<HTMLElement>(".canvas");
const datasetSelect = $<HTMLSelectElement>("#dataset-select");
const responseBadge = $<HTMLSpanElement>("#response-badge");
const breadcrumbEl  = $<HTMLOListElement>("#breadcrumb");
const detailEl      = $<HTMLDivElement>("#node-detail");
const importanceEl    = $<HTMLUListElement>("#importance");
const performanceEl   = $<HTMLDivElement>("#performance-detail");
const metricTooltipEl = $<HTMLDivElement>("#metric-tooltip");

// Tab elements
const tabVisualizer   = $<HTMLButtonElement>("#tab-visualizer");
const tabAbout        = $<HTMLButtonElement>("#tab-about");
const panelVisualizer = $<HTMLDivElement>("#panel-visualizer");
const panelAbout      = $<HTMLDivElement>("#panel-about");
const aboutContent    = $<HTMLElement>("#about-content");

// ---------------------------------------------------------------------------
// Application state
// ---------------------------------------------------------------------------
// Only two pieces of mutable state: the currently loaded model and the
// node the user has clicked (persists across hover changes).

let currentArbor: Arbor | null = null;
let selected: Hier | null = null;

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------

// `bootstrap()` is called once when the page loads.
// The `.catch` handler displays any startup error in the canvas area instead
// of silently failing.
bootstrap().catch((err) => {
  console.error("[ArborView] Startup failed:", err);
  canvasEl.insertAdjacentHTML(
    "beforeend",
    `<div style="padding:20px;color:#b03a2e">
       <strong>Failed to load ArborView.</strong><br>
       ${escapeHtml(String(err))}<br>
       <small>Check the browser console (F12) for details.</small>
     </div>`,
  );
});

// ---------------------------------------------------------------------------
// Tab navigation
// ---------------------------------------------------------------------------

function activateTab(tab: "visualizer" | "about"): void {
  const isVisualizer = tab === "visualizer";
  tabVisualizer.classList.toggle("active", isVisualizer);
  tabAbout.classList.toggle("active", !isVisualizer);
  tabVisualizer.setAttribute("aria-selected", String(isVisualizer));
  tabAbout.setAttribute("aria-selected", String(!isVisualizer));
  panelVisualizer.hidden = !isVisualizer;
  panelAbout.hidden = isVisualizer;
}

tabVisualizer.addEventListener("click", () => activateTab("visualizer"));
tabAbout.addEventListener("click", () => activateTab("about"));

// Load the About markdown once at startup.
loadAbout().catch((err) => {
  console.error("[ArborView] Failed to load about.md:", err);
  aboutContent.innerHTML = `<p class="muted">Could not load about.md: ${escapeHtml(String(err))}</p>`;
});

async function loadAbout(): Promise<void> {
  const response = await fetch("/about.md");
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} fetching "/about.md": ${response.statusText}`);
  }
  const text = await response.text();
  // Sanitize the HTML output from marked to prevent XSS before injecting into the DOM.
  aboutContent.innerHTML = DOMPurify.sanitize(await marked.parse(text));
}

async function bootstrap(): Promise<void> {
  // Step 1: fetch the manifest (a small JSON file listing all available datasets).
  // Note: to add a remove a dataset, someone must manually edit the manifest,
  // adding an entry with the matching id, label, and file fields, then placing the
  // corresponding data file in the public/data/ directory.
  const manifest: Manifest = await fetchJson("data/manifest.json");

  if (manifest.datasets.length === 0) {
    throw new Error("manifest.json contains no datasets. Add entries to public/data/manifest.json.");
  }

  // Step 2: populate the dataset selector <select> element.
  for (const ds of manifest.datasets) {
    const opt = document.createElement("option");
    opt.value = ds.file;
    opt.textContent = ds.label;
    opt.dataset.id = ds.id;
    datasetSelect.appendChild(opt);
  }

  // Step 3: when the user picks a different dataset, reload.
  datasetSelect.addEventListener("change", () => {
    const entry = manifest.datasets.find((d) => d.file === datasetSelect.value);
    if (entry) void loadDataset(entry);
  });

  // Step 4: load the first dataset immediately.
  await loadDataset(manifest.datasets[0]);
}

// ---------------------------------------------------------------------------
// Dataset loading
// ---------------------------------------------------------------------------

async function loadDataset(entry: ManifestEntry): Promise<void> {
  // Keep the dropdown in sync when loadDataset is called programmatically.
  datasetSelect.value = entry.file;

  const arbor: Arbor = await fetchJson(`data/${entry.file}`);
  currentArbor = arbor;
  selected = null;  // clear any previously selected node

  // Update the badge that shows "classification" or "regression".
  responseBadge.textContent = arbor.response.type;

  renderImportance(arbor);
  renderPerformance(arbor.performance);
  resetBreadcrumb();
  resetDetail();

  // Hand off to tree.ts.  We pass callback functions so tree.ts can tell us
  // when the user hovers or clicks without knowing about sidebar HTML.
  renderTree(svg, arbor, {
    onHover: (node) => {
      if (!node) {
        // Mouse left the tree — restore the selected node's info if any.
        if (selected) {
          showDetail(selected);
          showBreadcrumb(selected);
        } else {
          resetDetail();
          resetBreadcrumb();
        }
        tooltipEl.hidden = true;
        return;
      }
      showDetail(node);
      showBreadcrumb(node);
      tooltipEl.innerHTML = renderTooltip(node.data, arbor);
      tooltipEl.hidden = false;
      void positionTooltip(tooltipEl, nodeScreenReference(node), canvasEl);
    },
    onSelect: (node) => {
      selected = node;
      showDetail(node);
      showBreadcrumb(node);
    },
  });
}

// ---------------------------------------------------------------------------
// Fetch helper
// ---------------------------------------------------------------------------

/**
 * Fetch a JSON file and return its parsed contents.
 * Throws a descriptive error if the HTTP response is not OK (e.g. 404),
 * rather than silently returning undefined or an HTML error page.
 */
async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} fetching "${url}": ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Tooltip positioning helper
// ---------------------------------------------------------------------------

/**
 * Return a fake DOM reference object whose getBoundingClientRect() points to
 * the SVG <g> element for the given tree node.
 *
 * Floating UI (the tooltip library) needs a "reference element" to position
 * the tooltip next to.  SVG <g> groups don't behave exactly like HTML elements
 * so we wrap the lookup in this adapter.
 *
 * Performance note: this does a linear scan over all node elements each time
 * the tooltip needs repositioning.  For trees with hundreds of nodes this is
 * fast enough, but could be cached if profiling shows it as a bottleneck.
 */
function nodeScreenReference(node: Hier): { getBoundingClientRect(): DOMRect } {
  return {
    getBoundingClientRect: () => {
      const elems = svg.querySelectorAll<SVGGElement>("g.node");
      for (const el of Array.from(elems)) {
        const d = d3.select(el).datum() as Hier | undefined;
        if (d && d.data.node_id === node.data.node_id) {
          return el.getBoundingClientRect();
        }
      }
      // Fallback: position relative to the whole SVG if the element isn't found.
      return svg.getBoundingClientRect();
    },
  };
}

// ---------------------------------------------------------------------------
// Sidebar: breadcrumb (decision path)
// ---------------------------------------------------------------------------

/**
 * Show the sequence of split rules from the root down to the given node,
 * plus a final "terminal" item showing the prediction.
 */
function showBreadcrumb(node: Hier): void {
  breadcrumbEl.innerHTML = "";
  const rules = node.data.rule_from_root;

  if (rules.length === 0) {
    // Root node has no incoming rules yet.
    const li = document.createElement("li");
    li.className = "muted";
    li.textContent = "root — no conditions yet";
    breadcrumbEl.appendChild(li);
  } else {
    for (const r of rules) {
      const li = document.createElement("li");
      li.textContent = r;
      breadcrumbEl.appendChild(li);
    }
  }

  // Always add the terminal item showing what this node predicts.
  const term = document.createElement("li");
  term.className = "terminal";
  term.textContent = leafSummary(node);
  breadcrumbEl.appendChild(term);
}

/**
 * Return a short string summarising what this node predicts.
 * For classification: the majority class label.
 * For regression: the mean response value (ŷ).
 */
function leafSummary(node: Hier): string {
  if (!currentArbor) return "";
  if (currentArbor.response.type === "classification") {
    return `⇒ ${node.data.predicted_class ?? "?"} (n=${node.data.n})`;
  }
  return `⇒ ŷ=${(node.data.predicted_value ?? 0).toFixed(3)} (n=${node.data.n})`;
}

function resetBreadcrumb(): void {
  breadcrumbEl.innerHTML = `<li class="muted">Hover or click a node.</li>`;
}

// ---------------------------------------------------------------------------
// Sidebar: node detail panel
// ---------------------------------------------------------------------------

function resetDetail(): void {
  detailEl.innerHTML = `<p class="muted">Select a node to see details.</p>`;
}

/**
 * Render a statistics table for the selected node, plus class probability
 * bars for classification trees.
 */
function showDetail(node: Hier): void {
  if (!currentArbor) return;
  const d = node.data;

  // Build the key-value rows for the <dl> (definition list).
  const rows: [string, string][] = [
    ["node id",    String(d.node_id)],
    ["depth",      String(d.depth)],
    ["samples",    d.n.toLocaleString()],
    ["impurity",   formatNum(d.impurity, 4)],
    ["complexity", formatNum(d.complexity, 3)],
    ["deviance",   formatNum(d.deviance, 3)],
  ];

  // Insert the prediction row right after "samples".
  if (currentArbor.response.type === "classification") {
    rows.splice(2, 0, ["prediction", d.predicted_class ?? "?"]);
    rows.push(["node prob", (d.node_prob ?? 0).toFixed(3)]);
  } else {
    rows.splice(2, 0, ["prediction", `ŷ = ${formatNum(d.predicted_value ?? 0, 3)}`]);
  }

  // Add split info for internal nodes, or mark leaves.
  if (!d.is_leaf && d.split_var) {
    rows.push(["split", splitLabel(d)]);
  } else {
    rows.push(["kind", "leaf"]);
  }

  // Build the <dl> HTML.  escapeHtml() prevents XSS if variable names or
  // class labels contain characters like < > & " '.
  const dlContent = rows
    .map(([k, v]) => `<dt>${k}</dt><dd>${escapeHtml(v)}</dd>`)
    .join("");

  // For classification, add a horizontal bar chart of class probabilities.
  let classBar = "";
  if (
    currentArbor.response.type === "classification" &&
    d.class_probs &&
    d.class_counts &&
    currentArbor.response.levels
  ) {
    const levels = currentArbor.response.levels;
    // Use the same Tableau 10 colour palette as the tree nodes so colours match.
    const color = d3.scaleOrdinal<string, string>().domain(levels).range(d3.schemeTableau10);
    const rowsHtml = levels
      .map((lvl, i) => {
        const p = d.class_probs![i] ?? 0;
        const n = d.class_counts![i] ?? 0;
        return `<div class="class-bar-row">
          <span class="name" title="${escapeHtml(lvl)}">${escapeHtml(lvl)}</span>
          <div class="track"><div class="fill" style="width:${(p * 100).toFixed(1)}%;background:${color(lvl)}"></div></div>
          <span class="pct">${(p * 100).toFixed(1)}% · ${n}</span>
        </div>`;
      })
      .join("");
    classBar = `<div class="class-bar">${rowsHtml}</div>`;
  }

  detailEl.innerHTML = `<dl>${dlContent}</dl>${classBar}`;
}

// ---------------------------------------------------------------------------
// Sidebar: model performance panel
// ---------------------------------------------------------------------------

const METRIC_DEFS: Readonly<Record<string, string>> = {
  "accuracy":
    "Proportion of all samples classified correctly. Can be misleading when class sizes are unequal.",
  "kappa":
    "Cohen's κ: agreement corrected for chance. 0 = no better than random, 1 = perfect, negative = worse than random.",
  "sensitivity":
    "Of all true positives, the fraction the model correctly identified. Also called recall or true positive rate.",
  "specificity":
    "Of all true negatives, the fraction the model correctly identified. Also called true negative rate.",
  "PPV":
    "Positive Predictive Value: of all samples predicted positive, the fraction that are truly positive. Also called precision.",
  "NPV":
    "Negative Predictive Value: of all samples predicted negative, the fraction that are truly negative.",
  "bal. accuracy":
    "Mean of sensitivity and specificity. More informative than accuracy when class sizes are unequal.",
};

function renderPerformance(perf: Performance | undefined): void {
  if (!perf) {
    performanceEl.innerHTML = `<p class="muted">No performance data for this dataset.</p>`;
    return;
  }

  const labels = perf.confusion_matrix.labels;

  // Confusion matrix table (rows = predicted, cols = reference)
  const headerCells = labels.map((l) => `<th>${escapeHtml(l)}</th>`).join("");
  const matRows = perf.confusion_matrix.matrix
    .map((row, i) => {
      const cells = row
        .map((v, j) => `<td class="${i === j ? "cm-correct" : "cm-error"}">${v}</td>`)
        .join("");
      return `<tr><th>${escapeHtml(labels[i])}</th>${cells}</tr>`;
    })
    .join("");

  const cmHtml = `
    <div class="cm-wrap">
      <div class="cm-ref-label">Reference</div>
      <table class="confusion-matrix">
        <thead><tr><th class="cm-corner">Pred \\ Ref</th>${headerCells}</tr></thead>
        <tbody>${matRows}</tbody>
      </table>
    </div>`;

  const ci = perf.accuracy_ci;
  const ciStr = `(${(ci[0] * 100).toFixed(1)}–${(ci[1] * 100).toFixed(1)}%)`;
  const statsRows: [string, string][] = [
    ["accuracy",      `${(perf.accuracy * 100).toFixed(1)}% ${ciStr}`],
    ["kappa",         formatNum(perf.kappa, 4)],
    ["sensitivity",   formatNum(perf.sensitivity, 4)],
    ["specificity",   formatNum(perf.specificity, 4)],
    ["PPV",           formatNum(perf.ppv, 4)],
    ["NPV",           formatNum(perf.npv, 4)],
    ["bal. accuracy", formatNum(perf.balanced_accuracy, 4)],
    ["positive class", escapeHtml(perf.positive_class)],
  ];

  const dlContent = statsRows
    .map(([k, v]) => {
      const hasDef = Object.prototype.hasOwnProperty.call(METRIC_DEFS, k);
      const dtAttrs = hasDef ? ` class="has-def" data-metric="${escapeHtml(k)}"` : "";
      return `<dt${dtAttrs}>${k}</dt><dd>${v}</dd>`;
    })
    .join("");

  performanceEl.innerHTML = `${cmHtml}<dl class="perf-stats">${dlContent}</dl>`;
}

function setupMetricTooltips(): void {
  const tip = metricTooltipEl;

  performanceEl.addEventListener("mouseover", (e) => {
    const dt = (e.target as Element).closest<HTMLElement>("dt[data-metric]");
    if (!dt) return;
    const key = dt.dataset["metric"]!;
    const def = METRIC_DEFS[key];
    if (!def) return;
    tip.innerHTML = `<strong>${escapeHtml(key)}</strong><div style="margin-top:4px">${escapeHtml(def)}</div>`;
    tip.style.visibility = "hidden";
    tip.style.left = "0";
    tip.style.top = "0";
    tip.hidden = false;
    const ttRect = tip.getBoundingClientRect();
    const dtRect = dt.getBoundingClientRect();
    tip.style.visibility = "";
    let left = dtRect.left;
    let top = dtRect.top - ttRect.height - 6;
    if (top < 8) top = dtRect.bottom + 6;
    if (left + ttRect.width > window.innerWidth - 8) left = window.innerWidth - ttRect.width - 8;
    if (left < 8) left = 8;
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
  });

  performanceEl.addEventListener("mouseout", (e) => {
    const related = e.relatedTarget as Element | null;
    if (related?.closest("dt[data-metric]")) return;
    tip.hidden = true;
  });
}

setupMetricTooltips();

// ---------------------------------------------------------------------------
// Sidebar: variable importance chart
// ---------------------------------------------------------------------------

/**
 * Render a horizontal bar chart of variable importance scores.
 * Bars are normalised so the most important variable is always 100% wide.
 */
function renderImportance(arbor: Arbor): void {
  importanceEl.innerHTML = "";
  const entries = Object.entries(arbor.variables.importance);

  if (entries.length === 0) {
    importanceEl.innerHTML = `<li class="muted">No variable importance reported.</li>`;
    return;
  }

  // Sort descending so the most important variable appears first.
  entries.sort((a, b) => b[1] - a[1]);
  const max = entries[0][1];

  for (const [name, val] of entries) {
    const li = document.createElement("li");
    const pct = (val / max) * 100;
    li.innerHTML = `
      <span class="name" title="${escapeHtml(name)}">${escapeHtml(name)}</span>
      <div class="bar"><div class="bar-fill" style="width:${pct.toFixed(1)}%"></div></div>
      <span class="val">${formatNum(val, 3)}</span>`;
    importanceEl.appendChild(li);
  }
}
