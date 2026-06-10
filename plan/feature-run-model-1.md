---
goal: In-browser user-directed CART vulnerability analysis via a "Run Model" tab (webR + rpart)
version: 1.0
date_created: 2026-06-10
owner: jrkasprzyk
status: 'Planned'
tags: [feature, architecture, scoping, strawman]
---

# Introduction

![Status: Planned](https://img.shields.io/badge/status-Planned-blue)

This is a scoping plan (strawman) for letting users run their own CART vulnerability
analysis directly inside ArborView, without leaving the browser and without any
server-side compute. The user opens a new **"Run Model"** tab, uploads a CSV of
system-performance data, assigns column roles (response + predictors), sets rpart
hyperparameters, and clicks Run. The resulting tree renders in the existing
Visualizer tab through the same `renderArbor` pipeline used by the manifest and
upload paths today.

The recommended engine is **webR** (R compiled to WebAssembly, https://docs.r-wasm.org/),
which runs the real `rpart` package in the browser. This preserves exact numerical
parity with the existing offline R export pipeline (`R/export_tree.R`), because the
`Arbor` JSON schema in `src/types.ts` mirrors rpart internals directly: `complexity`,
`deviance`, the cross-validated `cptable`, and surrogate-based variable importance.
No JavaScript tree library reproduces those.

## 1. Requirements & Constraints

- **REQ-001**: A new top-level tab "Run Model" alongside the existing Visualizer and About tabs (`#tab-visualizer` / `#tab-about` pattern in `index.html` and `src/main.ts:149-160`).
- **REQ-002**: User uploads a CSV; column roles are assigned in the UI: exactly one response column, one or more predictor columns, remaining columns ignored.
- **REQ-003**: Response type is auto-detected (factor/string or few unique values → classification; numeric → regression) with a manual override control. Classification is the primary path; regression must remain functional.
- **REQ-004**: Exposed rpart hyperparameters: `cp` (default 0.01), `minsplit` (default 20), `maxdepth` (default 30), `xval` (default 10). Sensible defaults pre-filled; all optional.
- **REQ-005**: The fitted model is converted to `Arbor` JSON *inside* webR using logic ported from `R/export_tree.R`, then passed through the existing `validateArbor` (`src/validateArbor.ts`) before rendering — the same atomic apply contract as the upload path (REQ-011 in `plan/feature-custom-upload-1.md`).
- **REQ-006**: On success, the app switches to the Visualizer tab, renders via `renderArbor`, and sets the provenance label (`setModelSource`) to e.g. "Fitted in browser: mydata.csv".
- **REQ-007**: Performance metrics (confusion matrix, accuracy, kappa, sensitivity, etc.) computed for classification fits. Strawman: computed in base R inside webR (not caret — too heavy for WASM), on either the training data or an optional user-selected holdout split (e.g. 80/20). The panel must label which data produced the metrics.
- **REQ-008**: A free-text "failure definition" input on the Run Model form, flowing to `arbor.failure_definition` (same as the upload modal).
- **SEC-001**: Uploaded CSV data never leaves the browser. No network calls carry user data; webR runtime assets are the only downloads. This is a feature (privacy) and must be stated in the UI.
- **SEC-002**: All user-supplied strings (column names, class labels, failure definition) flow through existing `escapeHtml`/`textContent` sinks; no new innerHTML sinks for raw user input.
- **SEC-003**: R code executed in webR is app-authored only; user input is passed as *data* (via webR's object transfer API), never interpolated into R source strings (R-injection guard).
- **CON-001**: Deployment must remain a static site (Vercel, per README). No backend. webR satisfies this; a plumber API would not.
- **CON-002**: webR runtime is ~tens of MB (WASM + rpart package). It MUST be lazy-loaded only when the user first opens the Run Model tab, never on initial page load. Initial-load performance of the visualizer is unchanged.
- **CON-003**: webR's fastest channel (SharedArrayBuffer) requires COOP/COEP headers. Vercel headers are configurable via `vercel.json`; fallback PostMessage channel works without headers (slower but acceptable for strawman).
- **CON-004**: webR runs in a Web Worker so a long fit never blocks the UI thread; the tab shows progress/spinner state and a cancel control.
- **GUD-001**: CSV parsing uses `d3.csvParse` (already in the d3 dependency) — no new runtime dependency for parsing.
- **GUD-002**: Follow the existing module pattern: new `src/runModel.ts` owns the tab's form lifecycle and delegates rendering through the same `onLoad`-style callback `initUpload` uses (`src/main.ts:209-213`).
- **PAT-001**: Tab activation generalizes `activateTab` in `src/main.ts:149` from the current two-tab boolean to a three-tab id-based switch.

## 2. Implementation Steps

### Implementation Phase 1 — Feasibility spike (timeboxed)

- GOAL-001: Prove webR + rpart works in this stack and measure the real costs before committing.

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-001 | Add `webr` npm package in a throwaway branch; load webR in a Web Worker from a Vite dev build; confirm `webr::install("rpart")` (or the precompiled wasm repo) loads and `rpart()` fits the iris dataset. | | |
| TASK-002 | Measure: total bytes downloaded on first Run Model open, time-to-interactive for the R session (cold and warm/cached), fit time for a ~10k-row CSV. Record numbers in this plan. | | |
| TASK-003 | Port the core of `R/export_tree.R` to a function string evaluated inside webR; diff its JSON output against an existing committed dataset in `public/data/` to confirm byte-level schema parity. | | |
| TASK-004 | Decide CDN-hosted vs self-hosted webR assets, and whether to add COOP/COEP headers in `vercel.json` for the SharedArrayBuffer channel. Update CON-003 with the decision. | | |

### Implementation Phase 2 — "Run Model" tab UI

- GOAL-002: Build the form: CSV upload, column-role assignment, hyperparameters, failure definition.

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-005 | `index.html`: add `#tab-run` button and `#panel-run` section following the existing tab markup; generalize `activateTab` in `src/main.ts` to a three-tab switch (PAT-001). | | |
| TASK-006 | New `src/runModel.ts`: CSV file input, parse with `d3.csvParse`, show a column summary table (name, inferred type, unique-value count, missing count). | | |
| TASK-007 | Column-role UI: radio per column for response; checkboxes for predictors; auto-detect response type with override (REQ-003). | | |
| TASK-008 | Hyperparameter fieldset (`cp`, `minsplit`, `maxdepth`, `xval`) with defaults, plus optional holdout-split toggle (REQ-007) and failure-definition textarea (REQ-008). | | |
| TASK-009 | Run/Cancel buttons with progress states: "downloading R runtime" (first use only), "fitting", "rendering". Errors display inline in the panel, never a blank crash. | | |

### Implementation Phase 3 — webR engine module

- GOAL-003: Encapsulate webR lifecycle and the fit-and-export round trip.

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-010 | New `src/webrEngine.ts`: lazy singleton that boots webR in a Worker on first use, installs/loads rpart, and exposes `fitCart(data, spec): Promise<unknown>` returning parsed Arbor JSON. | | |
| TASK-011 | New `R/webr_fit_export.R` (app-authored R source, bundled as a raw string asset): wraps `rpart()` + the export logic ported from `R/export_tree.R`; takes the data frame and a spec list as R objects (SEC-003), returns the Arbor JSON string. | | |
| TASK-012 | Base-R performance computation in `R/webr_fit_export.R` for classification: confusion matrix + the exact stats fields of the `Performance` type in `src/types.ts:249-264` (accuracy CI via binom.test, kappa, sens/spec/PPV/NPV, balanced accuracy), so caret is not needed in WASM. | | |
| TASK-013 | Wire output through `validateArbor` and the upload path's `reconcilePerformance` (`src/upload.ts:43`) before any rendering (REQ-005 atomicity). | | |

### Implementation Phase 4 — Integration, testing, docs

- GOAL-004: Connect to the visualizer, cover with tests, document.

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-014 | `src/main.ts`: register `initRunModel(onLoad)` next to `initUpload`, reusing the same callback that calls `renderArbor` + `setModelSource`; auto-switch to Visualizer tab on success (REQ-006). | | |
| TASK-015 | Vitest coverage: column-type inference, spec assembly, validation of webR output against `validateArbor` fixtures; R-side parity test comparing `R/webr_fit_export.R` output to `R/export_tree.R` output on the same model. | | |
| TASK-016 | Docs (Diátaxis): new how-to "Fit a model in the browser"; reference updates for the Run Model form fields; explanation note on webR architecture and the privacy property (SEC-001). | | |

## 3. Alternatives

- **ALT-001 — Pure TypeScript CART implementation**: no runtime download, but rpart's cost-complexity pruning, surrogate splits, categorical splits, cross-validated cptable, and surrogate-based variable importance would all need reimplementation; output would never match the R pipeline numerically. Existing JS libs (ml-cart) lack categorical splits and importance entirely. Rejected: parity risk dwarfs the bundle-size saving.
- **ALT-002 — Pyodide + scikit-learn**: heavier than webR, and sklearn's CART has no native categorical splits and no rpart-style cp table; same parity problem plus a bigger download. Rejected.
- **ALT-003 — Server-side R (plumber/OpenCPU API)**: trivial parity, but breaks the static-hosting deployment (CON-001), adds infra cost/ops, and ships user data off the browser (violates SEC-001's privacy property). Rejected for this tool's deployment model; revisit only if datasets become too large for in-browser fitting.
- **ALT-004 — Keep status quo (offline R + upload)**: zero work, but the ask is precisely to remove the R-installation barrier for end users. Baseline, not a solution.

## 4. Dependencies

- **DEP-001**: `webr` npm package (ESM bindings for webR) — new runtime dependency, lazy-loaded.
- **DEP-002**: webR WASM runtime assets + precompiled `rpart` wasm binary (CDN or self-hosted; decided in TASK-004).
- **DEP-003**: `d3.csvParse` from the existing `d3` dependency (no addition).
- **DEP-004**: Existing modules: `validateArbor.ts`, `upload.ts` (`reconcilePerformance`), `main.ts` (`renderArbor`, tab system).

## 5. Files

- **FILE-001**: `index.html` — new tab button + panel markup for Run Model.
- **FILE-002**: `src/main.ts` — three-tab `activateTab`, `initRunModel` wiring.
- **FILE-003**: `src/runModel.ts` (new) — form lifecycle, CSV parsing, column roles, spec assembly.
- **FILE-004**: `src/webrEngine.ts` (new) — webR Worker lifecycle, lazy boot, `fitCart` API.
- **FILE-005**: `R/webr_fit_export.R` (new) — in-browser fit + Arbor export + base-R performance stats.
- **FILE-006**: `styles.css` — Run Model panel styles.
- **FILE-007**: `vercel.json` (possibly new) — COOP/COEP headers if SharedArrayBuffer channel chosen.
- **FILE-008**: `docs/how-to/fit-in-browser.md` (new), `docs/reference.md`, `docs/explanation.md` — documentation.

## 6. Testing

- **TEST-001**: Unit — column-type inference (numeric vs categorical vs ID-like), response auto-detect, override behavior.
- **TEST-002**: Unit — spec assembly and validation errors (no response chosen, zero predictors, non-numeric `cp`, holdout fraction bounds).
- **TEST-003**: Integration — webR output passes `validateArbor` and `reconcilePerformance` for a classification and a regression fixture CSV.
- **TEST-004**: Parity — `R/webr_fit_export.R` run in desktop R produces JSON deep-equal to `R/export_tree.R` for the same rpart model.
- **TEST-005**: Manual — first-open download UX, cancel mid-fit, fit failure (e.g., constant response) shows inline error and leaves the visualizer untouched.

## 7. Risks & Assumptions

- **RISK-001**: webR runtime size (~tens of MB first load) may be unacceptable on slow connections; mitigated by lazy load + cache + a visible download progress bar. Spike (TASK-002) quantifies this.
- **RISK-002**: rpart wasm availability/version drift in the webR package repo; mitigated by self-hosting pinned assets (TASK-004).
- **RISK-003**: Browser memory limits for large CSVs (WASM heap); strawman scope assumes datasets in the 10²–10⁵ row range typical of vulnerability analysis ensembles.
- **RISK-004**: Reporting training-set performance can mislead; mitigated by the holdout option and explicit labeling (REQ-007).
- **ASSUMPTION-001**: Users' input is a flat CSV with header row; one row per simulated scenario/realization, columns = uncertain factors + outcome metric (standard scenario-discovery shape).
- **ASSUMPTION-002**: The existing Arbor schema (`arborview/tree@1`) is sufficient; no schema changes needed for in-browser fits.
- **ASSUMPTION-003**: Vercel static hosting remains the deployment target.

## 8. Related Specifications / Further Reading

- [webR documentation](https://docs.r-wasm.org/webr/latest/)
- [rpart package](https://cran.r-project.org/package=rpart)
- `plan/feature-custom-upload-1.md` — prior upload-path plan (atomic apply contract reused here)
- `docs/explanation.md` — existing export-to-D3 architecture
