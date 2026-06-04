/**
 * parsePerformance.ts — Client-side port of R/add_performance.R::parse_performance_txt.
 *
 * Turns the plain-text output of caret's `confusionMatrix()` into the same
 * `Performance` object that `R/add_performance.R` embeds into a dataset JSON.
 * This lets a user upload a `performance.txt` in the browser without running R.
 *
 * IMPORTANT — this module is deliberately a PURE `string -> Performance`
 * function with NO knowledge of the tree/`Arbor`.  That keeps it deep-equal
 * testable against the R output (see parsePerformance.test.ts).  The cross-check
 * that the parsed labels actually match the loaded tree lives in upload.ts
 * (`reconcilePerformance`), not here.
 *
 * The algorithm mirrors the R source line-for-line:
 *   1. Find the single line that is just "Reference".
 *   2. The next line must start with "Prediction"; the rest are the class labels.
 *   3. The following N lines are the confusion-matrix rows.
 *   4. Every "  Key : Value" line in the file is collected into a stats map.
 *   5. The "95% CI" string "(a, b)" is split into two numbers.
 *   6. Keys are mapped onto the `Performance` fields exactly as the R `list(...)` does.
 *
 * The parser NEVER rounds — it preserves exactly what the text says.  Rounding
 * (to match R's `toJSON(digits=6)`) is the test's job, not the parser's.
 */

import type { ConfusionMatrix, Performance } from "./types";

/**
 * Parse a single statistic value the way R's `parse_num` does:
 *   - trim surrounding whitespace
 *   - empty string                  -> NaN (R returns NA_real_)
 *   - value beginning with "<"      -> NaN (e.g. caret's "< 2.2e-16")
 *   - otherwise Number(); unparseable -> NaN
 *
 * We use `NaN` as the in-memory stand-in for R's `NA_real_`.  When such a value
 * is serialised with `JSON.stringify`, `NaN` becomes `null` — byte-identical to
 * R's `toJSON(na = "null")`.
 */
function parseNum(s: string | undefined): number {
  if (s == null) return NaN;
  const t = s.trim();
  if (t === "") return NaN;
  if (t.startsWith("<")) return NaN;
  return Number(t);
}

/**
 * Split text into lines the way R's `readLines()` does: on CRLF, CR, or LF.
 * Real uploads are frequently Windows-authored (CRLF); without this a stray
 * "\r" would cling to a label or matrix cell and silently corrupt the parse
 * (and then falsely trip the label-reconciliation guard in upload.ts).
 */
function splitLines(text: string): string[] {
  return text.split(/\r\n?|\n/);
}

export function parsePerformanceTxt(text: string): Performance {
  const lines = splitLines(text);

  // --- Confusion matrix section ---
  // Line pattern:
  //           Reference
  // Prediction Failure Success
  //    Failure      19       4
  //    Success       0     377
  const refIdxs: number[] = [];
  lines.forEach((line, i) => {
    if (/^\s*Reference\s*$/.test(line)) refIdxs.push(i);
  });
  if (refIdxs.length !== 1) {
    throw new Error(
      `Performance file is not in the expected caret confusionMatrix text format: ` +
        `expected exactly one 'Reference' line, found ${refIdxs.length}.`,
    );
  }

  const refIdx = refIdxs[0];
  const headerIdx = refIdx + 1;
  if (headerIdx >= lines.length) {
    throw new Error(
      `Performance file is not in the expected caret confusionMatrix text format: ` +
        `missing header line after 'Reference'.`,
    );
  }

  const header = lines[headerIdx].trim();
  if (!/^Prediction\s+/.test(header)) {
    throw new Error(
      `Performance file is not in the expected caret confusionMatrix text format: ` +
        `header after 'Reference' must begin with 'Prediction'.`,
    );
  }

  // Class labels follow the word "Prediction" on the header line.
  const labels = header.replace(/^Prediction\s+/, "").split(/\s+/).map((l) => l.trim());
  const n = labels.length;
  if (n < 1 || (n === 1 && labels[0] === "")) {
    throw new Error(
      `Performance file is not in the expected caret confusionMatrix text format: ` +
        `no class labels found on the 'Prediction' header line.`,
    );
  }

  const matrix: number[][] = [];
  for (let i = 0; i < n; i++) {
    const rowIdx = headerIdx + 1 + i;
    if (rowIdx >= lines.length) {
      throw new Error(
        `Performance file is not in the expected caret confusionMatrix text format: ` +
          `missing confusion matrix row ${i + 1} for class '${labels[i]}'.`,
      );
    }

    const rowLine = lines[rowIdx];
    const rowPrefix = new RegExp(`^\\s*${escapeRegExp(labels[i])}\\s+`);
    if (!rowPrefix.test(rowLine)) {
      throw new Error(
        `Performance file is not in the expected caret confusionMatrix text format: ` +
          `expected confusion matrix row for class '${labels[i]}'.`,
      );
    }

    const numsStr = rowLine.replace(rowPrefix, "").trim();
    const nums = numsStr.split(/\s+/).map((x) => Number(x.trim()));
    if (nums.length !== n || nums.some((x) => !Number.isInteger(x))) {
      throw new Error(
        `Performance file is not in the expected caret confusionMatrix text format: ` +
          `row for class '${labels[i]}' must contain exactly ${n} integer value(s).`,
      );
    }

    matrix.push(nums);
  }

  // --- Statistics section ---
  // Each stat line looks like:   "               Accuracy : 0.99   "
  const statPat = /^\s+(.+?)\s*:\s*(.+?)\s*$/;
  const stats: Record<string, string> = {};
  for (const l of lines) {
    const m = statPat.exec(l);
    if (m) stats[m[1].trim()] = m[2].trim();
  }

  // Parse the 95% CI string "(0.9746, 0.9973)" -> [0.9746, 0.9973].
  const ciRaw = stats["95% CI"];
  let accuracy_ci: [number | null, number | null] = [null, null];
  if (ciRaw != null) {
    const found = ciRaw.match(/[0-9.e+-]+/g) ?? [];
    accuracy_ci = [
      found[0] != null ? Number(found[0].trim()) : null,
      found[1] != null ? Number(found[1].trim()) : null,
    ];
  }

  const confusion_matrix: ConfusionMatrix = { labels, matrix };

  return {
    // Strip surrounding single quotes from the "'Positive' Class" value, matching R's gsub.
    positive_class: (stats["'Positive' Class"] ?? "").replace(/'/g, "").trim(),
    confusion_matrix,
    accuracy: parseNum(stats["Accuracy"]),
    accuracy_ci,
    kappa: parseNum(stats["Kappa"]),
    no_information_rate: parseNum(stats["No Information Rate"]),
    sensitivity: parseNum(stats["Sensitivity"]),
    specificity: parseNum(stats["Specificity"]),
    ppv: parseNum(stats["Pos Pred Value"]),
    npv: parseNum(stats["Neg Pred Value"]),
    prevalence: parseNum(stats["Prevalence"]),
    detection_rate: parseNum(stats["Detection Rate"]),
    detection_prevalence: parseNum(stats["Detection Prevalence"]),
    balanced_accuracy: parseNum(stats["Balanced Accuracy"]),
  };
}

/** Escape a label so it can be embedded literally in a RegExp (R used the raw label). */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
