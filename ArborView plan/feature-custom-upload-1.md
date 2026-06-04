---
goal: Add in-browser custom dataset upload (tree JSON + performance.txt + failure-definition sentence) to supplement manifest.json
version: 1.0
date_created: 2026-06-04
last_updated: 2026-06-04
owner: ArborView team (jrkasprzyk)
status: 'Planned'
tags: [feature, ui, parsing]
---

# Introduction

![Status: Planned](https://img.shields.io/badge/status-Planned-blue)

This plan adds an in-browser "Load your own data" workflow to ArborView, modeled on the
import-setup screen in the sibling project `c:\GitHub\paretoexplorer` (`src/ParetoApp.jsx`).
Today ArborView can only display datasets pre-listed in `public/data/manifest.json`, each of
which is a tree JSON produced by `R/export_tree.R` and optionally patched offline with
`R/add_performance.R` (performance stats) and `R/add_failure_definition.R` (the plain-English
"failure definition" sentence).

The new workflow lets a user, entirely client-side and without running R:

1. Upload a tree JSON file (an `Arbor`, schema `arborview/tree@1`).
2. Optionally upload a caret `confusionMatrix` `performance.txt` file, parsed in the browser.
3. Type the "sentence" describing the condition of interest (the failure definition).
4. Render the assembled model in the existing visualizer.

The existing manifest-driven example datasets remain fully functional and unchanged. The upload
path reuses the same render pipeline (`renderArbor`) as manifest datasets.

## 1. Requirements & Constraints

- **REQ-001**: User can upload a single tree JSON file via a file picker and have it rendered in the existing visualizer.
- **REQ-002**: User can optionally upload one caret `confusionMatrix` `performance.txt` file; it MUST be parsed in the browser (no R, no network) into the existing `Performance` type and shown in the "Model performance" panel.
- **REQ-003**: User can type a free-text "failure definition" sentence; it MUST populate the existing `failure_definition` field and render in the Failure Definition overlay.
- **REQ-004**: The browser-side `performance.txt` parser MUST produce output byte-compatible with `parse_performance_txt()` in `R/add_performance.R` for the example files in `example_data/SE_Oct2025_CART_performance_P3500_EOWY{1,2,3,4,5}.txt`.
- **REQ-005**: Uploaded tree JSON MUST be validated against the `Arbor` shape before render; invalid input MUST surface a human-readable error and MUST NOT crash the app.
- **REQ-006**: The manifest-driven dropdown workflow MUST continue to work unchanged; upload is additive ("supplement", not replace).
- **REQ-007**: Performance upload and failure-definition entry MUST be optional; a tree JSON alone is sufficient to render.
- **SEC-001**: All user-supplied strings rendered into the DOM (titles, failure sentence, class labels, performance labels) MUST pass through `escapeHtml()` from `src/utils.ts` (or be set via `textContent`) to prevent XSS. No raw `innerHTML` of unsanitized upload content.
- **SEC-002**: File reads MUST use the `FileReader`/`File.text()` API only; the feature MUST NOT POST upload contents to any server.
- **CON-001**: Stack is vanilla TypeScript + Vite + D3 (no React, no framework). Do NOT introduce React or paretoexplorer's JSX; port only the *logic/UX concept*, not its code.
- **CON-002**: No build/runtime dependencies may be added except an optional dev-only test runner (see DEP-002). Parser and validation MUST be hand-written TypeScript.
- **CON-003**: `src/types.ts` is the single source of truth for the JSON schema and MUST NOT diverge from `R/export_tree.R`. Reuse existing exported types; do not duplicate them.
- **GUD-001**: Match surrounding code style: heavy explanatory comments (see `src/main.ts`), named `function` declarations, `$<T>()` DOM-lookup helper pattern, `async/await`.
- **GUD-002**: Keep new logic in small, single-responsibility modules importable for unit testing, rather than inlining everything into `main.ts`.
- **PAT-001**: Reuse the render pipeline. Refactor the back half of `loadDataset()` in `src/main.ts` into a reusable `renderArbor(arbor: Arbor)` and call it from both the manifest path and the upload path.

## 2. Implementation Steps

### Implementation Phase 1

- GOAL-001: Extract a reusable render entry point and a client-side performance.txt parser, with no UI changes yet.

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-001 | In `src/main.ts`, refactor `loadDataset(entry: ManifestEntry)` (lines ~209-254): split it into (a) `loadDataset()` which fetches `data/${entry.file}` then calls (b) a new exported-within-module `function renderArbor(arbor: Arbor): void` containing the existing body from `currentArbor = arbor;` through the `renderTree(...)` call. The manifest dropdown path MUST behave identically after the refactor. | | |
| TASK-002 | Create `src/parsePerformance.ts` exporting `function parsePerformanceTxt(text: string): Performance`. Port the algorithm from `R/add_performance.R::parse_performance_txt` exactly: (1) locate the single line matching `/^\s*Reference\s*$/`; (2) next line must match `/^Prediction\s+/`, class labels = remainder split on `/\s+/`; (3) read N matrix rows, each starting with the label then N integers; (4) parse stat lines via `/^\s+(.+?)\s*:\s*(.+?)\s*$/` into a key→value map; (5) parse `95% CI` "(a, b)" via `/[0-9.e+-]+/g` taking first two; (6) map keys to the `Performance` fields exactly as the R `list(...)` does. Import the `Performance` and `ConfusionMatrix` types from `./types`. | | |
| TASK-003 | In `src/parsePerformance.ts`, implement a `parseNum(s)` helper mirroring R `parse_num`: trim, return `NaN`→treated as null for values beginning with `<` or unparseable; `accuracy_ci` becomes `[number|null, number|null]`; strip surrounding single quotes from `'Positive' Class`. Throw `Error` with the same descriptive messages as the R `stop(...)` calls when the format is unexpected (missing/duplicate `Reference`, missing `Prediction` header, missing rows, wrong column count). | | |
| TASK-004 | Create `src/validateArbor.ts` exporting `function validateArbor(value: unknown): Arbor`. Assert: `schema === "arborview/tree@1"`; `response.type` is `"classification"\|"regression"`; `tree` is an object with a numeric `node_id` and boolean `is_leaf`; `variables.predictors` is an array and `variables.importance` is an object. On failure throw `Error` with a specific message naming the missing/invalid field. Return the value typed as `Arbor` on success. | | |

### Implementation Phase 2

- GOAL-002: Add the upload UI (entry point, modal/panel, file inputs, sentence field) and wire it to the Phase 1 logic.

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-005 | In `index.html`, add an upload entry point in the `.controls` block (after `#dataset-select`, line ~23): a `<button id="upload-open" class="btn">Load your own…</button>`. Add a hidden modal overlay container `<div id="upload-modal" class="upload-modal" hidden>` placed before the closing `</body>` (near `#metric-tooltip`, line ~67) containing: title; a tree-JSON file input `#upload-json` (`accept=".json,application/json"`); an optional performance.txt file input `#upload-perf` (`accept=".txt,text/plain"`); a `<textarea id="upload-sentence">` for the failure definition; a status/error region `#upload-error`; and `#upload-apply` / `#upload-cancel` buttons. Use existing class/markup idioms. | | |
| TASK-006 | Create `src/upload.ts` exporting `function initUpload(onLoad: (arbor: Arbor) => void): void`. It caches the modal DOM nodes (reuse the `$<T>()` helper pattern or accept references), opens the modal on `#upload-open` click, closes on `#upload-cancel` / overlay click / Escape. On `#upload-apply`: read `#upload-json` via `File.text()`, `JSON.parse`, then `validateArbor`; if `#upload-perf` has a file, read it and run `parsePerformanceTxt`, assigning the result to `arbor.performance`; set `arbor.failure_definition` from the trimmed textarea value (omit if empty); on success call `onLoad(arbor)` and close; on any thrown error write the message to `#upload-error` and keep the modal open. | | |
| TASK-007 | In `src/main.ts`, import `initUpload` and call `initUpload((arbor) => { renderArbor(arbor); })` during/after `bootstrap()`. When an uploaded arbor is rendered, set `datasetSelect.value = ""` (deselect) and update `#response-badge` (already handled inside `renderArbor`). Ensure `renderArbor` does not assume a manifest entry exists. | | |
| TASK-008 | In `src/styles.css`, add styles for `.upload-modal` (centered overlay with backdrop), the file inputs, the sentence `<textarea>`, the `#upload-error` (reuse the error red used in `main.ts` startup handler, `#b03a2e`), and the `#upload-open` button. Match existing CSS custom-property and color conventions (e.g. `--sidebar-w`, `--node-failure`). | | |
| TASK-009 | Update `public/about.md` to document the "Load your own…" workflow: required tree JSON schema (`arborview/tree@1`), that the R scripts (`export_tree.R`, `add_performance.R`, `add_failure_definition.R`) are the source format, the expected caret `confusionMatrix` text format for performance.txt, and that the failure-definition sentence is free text. | | |

### Implementation Phase 3

- GOAL-003: Validate correctness against R reference output, add tests, and verify build.

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-010 | Add a dev-only test runner (vitest) per DEP-002, plus a `"test": "vitest run"` script in `package.json`. If the user declines adding a dependency, implement TASK-011/TASK-012 as a manual Node script under `scripts/` instead and document the manual procedure. | | |
| TASK-011 | Write `src/parsePerformance.test.ts`: parse each of `example_data/SE_Oct2025_CART_performance_P3500_EOWY{1,2,3,4,5}.txt` and assert the result deep-equals the corresponding `performance` object already embedded in `public/data/EOWY{1,2,5}_classification.json` (produced by the R script), confirming REQ-004 byte-compatibility. Include a malformed-input case asserting a descriptive `Error` is thrown. | | |
| TASK-012 | Write `src/validateArbor.test.ts`: assert each `public/data/*.json` passes `validateArbor`, and assert representative invalid inputs (wrong `schema`, missing `tree`, bad `response.type`) throw with field-naming messages. | | |
| TASK-013 | Run `npm run build` (`tsc && vite build`) and confirm zero TypeScript errors and a successful Vite build. Manually exercise the upload flow with `dev` server: upload `EOWY1_classification.json` (strip its existing `performance`/`failure_definition` first to prove the add path), upload the matching performance.txt, type a sentence, and confirm the tree, performance panel, and failure overlay all render. | | |

## 3. Alternatives

- **ALT-001**: Full-screen landing page that forces a data choice before showing the tool (closer to paretoexplorer's `!loaded` gate). Rejected: ArborView already auto-loads a manifest dataset and the requirement is to *supplement*, not gate, that flow. A modal is less disruptive.
- **ALT-002**: A persistent "Upload" tab alongside Visualizer/About. Rejected as heavier than needed; a button-triggered modal keeps the single-screen visualizer focus. Can be revisited if upload grows more options.
- **ALT-003**: Accept the raw rpart model / CSV and build the tree in-browser. Rejected: tree construction lives in R (`export_tree.R`); reimplementing rpart export client-side is out of scope. Upload consumes the already-exported JSON.
- **ALT-004**: Reuse a CSV/role-assignment "import setup" table like paretoexplorer. Rejected: ArborView's input is a structured tree JSON, not a flat table, so column-role assignment does not apply.

## 4. Dependencies

- **DEP-001**: Existing runtime libs only — `d3`, `dompurify`, `marked`, `@floating-ui/dom` (already in `package.json`). No new runtime dependency.
- **DEP-002**: Optional dev-only test runner `vitest` (and it pulls no runtime code into the bundle). Only added if the user approves a new devDependency (see TASK-010 fallback).
- **DEP-003**: Existing exported types in `src/types.ts`: `Arbor`, `Performance`, `ConfusionMatrix`, `ManifestEntry`. Existing helpers in `src/utils.ts`: `escapeHtml`. Existing `renderTree` in `src/tree.ts`.

## 5. Files

- **FILE-001**: `src/main.ts` — refactor `loadDataset` to extract `renderArbor(arbor)`; import and initialize `initUpload`. (TASK-001, TASK-007)
- **FILE-002**: `src/parsePerformance.ts` — NEW; client-side port of `R/add_performance.R::parse_performance_txt`. (TASK-002, TASK-003)
- **FILE-003**: `src/validateArbor.ts` — NEW; runtime validation of uploaded tree JSON against the `Arbor` shape. (TASK-004)
- **FILE-004**: `src/upload.ts` — NEW; modal lifecycle, file reads, assembly of the `Arbor`, error display. (TASK-006)
- **FILE-005**: `index.html` — add `#upload-open` button and `#upload-modal` markup. (TASK-005)
- **FILE-006**: `src/styles.css` — styles for upload button and modal. (TASK-008)
- **FILE-007**: `public/about.md` — document the upload workflow and expected formats. (TASK-009)
- **FILE-008**: `src/parsePerformance.test.ts`, `src/validateArbor.test.ts` — NEW tests. (TASK-011, TASK-012)
- **FILE-009**: `package.json` — add `test` script (and vitest devDependency if approved). (TASK-010)
- **FILE-REF-001**: `R/add_performance.R`, `R/add_failure_definition.R`, `R/export_tree.R` — reference specs for parser and field semantics; NOT modified.
- **FILE-REF-002**: `c:\GitHub\paretoexplorer\src\ParetoApp.jsx` — UX reference (`startImportSetup`, `handleFile`, `!loaded` landing); NOT used as code.

## 6. Testing

- **TEST-001**: `parsePerformanceTxt` output deep-equals the R-produced `performance` blocks in the example JSONs for all five EOWY performance files (REQ-004).
- **TEST-002**: `parsePerformanceTxt` throws descriptive `Error`s for malformed inputs (no `Reference` line, missing `Prediction` header, short matrix row).
- **TEST-003**: `validateArbor` accepts every shipped `public/data/*.json` and rejects wrong-schema / missing-tree / bad-response-type inputs with field-naming messages.
- **TEST-004**: Manual end-to-end: upload tree JSON only → renders; + performance.txt → performance panel populates; + sentence → failure overlay shows the text; cancel/Escape closes the modal without changing the current view.
- **TEST-005**: `npm run build` completes with zero `tsc` errors.
- **TEST-006**: XSS check — upload a tree whose `title`/class label and a failure sentence contain `<img src=x onerror=...>`; confirm it renders inert text, not executed HTML (SEC-001).

## 7. Risks & Assumptions

- **RISK-001**: Subtle divergence between the TS parser and the R parser (whitespace, integer vs float, CI edge cases). Mitigated by TEST-001 comparing directly to R output.
- **RISK-002**: Performance files with >2 classes or unusual caret formatting may differ from the 2-class examples. Mitigation: parser is generic over N labels (as the R code is); flag any non-conforming format with a clear error rather than silent mis-parse.
- **RISK-003**: Refactor of `loadDataset` (TASK-001) could regress the manifest path. Mitigation: keep the extracted body byte-for-byte and smoke-test manifest datasets after refactor.
- **RISK-004**: Adding vitest is a new devDependency the maintainer may not want. Mitigation: TASK-010 fallback to a manual `scripts/` Node check.
- **ASSUMPTION-001**: The "sentence that defines the conditions of interest" maps exactly to the existing top-level `failure_definition` field (set by `R/add_failure_definition.R`, displayed in `#failure-def-text`). Confirmed by reading both files.
- **ASSUMPTION-002**: Uploaded tree JSON is already in `arborview/tree@1` format (i.e., produced by `R/export_tree.R`); the feature does not build trees from raw rpart models or CSVs.
- **ASSUMPTION-003**: Single-file upload per slot (one tree JSON, one performance.txt) is sufficient; batch upload is out of scope.

## 8. Related Specifications / Further Reading

- `src/types.ts` — `Arbor`, `Performance`, `ConfusionMatrix`, `Manifest` schema (source of truth).
- `R/add_performance.R` — reference implementation of the performance.txt parser ported in TASK-002.
- `R/add_failure_definition.R` — semantics of the failure-definition sentence.
- `R/export_tree.R` — how the tree JSON is produced upstream.
- `c:\GitHub\paretoexplorer\src\ParetoApp.jsx` — UX reference for the upload/import-setup concept.
- caret `confusionMatrix` documentation — format of the uploaded performance.txt.
