---
goal: In-browser user-directed CART vulnerability analysis via a "Run Model" tab (webR + rpart)
version: 1.1
date_created: 2026-06-10
last_updated: 2026-06-10
owner: jrkasprzyk
status: 'Planned'
tags: [feature, architecture, scoping, strawman]
---

# Introduction

![Status: Planned](https://img.shields.io/badge/status-Planned-blue)

This is a scoping plan (strawman) for letting users run their own CART vulnerability
analysis directly inside ArborView, without leaving the browser and without any
server-side compute. The user opens a new **"Run Model"** tab and walks through an
interactive scenario-discovery workflow: load a CSV of raw system-performance data,
**define what "failure" means** by building threshold conditions on performance
metrics (deriving the response column — it is *not* assumed to exist a priori),
optionally **partition** the rows to the subset of interest, choose predictors and
rpart hyperparameters, and click Run. The resulting tree renders in the existing
Visualizer tab through the same `renderArbor` pipeline used by the manifest and
upload paths today.

This mirrors how the committed EOWY models were actually produced: the offline R
pipeline derived a Fail/Not-Fail class from a condition like *"Powell pool elevation
falls below 3500' at least once before EOWY1"* applied to raw trace metrics, then fit
rpart on the uncertain factors. The point of this phase is to move that derivation
step into the browser and make it interactive. A CSV that already contains a
ready-made response column is supported as an edge case (the user picks an existing
column instead of building conditions), not the primary path.

The interactive steps are framed as a wizard within the tab:

1. **Load data** — CSV upload + column summary.
2. **Define failure** — condition builder derives the response (primary), or pick an
   existing column (edge case).
3. **Partition** *(optional)* — row filters narrow the dataset to the cases of interest.
4. **Configure fit** — predictors, hyperparameters, holdout split.
5. **Run** — webR fit, render in Visualizer.

Steps 2–4 run entirely in TypeScript on the parsed data, so the user gets immediate
feedback (class balance, kept-row counts, threshold-vs-distribution previews) without
the webR runtime ever loading. webR is booted only when Run is clicked (CON-002).

The recommended engine is **webR** (R compiled to WebAssembly, https://docs.r-wasm.org/),
which runs the real `rpart` package in the browser. This preserves exact numerical
parity with the existing offline R export pipeline (`R/export_tree.R`), because the
`Arbor` JSON schema in `src/types.ts` mirrors rpart internals directly: `complexity`,
`deviance`, the cross-validated `cptable`, and surrogate-based variable importance.
No JavaScript tree library reproduces those.

## 1. Requirements & Constraints

- **REQ-001**: A new top-level tab "Run Model" alongside the existing Visualizer and About tabs (`#tab-visualizer` / `#tab-about` pattern in `index.html` and `src/main.ts:149-160`).
- **REQ-002**: User uploads a CSV of raw performance data; the response column is **derived in the UI, not assumed to exist**. Primary path: the user builds failure conditions (REQ-009) and the app materializes a two-level factor response (default labels "Fail" / "Not Fail", editable). Edge case: the user instead selects an existing column as the response (the v1.0 behavior), preserved behind an "use an existing column" toggle.
- **REQ-003**: For the derived-response path, the fit is always binary classification. For the existing-column edge case, response type is auto-detected (factor/string or few unique values → classification; numeric → regression) with a manual override control. Classification is the primary path; regression must remain functional.
- **REQ-009**: **Condition builder.** A failure condition is an ordered list of clauses combined by a single connective (ALL / ANY). Each clause is one of:
  - *numeric threshold*: `column <op> value`, op ∈ {`<`, `<=`, `>`, `>=`};
  - *categorical membership*: `column ∈ {selected levels}`.
  Clauses are added/removed dynamically; at least one clause is required to enable the derived path. Nested boolean expressions and cross-column arithmetic are out of scope for the strawman (noted in ASSUMPTION-004).
- **REQ-010**: **Live derivation preview.** As clauses change, the app shows (without webR): resulting class counts and balance (n Fail / n Not Fail, % Fail), and for the clause being edited a d3 histogram of that column with the threshold line overlaid. Degenerate outcomes (0% or 100% Fail) disable the Run button with an explanatory message — rpart cannot split a constant response.
- **REQ-011**: **Row partitioning.** An optional filter step reuses the same clause UI (ALL-combined) to *keep* matching rows before the fit. The UI shows kept/dropped counts live. Filtering applies before response derivation preview counts so the user sees the balance of the data that will actually be fit.
- **REQ-012**: **Leakage guard.** Columns referenced by failure-condition clauses are excluded from the predictor defaults and flagged with a warning if the user re-includes one manually (the derived response is trivially predictable from its source metric). Columns referenced only by partition filters are *not* excluded — filtering does not leak.
- **REQ-013**: **Derivation provenance.** The exact derivation (clauses, connective, partition filters, class labels, kept/total row counts) is recorded in the Arbor JSON under a new optional `derivation` field so a rendered tree is reproducible from the source CSV. Additive, optional field — existing files without it remain valid (`validateArbor` treats it as optional; schema stays `arborview/tree@1`).
- **REQ-004**: Exposed rpart hyperparameters: `cp` (default 0.01), `minsplit` (default 20), `maxdepth` (default 30), `xval` (default 10). Sensible defaults pre-filled; all optional.
- **REQ-005**: The fitted model is converted to `Arbor` JSON *inside* webR using logic ported from `R/export_tree.R`, then passed through the existing `validateArbor` (`src/validateArbor.ts`) before rendering — the same atomic apply contract as the upload path (REQ-011 in `plan/feature-custom-upload-1.md`).
- **REQ-006**: On success, the app switches to the Visualizer tab, renders via `renderArbor`, and sets the provenance label (`setModelSource`) to e.g. "Fitted in browser: mydata.csv".
- **REQ-007**: Performance metrics (confusion matrix, accuracy, kappa, sensitivity, etc.) computed for classification fits. Strawman: computed in base R inside webR (not caret — too heavy for WASM), on either the training data or an optional user-selected holdout split (e.g. 80/20). The panel must label which data produced the metrics.
- **REQ-008**: The `failure_definition` sentence is **auto-generated from the condition clauses** (e.g., "Failure: powell_min_elev < 3500 (any of 2 conditions)" rendered as readable prose), pre-filled into an editable text input, and flows to `arbor.failure_definition`. In the existing-column edge case the field is plain free text as in v1.0. Edits to the clauses regenerate the sentence only if the user has not modified it manually.
- **SEC-001**: Uploaded CSV data never leaves the browser. No network calls carry user data; webR runtime assets are the only downloads. This is a feature (privacy) and must be stated in the UI.
- **SEC-002**: All user-supplied strings (column names, class labels, failure definition) flow through existing `escapeHtml`/`textContent` sinks; no new innerHTML sinks for raw user input.
- **SEC-003**: R code executed in webR is app-authored only; user input is passed as *data* (via webR's object transfer API), never interpolated into R source strings (R-injection guard).
- **CON-001**: Deployment must remain a static site (Vercel, per README). No backend. webR satisfies this; a plumber API would not.
- **CON-002**: webR runtime is ~tens of MB (WASM + rpart package). It MUST be lazy-loaded only when the user first opens the Run Model tab, never on initial page load. Initial-load performance of the visualizer is unchanged.
- **CON-003**: webR's fastest channel (SharedArrayBuffer) requires COOP/COEP headers. Vercel headers are configurable via `vercel.json`; fallback PostMessage channel works without headers (slower but acceptable for strawman).
- **CON-004**: webR runs in a Web Worker so a long fit never blocks the UI thread; the tab shows progress/spinner state and a cancel control.
- **GUD-001**: CSV parsing uses `d3.csvParse` (already in the d3 dependency) — no new runtime dependency for parsing.
- **GUD-002**: Follow the existing module pattern: new `src/runModel.ts` owns the tab's form lifecycle and delegates rendering through the same `onLoad`-style callback `initUpload` uses (`src/main.ts:209-213`).
- **GUD-003**: Response derivation, partitioning, and sentence generation live in `src/deriveResponse.ts` as pure functions over parsed rows — no DOM access, no webR dependency — so previews are instant and the logic is unit-testable without a browser or R runtime.
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

### Implementation Phase 2 — Derivation engine (pure TypeScript, UI-independent)

- GOAL-002: Build and test the data-side logic — clause evaluation, response derivation, partitioning — with no DOM and no webR, so it is unit-testable in isolation.

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-005 | New `src/deriveResponse.ts`: types for `Clause` (numeric-threshold \| categorical-membership) and `FailureSpec` (clauses + ALL/ANY connective + class labels); `evaluateClause(row, clause): boolean`, `deriveResponse(rows, spec): string[]`, `applyPartition(rows, clauses): {kept, dropped}`. Missing values in a referenced column make the clause false for that row and increment a surfaced "rows with missing condition inputs" count. | | |
| TASK-006 | Class-balance + degeneracy computation (REQ-010): counts, % Fail, and a `degenerate` flag when either class is empty. Histogram binning for the preview delegated to `d3.bin` (already in d3). | | |
| TASK-007 | `failure_definition` sentence generator from a `FailureSpec` (REQ-008): numeric clauses as "`col` < `value`", membership clauses as "`col` is one of {…}", joined by "and"/"or"; partition filters appended as "among rows where …". | | |
| TASK-008 | `derivation` provenance object assembly (REQ-013) + the optional-field extension in `src/validateArbor.ts` (additive; fixtures without it must still pass). | | |

### Implementation Phase 3 — "Run Model" tab UI (wizard)

- GOAL-003: Build the tab as the five-step flow from the Introduction.

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-009 | `index.html`: add `#tab-run` button and `#panel-run` section following the existing tab markup; generalize `activateTab` in `src/main.ts` to a three-tab switch (PAT-001). | | |
| TASK-010 | New `src/runModel.ts` step 1: CSV file input, parse with `d3.csvParse`, column summary table (name, inferred type, unique-value count, min/max for numerics, missing count). This table is the launchpad for clause building — each numeric row gets an "add condition" affordance. | | |
| TASK-011 | Step 2 — condition builder (REQ-009): dynamic clause rows (column select, operator, value or level-multiselect), ALL/ANY toggle, editable class labels; live class-balance readout and per-clause histogram with threshold line (REQ-010); "use an existing column" toggle that swaps in the v1.0 response picker (REQ-002 edge case, REQ-003 auto-detect + override). | | |
| TASK-012 | Step 3 — partition filters (REQ-011): same clause UI, kept/dropped counts updating live, and the class-balance readout from step 2 recomputed on the kept subset. | | |
| TASK-013 | Step 4 — predictor checkboxes with leakage defaults + warning (REQ-012); hyperparameter fieldset (`cp`, `minsplit`, `maxdepth`, `xval`) with defaults; optional holdout-split toggle (REQ-007); auto-generated, editable failure-definition input (REQ-008). | | |
| TASK-014 | Step 5 — Run/Cancel with progress states: "downloading R runtime" (first use only), "fitting", "rendering". Run disabled with inline reason while the spec is invalid (no clauses and no response column, degenerate class balance, zero predictors, empty partition result). Errors display inline in the panel, never a blank crash. | | |

### Implementation Phase 4 — webR engine module

- GOAL-004: Encapsulate webR lifecycle and the fit-and-export round trip. webR receives the *finished* data frame — already partitioned, with the derived response materialized as a factor column — plus the fit spec. All derivation stays on the TypeScript side (Phase 2).

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-015 | New `src/webrEngine.ts`: lazy singleton that boots webR in a Worker on first use, installs/loads rpart, and exposes `fitCart(data, spec): Promise<unknown>` returning parsed Arbor JSON. | | |
| TASK-016 | New `R/webr_fit_export.R` (app-authored R source, bundled as a raw string asset): wraps `rpart()` + the export logic ported from `R/export_tree.R`; takes the data frame and a spec list as R objects (SEC-003), returns the Arbor JSON string. | | |
| TASK-017 | Base-R performance computation in `R/webr_fit_export.R` for classification: confusion matrix + the exact stats fields of the `Performance` type in `src/types.ts:249-264` (accuracy CI via binom.test, kappa, sens/spec/PPV/NPV, balanced accuracy), so caret is not needed in WASM. | | |
| TASK-018 | Wire output through `validateArbor` and the upload path's `reconcilePerformance` (`src/upload.ts:43`) before any rendering (REQ-005 atomicity); merge the `derivation` provenance object (TASK-008) into the validated Arbor before render. | | |

### Implementation Phase 5 — Integration, testing, docs

- GOAL-005: Connect to the visualizer, cover with tests, document.

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-019 | `src/main.ts`: register `initRunModel(onLoad)` next to `initUpload`, reusing the same callback that calls `renderArbor` + `setModelSource`; auto-switch to Visualizer tab on success (REQ-006). Provenance label includes the derivation, e.g. "Fitted in browser: mydata.csv (Fail = powell_min_elev < 3500)". | | |
| TASK-020 | Vitest coverage: clause evaluation + derivation + partition (Phase 2 functions), sentence generation, leakage-default computation, column-type inference, spec assembly, validation of webR output against `validateArbor` fixtures; R-side parity test comparing `R/webr_fit_export.R` output to `R/export_tree.R` output on the same model. | | |
| TASK-021 | Docs (Diátaxis): new how-to "Define failure conditions and fit a model in the browser" walking the EOWY example end-to-end (raw trace metrics → threshold → tree); reference updates for the Run Model wizard fields and the `derivation` JSON field; explanation note on webR architecture, the TS/R division of labor, and the privacy property (SEC-001). | | |

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
- **FILE-003**: `src/runModel.ts` (new) — wizard lifecycle, CSV parsing, clause-builder/partition/fit-config UI, spec assembly.
- **FILE-003b**: `src/deriveResponse.ts` (new) — clause types, response derivation, partitioning, class-balance stats, failure-sentence generation, `derivation` provenance assembly (pure functions, GUD-003).
- **FILE-003c**: `src/validateArbor.ts` — additive optional `derivation` field (REQ-013).
- **FILE-004**: `src/webrEngine.ts` (new) — webR Worker lifecycle, lazy boot, `fitCart` API.
- **FILE-005**: `R/webr_fit_export.R` (new) — in-browser fit + Arbor export + base-R performance stats.
- **FILE-006**: `styles.css` — Run Model panel styles.
- **FILE-007**: `vercel.json` (possibly new) — COOP/COEP headers if SharedArrayBuffer channel chosen.
- **FILE-008**: `docs/how-to/fit-in-browser.md` (new), `docs/reference.md`, `docs/explanation.md` — documentation.

## 6. Testing

- **TEST-001**: Unit — clause evaluation: each operator, categorical membership, ALL vs ANY, missing values in referenced columns (clause false + missing count surfaced), boundary values (`<` vs `<=` at exactly the threshold).
- **TEST-002**: Unit — derivation + partition: class labels applied correctly, partition kept/dropped counts, class balance recomputed on the kept subset, degenerate detection (all Fail / none Fail / empty partition).
- **TEST-003**: Unit — failure-sentence generation from specs (single clause, multi-clause ALL/ANY, with partition suffix); manual-edit lockout (regenerate only while untouched).
- **TEST-004**: Unit — leakage defaults: condition columns excluded from predictor defaults, partition-only columns not excluded, warning on manual re-inclusion.
- **TEST-005**: Unit — column-type inference (numeric vs categorical vs ID-like), response auto-detect + override (edge-case path), spec assembly errors (no clauses and no response column, zero predictors, non-numeric `cp`, holdout fraction bounds).
- **TEST-006**: Integration — webR output passes `validateArbor` (with and without `derivation`) and `reconcilePerformance` for a derived-response classification CSV, an existing-column classification CSV, and a regression fixture CSV.
- **TEST-007**: Parity — `R/webr_fit_export.R` run in desktop R produces JSON deep-equal to `R/export_tree.R` for the same rpart model. Workflow parity: deriving the EOWY1 condition in the UI on the raw trace CSV reproduces the class counts of the committed `EOWY1_vTC_classification.json` root node.
- **TEST-008**: Manual — first-open download UX, cancel mid-fit, fit failure shows inline error and leaves the visualizer untouched, Run stays disabled with a visible reason on degenerate class balance.

## 7. Risks & Assumptions

- **RISK-001**: webR runtime size (~tens of MB first load) may be unacceptable on slow connections; mitigated by lazy load + cache + a visible download progress bar. Spike (TASK-002) quantifies this.
- **RISK-002**: rpart wasm availability/version drift in the webR package repo; mitigated by self-hosting pinned assets (TASK-004).
- **RISK-003**: Browser memory limits for large CSVs (WASM heap); strawman scope assumes datasets in the 10²–10⁵ row range typical of vulnerability analysis ensembles.
- **RISK-004**: Reporting training-set performance can mislead; mitigated by the holdout option and explicit labeling (REQ-007).
- **RISK-005**: Users may set thresholds that produce extreme class imbalance (e.g., 2% Fail) — the fit succeeds but the tree is fragile. Strawman mitigation: the live balance readout (REQ-010) plus a soft warning below ~5% minority class; resampling/weighting is out of scope.
- **RISK-006**: Leakage of derivation columns into predictors yields a trivial one-split tree that looks perfect; mitigated by REQ-012 defaults + warning, but a determined user can still do it (allowed deliberately — sometimes the metric *is* a legitimate predictor for a different condition).
- **ASSUMPTION-001**: Users' input is a flat CSV with header row; one row per simulated scenario/realization, columns = uncertain factors + raw outcome metrics (standard scenario-discovery shape). Any time-series aggregation (e.g., "min elevation over the horizon") happened upstream; the CSV contains the already-aggregated metric columns the conditions are written against.
- **ASSUMPTION-002**: The existing Arbor schema (`arborview/tree@1`) is sufficient apart from the additive optional `derivation` field (REQ-013); no schema version bump needed.
- **ASSUMPTION-003**: Vercel static hosting remains the deployment target.
- **ASSUMPTION-004**: Flat clause lists with one connective (ALL/ANY) cover the strawman's failure definitions. Nested boolean logic, cross-column arithmetic (e.g., `colA - colB < x`), and derived metrics are deferred — if user testing demands them, revisit as a v2 of the condition builder rather than complicating this phase.
- **ASSUMPTION-005**: The raw trace CSV behind the committed EOWY models is available to the team for the workflow-parity check (TEST-007); if not, substitute any dataset with a known offline derivation.

## 8. Related Specifications / Further Reading

- [webR documentation](https://docs.r-wasm.org/webr/latest/)
- [rpart package](https://cran.r-project.org/package=rpart)
- `plan/feature-custom-upload-1.md` — prior upload-path plan (atomic apply contract reused here)
- `docs/explanation.md` — existing export-to-D3 architecture
