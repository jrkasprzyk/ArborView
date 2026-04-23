/**
 * tree.ts — D3-powered tree rendering.
 *
 * This module owns the SVG canvas.  It takes an Arbor (the parsed JSON model)
 * and draws the decision tree inside the provided <svg> element.  All user
 * interaction (hover, click) is communicated back to main.ts via callbacks.
 *
 * Key D3 concepts used here (brief glossary for R / Python users):
 *
 *   d3.hierarchy()   – Converts a nested JSON object into a "node tree" that
 *                      D3 can measure and position.
 *
 *   d3.tree()        – Assigns x/y coordinates to every node so they form a
 *                      tidy top-down tree layout.
 *
 *   d3.select()      – Wraps an HTML/SVG element so you can set attributes,
 *                      add children, and attach event listeners with D3's API.
 *
 *   .selectAll().data().join() – The core D3 pattern: bind an array of data
 *                      to a set of SVG elements, creating/updating/removing
 *                      elements to match the data.
 */

import * as d3 from "d3";
import type { Arbor, TreeNode } from "./types";
import { splitLabel } from "./tooltip";

// D3 adds x/y layout coordinates to each TreeNode.  "Hier" is short for this.
type Hier = d3.HierarchyPointNode<TreeNode>;

/** Callback functions that tree.ts calls to notify main.ts of user actions. */
export type TreeEvents = {
  /** Called with the hovered node, or null when the cursor leaves the tree. */
  onHover: (node: Hier | null) => void;
  /** Called when the user clicks a node. */
  onSelect: (node: Hier) => void;
};

// ---------------------------------------------------------------------------
// Main render function
// ---------------------------------------------------------------------------

/**
 * Draw the decision tree inside `svg`.
 *
 * Calling this function a second time (e.g. when the user switches datasets)
 * replaces the previous tree entirely.
 */
export function renderTree(svg: SVGSVGElement, arbor: Arbor, events: TreeEvents): void {
  const sel = d3.select(svg);

  // Clear any previously drawn tree before drawing a fresh one.
  sel.selectAll("*").remove();

  // ---------------------------------------------------------------------------
  // Layout
  // ---------------------------------------------------------------------------

  // d3.hierarchy() converts our nested TreeNode JSON into a structure D3 can
  // traverse.  The second argument tells D3 which field contains children.
  const root = d3.hierarchy<TreeNode>(arbor.tree, (d) => d.children);
  const depth = root.height + 1;  // number of levels in the tree

  // Spacing between nodes (in SVG user units, which are roughly pixels here).
  const nodeSepX = 72;   // horizontal gap between sibling nodes
  const nodeSepY = 110;  // vertical gap between levels

  const height = Math.max(320, depth * nodeSepY);

  // d3.tree() with nodeSize() sets FIXED per-node spacing (not a fixed overall
  // canvas size).  This means the SVG viewBox must expand to fit the tree.
  // (contrast with d3.tree().size([W, H]) which squashes everything into W×H)
  const layout = d3.tree<TreeNode>().nodeSize([nodeSepX, nodeSepY]);
  const laid = layout(root);  // assigns .x and .y to every node in `root`

  // Compute the horizontal extent of the laid-out tree so we can set the
  // SVG viewBox to just fit it.  d3.tree positions the root at x=0 and can
  // give negative x values to left-leaning branches.
  let minX = Infinity, maxX = -Infinity;
  laid.each((d) => {
    if (d.x < minX) minX = d.x;
    if (d.x > maxX) maxX = d.x;
  });

  const spanX = maxX - minX || 1;  // fallback width of 1 for single-node trees
  const pad   = 48;                // padding around the whole tree

  const viewW = spanX + pad * 2;
  const viewH = height + pad * 2;
  // viewBox: "left top width height" — sets the coordinate system for the SVG
  svg.setAttribute("viewBox", `${minX - pad} ${-pad} ${viewW} ${viewH}`);
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

  // All drawn elements go inside a <g> that zoom/pan will transform.
  const g = sel.append("g");

  // ---------------------------------------------------------------------------
  // Zoom and pan
  // ---------------------------------------------------------------------------

  sel.call(
    d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 4])  // min and max zoom levels
      .on("zoom", (event) => g.attr("transform", event.transform.toString())),
  );

  // ---------------------------------------------------------------------------
  // Colour scales
  // ---------------------------------------------------------------------------

  // Classification: each class gets a distinct colour from Tableau's 10-colour
  // palette.  The same scale is used in the sidebar so colours match.
  const levels = arbor.response.levels ?? [];
  const classColor = d3
    .scaleOrdinal<string, string>()
    .domain(levels)
    .range(d3.schemeTableau10);

  // Regression: predicted value mapped to Viridis (dark-purple → yellow).
  // d3.extent() returns [min, max]; casting is safe because every node has a
  // predicted_value in a regression tree.
  const regExtent = d3.extent(
    laid.descendants(),
    (d) => d.data.predicted_value ?? 0,
  ) as [number, number];
  const regColor = d3.scaleSequential(d3.interpolateViridis).domain(regExtent);

  /** Return the fill colour for a node based on its predicted class/value. */
  const fillFor = (d: Hier): string => {
    if (arbor.response.type === "classification") {
      return classColor(d.data.predicted_class ?? "");
    }
    return regColor(d.data.predicted_value ?? 0);
  };

  // ---------------------------------------------------------------------------
  // Node size scale
  // ---------------------------------------------------------------------------

  // Node radius ∝ √n so that node *area* is proportional to sample count.
  // This is the correct perceptual mapping for area-based encodings.
  const nExtent = d3.extent(laid.descendants(), (d) => d.data.n) as [number, number];
  const radius = d3
    .scaleSqrt()
    .domain([Math.max(1, nExtent[0]), Math.max(1, nExtent[1])])
    .range([5, 18]);  // min and max radius in SVG units

  // ---------------------------------------------------------------------------
  // Draw edges (links)
  // ---------------------------------------------------------------------------

  // d3.linkVertical() draws smooth S-curves between parent and child nodes.
  const linkPath = d3
    .linkVertical<d3.HierarchyPointLink<TreeNode>, Hier>()
    .x((d) => d.x)
    .y((d) => d.y);

  const linkSel = g
    .append("g")
    .attr("class", "links")
    .selectAll<SVGPathElement, d3.HierarchyPointLink<TreeNode>>("path")
    .data(laid.links())
    .join("path")
    .attr("class", "link")
    .attr("d", (l) => linkPath(l));

  // ---------------------------------------------------------------------------
  // Draw split labels on edges
  // ---------------------------------------------------------------------------

  // Each edge shows the condition that routes an observation to that child.
  // We skip depth=0 (root) because the root has no incoming edge.
  g.append("g")
    .attr("class", "split-labels")
    .selectAll("text")
    .data(laid.descendants().filter((d) => d.depth > 0))
    .join("text")
    .attr("class", "split-label")
    // Place label at midpoint between parent and child, nudged up 4px.
    .attr("x", (d) => (d.x + (d.parent?.x ?? d.x)) / 2)
    .attr("y", (d) => (d.y + (d.parent?.y ?? d.y)) / 2 - 4)
    .attr("text-anchor", "middle")
    .text((d) => edgeRuleText(d));

  // ---------------------------------------------------------------------------
  // Draw nodes
  // ---------------------------------------------------------------------------

  // Each node is a <g> group containing either a circle (internal) or a
  // rounded square (leaf), plus a text label below it.
  const nodeGroups = g
    .append("g")
    .attr("class", "nodes")
    .selectAll<SVGGElement, Hier>("g.node")
    // The key function (d => node_id) tells D3 how to match data to elements
    // when the tree is re-rendered — important for smooth updates.
    .data(laid.descendants(), (d) => String((d as Hier).data.node_id))
    .join("g")
    .attr("class", (d) => `node${d.data.is_leaf ? " leaf" : " internal"}`)
    .attr("transform", (d) => `translate(${d.x},${d.y})`);

  // Draw shape for each node: circle = internal split, square = leaf.
  nodeGroups.each(function (d) {
    const grp = d3.select(this);
    const r = radius(d.data.n);
    if (d.data.is_leaf) {
      const side = r * 1.9;  // square side slightly wider than circle diameter
      grp
        .append("rect")
        .attr("x", -side / 2)
        .attr("y", -side / 2)
        .attr("width", side)
        .attr("height", side)
        .attr("rx", 2)          // 2px corner radius for a "soft square" look
        .attr("fill", fillFor(d));
    } else {
      grp.append("circle").attr("r", r).attr("fill", fillFor(d));
    }
  });

  // Draw text label below each node showing prediction + sample count.
  nodeGroups
    .append("text")
    .attr("class", "node-label")
    .attr("text-anchor", "middle")
    .attr("dy", (d) => radius(d.data.n) + 12)  // push text below the node shape
    .text((d) => labelFor(d, arbor));

  // ---------------------------------------------------------------------------
  // Interactions
  // ---------------------------------------------------------------------------

  nodeGroups
    .on("mouseenter", (_event, d) => {
      highlightPath(d, linkSel, nodeGroups);
      events.onHover(d);
    })
    .on("mouseleave", () => {
      clearPath(linkSel, nodeGroups);
      events.onHover(null);
    })
    .on("click", (_event, d) => {
      // Toggle: clicking an already-selected node would still re-select it;
      // that's intentional — the selection is managed by main.ts, not here.
      nodeGroups.classed("selected", (n) => n === d);
      events.onSelect(d);
    });
}

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

/**
 * Return the edge label text for a child node.
 * We store the full path from root in rule_from_root; the last entry is
 * the rule for the edge leading into this child.
 */
function edgeRuleText(d: Hier): string {
  const rule = d.data.rule_from_root;
  return rule.length > 0 ? rule[rule.length - 1] : "";
}

/**
 * Return the display text shown below each node:
 *   - Leaf nodes show the prediction and sample count.
 *   - Internal nodes show the split condition (e.g. "age < 12.5").
 */
function labelFor(d: Hier, arbor: Arbor): string {
  if (d.data.is_leaf) {
    if (arbor.response.type === "classification") {
      return `${d.data.predicted_class ?? ""} (n=${d.data.n})`;
    }
    const v = d.data.predicted_value;
    return `ŷ=${v !== undefined ? v.toFixed(2) : "?"} (n=${d.data.n})`;
  }
  return splitLabel(d.data);
}

/**
 * Highlight the path from the hovered node back to the root:
 *   - Edges on the path get the "on-path" CSS class (orange stroke).
 *   - The hovered node itself gets "hovered".
 *   - All other nodes get "dimmed" (reduced opacity).
 */
function highlightPath(
  target: Hier,
  links: d3.Selection<SVGPathElement, d3.HierarchyPointLink<TreeNode>, SVGGElement, unknown>,
  nodes: d3.Selection<SVGGElement, Hier, SVGGElement, unknown>,
) {
  // Collect the node_ids of every ancestor of `target` (including itself).
  const pathIds = new Set<number>();
  for (let cur: Hier | null = target; cur; cur = cur.parent) {
    pathIds.add(cur.data.node_id);
  }

  // An edge is "on the path" if both its source and target are in pathIds.
  links.classed("on-path", (l) =>
    pathIds.has(l.source.data.node_id) && pathIds.has(l.target.data.node_id),
  );
  nodes.classed("hovered", (n) => n === target);
  nodes.classed("dimmed",  (n) => !pathIds.has(n.data.node_id));
}

/** Remove all hover-related CSS classes. */
function clearPath(
  links: d3.Selection<SVGPathElement, d3.HierarchyPointLink<TreeNode>, SVGGElement, unknown>,
  nodes: d3.Selection<SVGGElement, Hier, SVGGElement, unknown>,
) {
  links.classed("on-path", false);
  nodes.classed("hovered", false);
  nodes.classed("dimmed",  false);
}
