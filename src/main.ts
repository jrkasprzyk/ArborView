import * as d3 from "d3";
import type { Arbor, Manifest, ManifestEntry, TreeNode } from "./types";
import { renderTree } from "./tree";
import { positionTooltip, renderTooltip, splitLabel } from "./tooltip";

type Hier = d3.HierarchyPointNode<TreeNode>;

const $ = <T extends Element>(sel: string): T => {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`missing element: ${sel}`);
  return el;
};

const svg = $<SVGSVGElement>("#tree");
const tooltipEl = $<HTMLDivElement>("#tooltip");
const canvasEl = $<HTMLElement>(".canvas");
const datasetSelect = $<HTMLSelectElement>("#dataset-select");
const responseBadge = $<HTMLSpanElement>("#response-badge");
const breadcrumbEl = $<HTMLOListElement>("#breadcrumb");
const detailEl = $<HTMLDivElement>("#node-detail");
const importanceEl = $<HTMLUListElement>("#importance");

let currentArbor: Arbor | null = null;
let selected: Hier | null = null;

bootstrap().catch((err) => {
  console.error(err);
  canvasEl.insertAdjacentHTML(
    "beforeend",
    `<div style="padding:20px;color:#b03a2e">Failed to load: ${String(err)}</div>`,
  );
});

async function bootstrap(): Promise<void> {
  const manifest: Manifest = await fetch("data/manifest.json").then((r) => r.json());
  for (const ds of manifest.datasets) {
    const opt = document.createElement("option");
    opt.value = ds.file;
    opt.textContent = ds.label;
    opt.dataset.id = ds.id;
    datasetSelect.appendChild(opt);
  }

  datasetSelect.addEventListener("change", () => {
    const entry = manifest.datasets.find((d) => d.file === datasetSelect.value);
    if (entry) void loadDataset(entry);
  });

  await loadDataset(manifest.datasets[0]);
}

async function loadDataset(entry: ManifestEntry): Promise<void> {
  datasetSelect.value = entry.file;
  const arbor: Arbor = await fetch(`data/${entry.file}`).then((r) => r.json());
  currentArbor = arbor;
  selected = null;

  responseBadge.textContent = arbor.response.type;
  renderImportance(arbor);
  resetBreadcrumb();
  resetDetail();

  renderTree(svg, arbor, {
    onHover: (node) => {
      if (!node) {
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
      return svg.getBoundingClientRect();
    },
  };
}

function showBreadcrumb(node: Hier): void {
  breadcrumbEl.innerHTML = "";
  const rules = node.data.rule_from_root;
  if (rules.length === 0) {
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
  const term = document.createElement("li");
  term.className = "terminal";
  term.textContent = leafSummary(node);
  breadcrumbEl.appendChild(term);
}

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

function resetDetail(): void {
  detailEl.innerHTML = `<p class="muted">Select a node to see details.</p>`;
}

function showDetail(node: Hier): void {
  if (!currentArbor) return;
  const d = node.data;
  const rows: [string, string][] = [
    ["node id", String(d.node_id)],
    ["depth", String(d.depth)],
    ["samples", d.n.toLocaleString()],
    ["impurity", formatNum(d.impurity, 4)],
    ["complexity", formatNum(d.complexity, 3)],
    ["deviance", formatNum(d.deviance, 3)],
  ];

  if (currentArbor.response.type === "classification") {
    rows.splice(2, 0, ["prediction", d.predicted_class ?? "?"]);
    rows.push(["node prob", (d.node_prob ?? 0).toFixed(3)]);
  } else {
    rows.splice(2, 0, ["prediction", `ŷ = ${formatNum(d.predicted_value ?? 0, 3)}`]);
  }

  if (!d.is_leaf && d.split_var) {
    rows.push(["split", splitLabel(d)]);
  } else {
    rows.push(["kind", "leaf"]);
  }

  const dl = rows
    .map(([k, v]) => `<dt>${k}</dt><dd>${escapeHtml(v)}</dd>`)
    .join("");

  let classBar = "";
  if (
    currentArbor.response.type === "classification" &&
    d.class_probs &&
    d.class_counts &&
    currentArbor.response.levels
  ) {
    const levels = currentArbor.response.levels;
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

  detailEl.innerHTML = `<dl>${dl}</dl>${classBar}`;
}

function renderImportance(arbor: Arbor): void {
  importanceEl.innerHTML = "";
  const entries = Object.entries(arbor.variables.importance);
  if (entries.length === 0) {
    importanceEl.innerHTML = `<li class="muted">No variable importance reported.</li>`;
    return;
  }
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

function formatNum(v: number, digits = 3): string {
  if (!Number.isFinite(v)) return "—";
  if (v === 0) return "0";
  const a = Math.abs(v);
  if (a >= 1000 || a < 0.001) return v.toExponential(2);
  return v.toFixed(digits).replace(/\.?0+$/, "");
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );
}
