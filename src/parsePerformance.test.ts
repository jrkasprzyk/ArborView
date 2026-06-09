/**
 * parsePerformance.test.ts — proves the browser parser reproduces R's output.
 *
 * For each shipped horizon (EOWY{1,2,5}) we parse the same performance.txt the
 * R script consumed and compare against the `performance` block already embedded
 * in that dataset's JSON by R/add_performance.R.  Numeric fields use a 6-digit
 * tolerance (matching R's toJSON(digits=6)); labels/matrix/strings must match
 * exactly (REQ-004).  EOWY3/4 are deliberately excluded (not shipped — DD-05).
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parsePerformanceTxt } from "./parsePerformance";
import type { Performance } from "./types";

const HORIZONS = [1, 2, 5] as const;

const NUMERIC_FIELDS: (keyof Performance)[] = [
  "accuracy",
  "kappa",
  "no_information_rate",
  "sensitivity",
  "specificity",
  "ppv",
  "npv",
  "prevalence",
  "detection_rate",
  "detection_prevalence",
  "balanced_accuracy",
];

function readTxt(k: number): string {
  return readFileSync(`example_data/SE_Oct2025_vTC_CART_performance_P3500_EOWY${k}.txt`, "utf8");
}

function readExpected(k: number): Performance {
  const json = JSON.parse(readFileSync(`public/data/EOWY${k}_vTC_classification.json`, "utf8"));
  return json.performance as Performance;
}

describe("parsePerformanceTxt matches R-produced performance blocks", () => {
  for (const k of HORIZONS) {
    it(`EOWY${k}`, () => {
      const got = parsePerformanceTxt(readTxt(k));
      const want = readExpected(k);

      // Exact: labels, matrix, positive class.
      expect(got.confusion_matrix).toEqual(want.confusion_matrix);
      expect(got.positive_class).toBe(want.positive_class);

      // Numeric fields within 6 decimal digits.
      for (const f of NUMERIC_FIELDS) {
        expect(got[f] as number).toBeCloseTo(want[f] as number, 6);
      }

      // 95% CI tuple.
      for (let i = 0; i < 2; i++) {
        const g = got.accuracy_ci[i];
        const w = want.accuracy_ci[i];
        if (w === null) expect(g).toBeNull();
        else expect(g as number).toBeCloseTo(w, 6);
      }
    });
  }
});

describe("line-ending robustness (REQ-009)", () => {
  it("parses a CRLF file identically to its LF form", () => {
    const lf = readTxt(1).replace(/\r\n/g, "\n");
    const crlf = lf.replace(/\n/g, "\r\n");
    expect(parsePerformanceTxt(crlf)).toEqual(parsePerformanceTxt(lf));
  });
});

describe("malformed input throws descriptive errors", () => {
  it("throws when there is no Reference line", () => {
    expect(() => parsePerformanceTxt("just some\nrandom text\n")).toThrow(/Reference/);
  });

  it("throws when the Prediction header is missing", () => {
    expect(() => parsePerformanceTxt("          Reference\nNotPrediction A B\n")).toThrow(/Prediction/);
  });

  it("throws when a matrix row is short", () => {
    const txt = "          Reference\nPrediction A B\n   A 1 2\n   B 3\n";
    expect(() => parsePerformanceTxt(txt)).toThrow(/B/);
  });
});
