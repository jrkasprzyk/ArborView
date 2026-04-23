import * as d3 from "d3";
import type { Arbor, TreeNode } from "./types";
import { splitLabel } from "./tooltip";

type Hier = d3.HierarchyPointNode<TreeNode>;

export type TreeEvents = {
  onHover: (node: Hier | null) => void;
  onSelect: (node: Hier) => void;
};

export function renderTree(svg: SVGSVGElement, arbor: Arbor, events: TreeEvents): void {
  const sel = d3.select(svg);
  sel.selectAll("*").remove();

  const root = d3.hierarchy<TreeNode>(arbor.tree, (d) => d.children);
  const depth = root.height + 1;

  const nodeSepX = 72;
  const nodeSepY = 110;
  const height = Math.max(320, depth * nodeSepY);

  const layout = d3.tree<TreeNode>().nodeSize([nodeSepX, nodeSepY]);
  const laid = layout(root);

  // center horizontally around root (nodeSize gives negative x values possible)
  let minX = Infinity, maxX = -Infinity;
  laid.each((d) => { if (d.x < minX) minX = d.x; if (d.x > maxX) maxX = d.x; });
  const spanX = maxX - minX || 1;
  const pad = 48;

  const viewW = spanX + pad * 2;
  const viewH = height + pad * 2;
  svg.setAttribute("viewBox", `${minX - pad} ${-pad} ${viewW} ${viewH}`);
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

  const g = sel.append("g");

  sel.call(
    d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 4])
      .on("zoom", (event) => g.attr("transform", event.transform.toString())),
  );

  // color scales
  const levels = arbor.response.levels ?? [];
  const classColor = d3
    .scaleOrdinal<string, string>()
    .domain(levels)
    .range(d3.schemeTableau10);

  const regExtent = d3.extent(laid.descendants(), (d) => d.data.predicted_value ?? 0) as [number, number];
  const regColor = d3.scaleSequential(d3.interpolateViridis).domain(regExtent);

  const fillFor = (d: Hier): string => {
    if (arbor.response.type === "classification") {
      return classColor(d.data.predicted_class ?? "");
    }
    return regColor(d.data.predicted_value ?? 0);
  };

  // node size scaled by sqrt(n) — area ∝ n
  const nExtent = d3.extent(laid.descendants(), (d) => d.data.n) as [number, number];
  const radius = d3
    .scaleSqrt()
    .domain([Math.max(1, nExtent[0]), Math.max(1, nExtent[1])])
    .range([5, 18]);

  // links
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

  // split labels on edges (show the condition leading into each child)
  g.append("g")
    .attr("class", "split-labels")
    .selectAll("text")
    .data(laid.descendants().filter((d) => d.depth > 0))
    .join("text")
    .attr("class", "split-label")
    .attr("x", (d) => (d.x + (d.parent?.x ?? d.x)) / 2)
    .attr("y", (d) => (d.y + (d.parent?.y ?? d.y)) / 2 - 4)
    .attr("text-anchor", "middle")
    .text((d) => edgeRuleText(d));

  // nodes
  const nodeGroups = g
    .append("g")
    .attr("class", "nodes")
    .selectAll<SVGGElement, Hier>("g.node")
    .data(laid.descendants(), (d) => String((d as Hier).data.node_id))
    .join("g")
    .attr("class", (d) => `node${d.data.is_leaf ? " leaf" : " internal"}`)
    .attr("transform", (d) => `translate(${d.x},${d.y})`);

  nodeGroups.each(function (d) {
    const grp = d3.select(this);
    const r = radius(d.data.n);
    if (d.data.is_leaf) {
      const side = r * 1.9;
      grp
        .append("rect")
        .attr("x", -side / 2)
        .attr("y", -side / 2)
        .attr("width", side)
        .attr("height", side)
        .attr("rx", 2)
        .attr("fill", fillFor(d));
    } else {
      grp.append("circle").attr("r", r).attr("fill", fillFor(d));
    }
  });

  nodeGroups
    .append("text")
    .attr("class", "node-label")
    .attr("text-anchor", "middle")
    .attr("dy", (d) => radius(d.data.n) + 12)
    .text((d) => labelFor(d, arbor));

  // interactions
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
      nodeGroups.classed("selected", (n) => n === d);
      events.onSelect(d);
    });
}

function edgeRuleText(d: Hier): string {
  const rule = d.data.rule_from_root;
  return rule.length > 0 ? rule[rule.length - 1] : "";
}

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

function highlightPath(
  target: Hier,
  links: d3.Selection<SVGPathElement, d3.HierarchyPointLink<TreeNode>, SVGGElement, unknown>,
  nodes: d3.Selection<SVGGElement, Hier, SVGGElement, unknown>,
) {
  const pathIds = new Set<number>();
  for (let cur: Hier | null = target; cur; cur = cur.parent) {
    pathIds.add(cur.data.node_id);
  }
  links.classed("on-path", (l) => pathIds.has(l.source.data.node_id) && pathIds.has(l.target.data.node_id));
  nodes.classed("hovered", (n) => n === target);
  nodes.classed("dimmed", (n) => !pathIds.has(n.data.node_id));
}

function clearPath(
  links: d3.Selection<SVGPathElement, d3.HierarchyPointLink<TreeNode>, SVGGElement, unknown>,
  nodes: d3.Selection<SVGGElement, Hier, SVGGElement, unknown>,
) {
  links.classed("on-path", false);
  nodes.classed("hovered", false);
  nodes.classed("dimmed", false);
}
