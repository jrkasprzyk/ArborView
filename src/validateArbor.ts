/**
 * validateArbor.ts — Runtime validation of an uploaded tree JSON.
 *
 * The manifest datasets are produced by `R/export_tree.R` and trusted.  An
 * uploaded file is NOT trusted: it may be hand-edited, the wrong file entirely,
 * or a tree from a future schema this build can't render.  `validateArbor`
 * walks the parsed JSON and either returns it typed as `Arbor`, or throws an
 * `Error` whose message names the offending field/node.
 * This is the primary half of REQ-005 ("MUST NOT crash" = validated-or-caught);
 * the upload render call (the initUpload onLoad callback) is wrapped in try/catch
 * in upload.ts as the backstop so any residual render error becomes an in-modal
 * message rather than an app crash.
 * Validation walks the tree RECURSIVELY — root-only checks gave false
 * confidence against a deep hand-edit that breaks a leaf far from the root.
 */

import type { Arbor } from "./types";

/** The one schema string this build understands.  The TS types only model @1. */
const SUPPORTED_SCHEMA = "arborview/tree@1";

/** Narrow `unknown` to a plain object (not null, not an array). */
function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Recursively validate one tree node and all of its descendants.
 * `path` is a human-readable locator used only for error messages.
 */
function validateNode(value: unknown, path: string): void {
  if (!isObject(value)) {
    throw new Error(`${path}: expected a node object`);
  }
  const nodeId = value["node_id"];
  if (typeof nodeId !== "number") {
    throw new Error(`${path}: missing numeric node_id`);
  }
  const nodeLabel = `node ${nodeId}`;

  const requiredNums = ["depth", "n", "weight", "deviance", "complexity", "impurity"] as const;
  for (const k of requiredNums) {
    if (typeof value[k] !== "number") {
      throw new Error(`${nodeLabel}: missing numeric ${k}`);
    }
  }

  const rules = value["rule_from_root"];
  if (!Array.isArray(rules) || rules.some((r) => typeof r !== "string")) {
    throw new Error(`${nodeLabel}: rule_from_root must be an array of strings`);
  }

  if (typeof value["is_leaf"] !== "boolean") {
    throw new Error(`${nodeLabel}: missing boolean is_leaf`);
  }

  const children = value["children"];
  if (children !== undefined) {
    if (!Array.isArray(children)) {
      throw new Error(`${nodeLabel}: children must be an array`);
    }
    children.forEach((child, i) => validateNode(child, `${nodeLabel} child ${i}`));
  }
}

/**
 * Validate an embedded `performance` block (SEC-002).
 *
 * A tree JSON produced by R/add_performance.R legitimately carries a
 * `performance` object, so uploads may include one — but until now it was
 * rendered without any validation.  Confusion-matrix cells reach an innerHTML
 * sink in main.ts, so a hand-crafted string cell was an XSS vector.  Enforce
 * the shape the renderer assumes: string labels, a square integer matrix of
 * matching size, and numeric (or null, R's NA) statistics.
 */
function validatePerformance(value: unknown): void {
  if (!isObject(value)) {
    throw new Error("performance must be an object");
  }

  if (typeof value["positive_class"] !== "string") {
    throw new Error("performance.positive_class must be a string");
  }

  const cm = value["confusion_matrix"];
  if (!isObject(cm)) {
    throw new Error("performance.confusion_matrix must be an object");
  }
  const labels = cm["labels"];
  if (!Array.isArray(labels) || labels.length === 0 || labels.some((l) => typeof l !== "string")) {
    throw new Error("performance.confusion_matrix.labels must be a non-empty array of strings");
  }
  const matrix = cm["matrix"];
  if (
    !Array.isArray(matrix) ||
    matrix.length !== labels.length ||
    matrix.some(
      (row) =>
        !Array.isArray(row) ||
        row.length !== labels.length ||
        row.some((cell) => typeof cell !== "number" || !Number.isInteger(cell)),
    )
  ) {
    throw new Error(
      `performance.confusion_matrix.matrix must be a ${labels.length}×${labels.length} array of integers`,
    );
  }

  const ci = value["accuracy_ci"];
  if (
    !Array.isArray(ci) ||
    ci.length !== 2 ||
    ci.some((v) => v !== null && typeof v !== "number")
  ) {
    throw new Error("performance.accuracy_ci must be a 2-element array of numbers or nulls");
  }

  const numericStats = [
    "accuracy", "kappa", "no_information_rate", "sensitivity", "specificity",
    "ppv", "npv", "prevalence", "detection_rate", "detection_prevalence",
    "balanced_accuracy",
  ] as const;
  for (const k of numericStats) {
    const v = value[k];
    // null is R's NA_real_ serialised by toJSON(na = "null").
    if (v !== null && typeof v !== "number") {
      throw new Error(`performance.${k} must be a number or null`);
    }
  }
}

export function validateArbor(value: unknown): Arbor {
  if (!isObject(value)) {
    throw new Error("uploaded JSON is not an object");
  }

  // --- Schema version (strict, but version-aware on mismatch) ---
  if (value["schema"] !== SUPPORTED_SCHEMA) {
    throw new Error(
      `unsupported schema version ${JSON.stringify(value["schema"])}; ` +
        `this build supports ${SUPPORTED_SCHEMA}`,
    );
  }

  // --- response ---
  const response = value["response"];
  if (!isObject(response)) {
    throw new Error("missing response object");
  }
  if (response["type"] !== "classification" && response["type"] !== "regression") {
    throw new Error(
      `response.type must be "classification" or "regression", got ${JSON.stringify(response["type"])}`,
    );
  }
  const levels = response["levels"];
  if (response["type"] === "regression") {
    if (levels !== null) {
      throw new Error("response.levels must be null for regression models");
    }
  } else {
    if (!Array.isArray(levels) || levels.some((l) => typeof l !== "string")) {
      throw new Error("response.levels must be an array of strings for classification models");
    }
  }

  // --- variables ---
  const variables = value["variables"];
  if (!isObject(variables)) {
    throw new Error("missing variables object");
  }
  if (!Array.isArray(variables["predictors"])) {
    throw new Error("variables.predictors must be an array");
  }
  if (!isObject(variables["importance"])) {
    throw new Error("variables.importance must be an object");
  }

  // --- performance (optional, but never rendered unvalidated — SEC-002) ---
  if (value["performance"] !== undefined && value["performance"] !== null) {
    validatePerformance(value["performance"]);
  }

  // --- tree (recursive) ---
  if (value["tree"] === undefined) {
    throw new Error("missing tree");
  }
  validateNode(value["tree"], "tree (root)");

  return value as unknown as Arbor;
}
