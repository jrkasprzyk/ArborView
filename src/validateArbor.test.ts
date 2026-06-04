/**
 * validateArbor.test.ts — schema validation + performance<->tree reconciliation.
 *
 * - Every shipped dataset JSON must pass validateArbor.
 * - Representative invalid inputs (wrong schema, missing tree, bad response type,
 *   a deeply-nested malformed child) must throw field-naming errors.
 * - reconcilePerformance must reject a regression arbor, reordered labels, and
 *   an out-of-set positive class — naming both label lists (REQ-008).
 */

import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { validateArbor } from "./validateArbor";
import { reconcilePerformance } from "./upload";
import type { Arbor, Performance } from "./types";

const DATA_DIR = "public/data";

function loadJson(file: string): unknown {
  return JSON.parse(readFileSync(`${DATA_DIR}/${file}`, "utf8"));
}

describe("validateArbor accepts every shipped dataset", () => {
  const files = readdirSync(DATA_DIR).filter((f) => f.endsWith(".json") && f !== "manifest.json");
  for (const f of files) {
    it(f, () => {
      expect(() => validateArbor(loadJson(f))).not.toThrow();
    });
  }
});

describe("validateArbor rejects malformed input", () => {
  // Start from a known-good tree so each case isolates a single defect.
  const base = () => loadJson("EOWY1_classification.json") as Record<string, unknown>;

  it("wrong schema -> version-aware message", () => {
    const bad = base();
    bad["schema"] = "arborview/tree@99";
    expect(() => validateArbor(bad)).toThrow(/arborview\/tree@1/);
    expect(() => validateArbor(bad)).toThrow(/arborview\/tree@99/);
  });

  it("missing tree", () => {
    const bad = base();
    delete bad["tree"];
    expect(() => validateArbor(bad)).toThrow(/tree/);
  });

  it("bad response.type", () => {
    const bad = base();
    (bad["response"] as Record<string, unknown>)["type"] = "clustering";
    expect(() => validateArbor(bad)).toThrow(/response\.type/);
  });

  it("deeply-nested malformed child exercises the recursive walk", () => {
    const bad = base();
    // Reach into a grandchild and corrupt its node_id.
    const tree = bad["tree"] as any;
    const grandchild = tree?.children?.[0]?.children?.[0] ?? tree?.children?.[0];
    expect(grandchild).toBeTruthy();
    delete grandchild.node_id;
    expect(() => validateArbor(bad)).toThrow(/node_id/);
  });
});

describe("reconcilePerformance (REQ-008)", () => {
  const classArbor = (): Arbor =>
    ({ response: { type: "classification", levels: ["Failure", "Success"] } }) as Arbor;

  const perf = (labels: string[], positive: string): Performance =>
    ({
      positive_class: positive,
      confusion_matrix: { labels, matrix: [] },
    }) as Performance;

  it("accepts a matching performance file", () => {
    expect(() =>
      reconcilePerformance(perf(["Failure", "Success"], "Failure"), classArbor()),
    ).not.toThrow();
  });

  it("rejects a regression arbor (levels === null)", () => {
    const reg = { response: { type: "regression", levels: null } } as Arbor;
    expect(() => reconcilePerformance(perf(["Failure", "Success"], "Failure"), reg)).toThrow(/regression/);
  });

  it("rejects reordered labels, naming both lists", () => {
    expect(() =>
      reconcilePerformance(perf(["Success", "Failure"], "Failure"), classArbor()),
    ).toThrow(/Success, Failure.*Failure, Success/);
  });

  it("rejects a positive_class not in levels", () => {
    expect(() =>
      reconcilePerformance(perf(["Failure", "Success"], "Other"), classArbor()),
    ).toThrow(/Other.*Failure, Success/);
  });
});
