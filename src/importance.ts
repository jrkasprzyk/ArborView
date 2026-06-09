import type { Arbor, TreeNode } from "./types";

function collectSplitVariables(root: TreeNode): Set<string> {
  const names = new Set<string>();
  const stack: TreeNode[] = [root];

  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node.split_var) names.add(node.split_var);
    if (node.children) stack.push(...node.children);
  }

  return names;
}

export function getTreeImportanceEntries(arbor: Arbor): [string, number][] {
  const splitVars = collectSplitVariables(arbor.tree);
  return Object.entries(arbor.variables.importance).filter(([name]) => splitVars.has(name));
}
