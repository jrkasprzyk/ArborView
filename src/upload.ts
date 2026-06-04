/**
 * upload.ts — The "Load your own…" workflow.
 *
 * Lets a user assemble an `Arbor` entirely client-side from up to three inputs:
 *   1. a tree JSON file (required)              -> parsed + validateArbor
 *   2. a caret confusionMatrix performance.txt  -> parsePerformanceTxt (optional)
 *   3. a free-text "failure definition" sentence (optional)
 * plus an optional source-label override for the top-bar provenance display.
 *
 * Design notes:
 *   - This module owns modal lifecycle + file reads + assembly only.  Rendering
 *     is delegated to the `onLoad` callback (wired to renderArbor in main.ts).
 *   - The Apply action is ATOMIC (REQ-011): if tree validation, performance
 *     parsing, or the performance<->tree reconciliation fails, nothing renders,
 *     the modal stays open, and the error is shown.  No partial success.
 *   - The performance<->tree cross-check lives here (`reconcilePerformance`),
 *     NOT in parsePerformanceTxt, so the parser stays a pure string->Performance
 *     function that is deep-equal testable against the R output.
 */

import type { Arbor, Performance } from "./types";
import { parsePerformanceTxt } from "./parsePerformance";
import { validateArbor } from "./validateArbor";

/** Same DOM-lookup helper idiom as main.ts: throw early on a missing id. */
const $ = <T extends Element>(sel: string): T => {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`ArborView: required DOM element not found: "${sel}". Check index.html.`);
  return el;
};

/**
 * Reconcile a parsed Performance against the tree it will be attached to (REQ-008).
 *
 * The upload path removed the old implicit guard (R scripts + hand-edited
 * manifest), so pairing a tree with the WRONG performance.txt is now a live
 * user-error path.  We reject it loudly instead of rendering wrong numbers:
 *   - regression trees have no class labels -> performance is not applicable
 *   - the confusion-matrix labels must equal response.levels in the SAME order
 *   - the positive_class must be one of response.levels
 * Mismatch errors name BOTH label lists so the user can see the discrepancy.
 */
export function reconcilePerformance(perf: Performance, arbor: Arbor): void {
  const levels = arbor.response.levels;
  if (levels === null) {
    throw new Error(
      "this is a regression model (no class labels), so a classification performance file cannot be attached",
    );
  }

  const labels = perf.confusion_matrix.labels;
  const sameOrder =
    labels.length === levels.length && labels.every((l, i) => l === levels[i]);
  if (!sameOrder) {
    throw new Error(
      `performance labels [${labels.join(", ")}] do not match model classes [${levels.join(", ")}]`,
    );
  }

  if (!levels.includes(perf.positive_class)) {
    throw new Error(
      `performance positive class "${perf.positive_class}" is not one of the model classes [${levels.join(", ")}]`,
    );
  }
}

export function initUpload(onLoad: (arbor: Arbor, sourceLabel: string) => void): void {
  const openBtn   = $<HTMLButtonElement>("#upload-open");
  const modal     = $<HTMLDivElement>("#upload-modal");
  const jsonInput = $<HTMLInputElement>("#upload-json");
  const perfInput = $<HTMLInputElement>("#upload-perf");
  const sourceInput   = $<HTMLInputElement>("#upload-source");
  const sentenceInput = $<HTMLTextAreaElement>("#upload-sentence");
  const errorEl   = $<HTMLDivElement>("#upload-error");
  const applyBtn  = $<HTMLButtonElement>("#upload-apply");
  const cancelBtn = $<HTMLButtonElement>("#upload-cancel");

  function showError(message: string): void {
    errorEl.textContent = message;
    errorEl.hidden = false;
  }

  function clearError(): void {
    errorEl.textContent = "";
    errorEl.hidden = true;
  }

  function openModal(): void {
    clearError();
    modal.hidden = false;
  }

  function closeModal(): void {
    modal.hidden = true;
  }

  openBtn.addEventListener("click", openModal);
  cancelBtn.addEventListener("click", closeModal);

  // Click on the dimmed backdrop (but not the dialog body) closes the modal.
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });

  // Escape closes the modal while it is open.
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modal.hidden) closeModal();
  });

  // Default the source label to the chosen JSON's filename (basename only — a
  // browser file input never exposes an absolute path).  We only auto-fill while
  // the user hasn't typed their own override.
  jsonInput.addEventListener("change", () => {
    const name = jsonInput.files?.[0]?.name ?? "";
    if (name && sourceInput.value.trim() === "") sourceInput.value = name;
  });

  applyBtn.addEventListener("click", () => {
    // The whole handler is atomic: assemble everything first, and only call
    // onLoad (which renders) if every step succeeds.  Any throw lands in the
    // catch, writes the message, and leaves the modal open unchanged.
    void applyUpload();
  });

  async function applyUpload(): Promise<void> {
    clearError();
    try {
      const jsonFile = jsonInput.files?.[0];
      if (!jsonFile) throw new Error("Please choose a tree JSON file.");

      const arbor = validateArbor(JSON.parse(await jsonFile.text()));

      // Optional performance.txt — parse, reconcile against the tree, THEN attach.
      const perfFile = perfInput.files?.[0];
      if (perfFile) {
        const perf = parsePerformanceTxt(await perfFile.text());
        reconcilePerformance(perf, arbor);
        arbor.performance = perf;
      }

      // Optional failure-definition sentence (free text; ungated on regression).
      const sentence = sentenceInput.value.trim();
      if (sentence) arbor.failure_definition = sentence;

      const sourceLabel = sourceInput.value.trim() || jsonFile.name;

      // All steps succeeded — render and close.
      onLoad(arbor, sourceLabel);
      closeModal();
    } catch (err) {
      showError(err instanceof Error ? err.message : String(err));
    }
  }
}
