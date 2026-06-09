import { describe, expect, it } from "vitest";
import { getTreeImportanceEntries } from "./importance";
import type { Arbor } from "./types";

function sampleArbor(): Arbor {
  return {
    schema: "arborview/tree@1",
    title: "test",
    method: "class",
    response: { type: "classification", levels: ["Failure", "Success"] },
    variables: {
      predictors: ["cumulative_EndOf_WY2", "wy1_tot", "candidate_only"],
      importance: {
        cumulative_EndOf_WY2: 8,
        wy1_tot: 2,
        candidate_only: 10,
      },
    },
    call: "rpart(y ~ x)",
    tree: {
      node_id: 1,
      depth: 0,
      n: 10,
      weight: 10,
      deviance: 5,
      complexity: 0.01,
      is_leaf: false,
      impurity: 0.5,
      rule_from_root: [],
      split_var: "cumulative_EndOf_WY2",
      split: { type: "numeric", threshold: 1, left_op: "<", right_op: ">=" },
      children: [
        {
          node_id: 2,
          depth: 1,
          n: 6,
          weight: 6,
          deviance: 2,
          complexity: 0.02,
          is_leaf: false,
          impurity: 0.33,
          rule_from_root: ["cumulative_EndOf_WY2 < 1"],
          split_var: "wy1_tot",
          split: { type: "numeric", threshold: 3, left_op: "<", right_op: ">=" },
          children: [
            {
              node_id: 4,
              depth: 2,
              n: 3,
              weight: 3,
              deviance: 1,
              complexity: 0.03,
              is_leaf: true,
              impurity: 0.2,
              rule_from_root: ["cumulative_EndOf_WY2 < 1", "wy1_tot < 3"],
            },
            {
              node_id: 5,
              depth: 2,
              n: 3,
              weight: 3,
              deviance: 1,
              complexity: 0.03,
              is_leaf: true,
              impurity: 0.2,
              rule_from_root: ["cumulative_EndOf_WY2 < 1", "wy1_tot >= 3"],
            },
          ],
        },
        {
          node_id: 3,
          depth: 1,
          n: 4,
          weight: 4,
          deviance: 2,
          complexity: 0.02,
          is_leaf: true,
          impurity: 0.4,
          rule_from_root: ["cumulative_EndOf_WY2 >= 1"],
        },
      ],
    },
  };
}

describe("getTreeImportanceEntries", () => {
  it("keeps only variables that appear in tree splits", () => {
    const arbor = sampleArbor();
    expect(getTreeImportanceEntries(arbor)).toEqual([
      ["cumulative_EndOf_WY2", 8],
      ["wy1_tot", 2],
    ]);
  });

  it("returns no entries for a single-leaf tree", () => {
    const arbor = sampleArbor();
    arbor.tree = {
      node_id: 1,
      depth: 0,
      n: 10,
      weight: 10,
      deviance: 5,
      complexity: 0.01,
      is_leaf: true,
      impurity: 0.5,
      rule_from_root: [],
    };
    expect(getTreeImportanceEntries(arbor)).toEqual([]);
  });
});
