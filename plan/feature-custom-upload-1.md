---
goal: Add in-browser custom dataset upload (tree JSON + performance.txt + failure-definition sentence) to supplement manifest.json
version: 1.1
date_created: 2026-06-04
last_updated: 2026-06-04
owner: ArborView team (jrkasprzyk)
status: 'In progress'
tags: [feature, ui, parsing]
---

# Introduction

![Status: In progress](https://img.shields.io/badge/status-In_progress-yellow)

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
- **REQ-005**: Uploaded tree JSON MUST be validated against the `Arbor` shape before render; invalid input MUST surface a human-readable error and MUST NOT crash the app. "MUST NOT crash" means **validated-or-caught**: validation walks the tree **recursively** (every node's `node_id`/`is_leaf`/`children` shape), AND the upload render call is wrapped in try/catch as a backstop so any residual render error becomes an in-modal error message rather than an app crash.
- **REQ-006**: The manifest-driven dropdown workflow MUST continue to work unchanged; upload is additive ("supplement", not replace).
- **REQ-007**: Performance upload and failure-definition entry MUST be optional; a tree JSON alone is sufficient to render.
- **REQ-008**: When a `performance.txt` is uploaded, the parsed `confusion_matrix.labels` MUST be reconciled against the tree: reject if the tree is regression (`response.levels === null`); require **exact-order** equality between `confusion_matrix.labels` and `response.levels`; require `positive_class ∈ response.levels`. On mismatch, surface an error that names BOTH label lists (the upload removes the old implicit guard of R-scripts + manual manifest edits, so wrong-file pairing is now a live user-error path).
- **REQ-009**: The browser parser MUST normalize line endings the way R's `readLines()` does — split on `/\r\n?|\n/` (handle CRLF/CR/LF) and trim each parsed token/label/number — so a Windows-authored upload (likely CRLF) parses identically to an LF file. (Repo fixtures are pinned LF via `.gitattributes`, but real uploads are the CRLF source.)
- **REQ-010**: The UI MUST display a provenance label for the currently-viewed model in the top bar. A browser file input exposes only the **basename** (`file.name`), never an absolute path; the label therefore defaults to `file.name` and MAY be overridden by an optional free-text "source label" field in the upload modal. The label is persisted on the in-memory arbor for the session.
- **REQ-011**: The Apply action MUST be **atomic** — if tree validation, performance parse, or performance↔tree reconciliation fails, nothing renders, the modal stays open, and the error is shown. No partial-success (no rendering a tree while silently dropping a mismatched performance file).
- **SEC-001**: All user-supplied strings rendered into the DOM (titles, failure sentence, class labels, performance labels) MUST pass through `escapeHtml()` from `src/utils.ts` (or be set via `textContent`) to prevent XSS. No raw `innerHTML` of unsanitized upload content. Audited 2026-06-04: existing sinks are already safe — `tree.ts` uses only D3 `.text()` (textContent), `#failure-def-text` uses `textContent`, and the sidebar/tooltip/performance `innerHTML` builders wrap every interpolation in `escapeHtml`. The **one new sink** this feature adds is the top-bar provenance label (REQ-010, user-supplied `file.name` + free text), which MUST be set via `textContent`.
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
| TASK-001 | In `src/main.ts`, refactor `loadDataset(entry: ManifestEntry)` (lines ~209-254): split it into (a) `loadDataset()` which fetches `data/${entry.file}` then calls (b) a new exported-within-module `function renderArbor(arbor: Arbor): void` containing the existing body from `currentArbor = arbor;` through the `renderTree(...)` call. The manifest dropdown path MUST behave identically after the refactor. | ✅ | 2026-06-04 |
| TASK-002 | Create `src/parsePerformance.ts` exporting `function parsePerformanceTxt(text: string): Performance`. **Keep it a pure `string → Performance` function — no `Arbor`/tree knowledge** (so it is deep-equal testable against R output; the perf↔tree cross-check is TASK-006b, not here). **First normalize line endings like R `readLines()`: split via `/\r\n?|\n/` (handles CRLF/CR/LF)** before any matching. Port the algorithm from `R/add_performance.R::parse_performance_txt` exactly: (1) locate the single line matching `/^\s*Reference\s*$/`; (2) next line must match `/^Prediction\s+/`, class labels = remainder split on `/\s+/`; (3) read N matrix rows, each starting with the label then N integers; (4) parse stat lines via `/^\s+(.+?)\s*:\s*(.+?)\s*$/` into a key→value map; (5) parse `95% CI` "(a, b)" via `/[0-9.e+-]+/g` taking first two; (6) map keys to the `Performance` fields exactly as the R `list(...)` does. **Trim every parsed label/token/number** so a stray `\r`/space cannot corrupt a label or matrix cell. Parser MUST NOT round (preserve what the txt says). Import the `Performance` and `ConfusionMatrix` types from `./types`. | ✅ | 2026-06-04 |
| TASK-003 | In `src/parsePerformance.ts`, implement a `parseNum(s)` helper mirroring R `parse_num`: trim, return `NaN`→treated as null for values beginning with `<` or unparseable; `accuracy_ci` becomes `[number|null, number|null]`; strip surrounding single quotes from `'Positive' Class`. Throw `Error` with the same descriptive messages as the R `stop(...)` calls when the format is unexpected (missing/duplicate `Reference`, missing `Prediction` header, missing rows, wrong column count). | ✅ | 2026-06-04 |
| TASK-004 | Create `src/validateArbor.ts` exporting `function validateArbor(value: unknown): Arbor`. Define a single `const SUPPORTED_SCHEMA = "arborview/tree@1"` and assert `schema === SUPPORTED_SCHEMA`; on a version mismatch throw a **version-aware** message, e.g. `unsupported schema version "<got>"; this build supports arborview/tree@1` (stay strict — the TS types only model @1). Assert `response.type` is `"classification"\|"regression"`; `variables.predictors` is an array and `variables.importance` is an object. **Validate the tree RECURSIVELY**, not just the root: every node must be an object with numeric `node_id`, boolean `is_leaf`, and (if present) a `children` array of nodes; walk all descendants. On failure throw `Error` naming the offending field and node (e.g. `node 6: missing numeric node_id`). Return the value typed as `Arbor` on success. (REQ-005 is also backstopped by a try/catch around the upload render in TASK-007.) | ✅ | 2026-06-04 |

### Implementation Phase 2

- GOAL-002: Add the upload UI (entry point, modal/panel, file inputs, sentence field) and wire it to the Phase 1 logic.

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-005 | In `index.html`, add an upload entry point in the `.controls` block (after `#dataset-select`, line ~23): a `<button id="upload-open" class="btn">Load your own…</button>`. Add a **top-bar provenance element** `<span id="model-source" class="model-source"></span>` (REQ-010) showing the current model's label. Add a hidden modal overlay container `<div id="upload-modal" class="upload-modal" hidden>` placed before the closing `</body>` (near `#metric-tooltip`, line ~67) containing: title; a tree-JSON file input `#upload-json` (`accept=".json,application/json"`); an optional performance.txt file input `#upload-perf` (`accept=".txt,text/plain"`); an **optional free-text source-label input `#upload-source`** (defaults to the JSON filename, overridable — REQ-010); a `<textarea id="upload-sentence">` for the failure definition; a status/error region `#upload-error`; and `#upload-apply` / `#upload-cancel` buttons. Use existing class/markup idioms. | ✅ | 2026-06-04 |
| TASK-006 | Create `src/upload.ts` exporting `function initUpload(onLoad: (arbor: Arbor, sourceLabel: string) => void): void`. It caches the modal DOM nodes (reuse the `$<T>()` helper pattern or accept references), opens the modal on `#upload-open` click, closes on `#upload-cancel` / overlay click / Escape. Default `#upload-source` to the chosen JSON's `file.name` (basename only — browsers do not expose absolute paths). The Apply handler is **atomic** (REQ-011): on `#upload-apply`, read `#upload-json` via `File.text()`, `JSON.parse`, then `validateArbor`; if `#upload-perf` has a file, read it and run `parsePerformanceTxt`; **run the perf↔tree reconciliation (TASK-006b) before assigning** `arbor.performance`; set `arbor.failure_definition` from the trimmed textarea value (omit if empty); compute `sourceLabel = (#upload-source value or file.name)`. If ALL steps succeed, call `onLoad(arbor, sourceLabel)` and close; if ANY step throws, render nothing, write the message to `#upload-error`, and keep the modal open. | ✅ | 2026-06-04 |
| TASK-006b | In `src/upload.ts`, add a `function reconcilePerformance(perf: Performance, arbor: Arbor): void` run between parse and assignment (REQ-008). Throw a descriptive `Error` if: `arbor.response.levels === null` (regression — performance not applicable); `perf.confusion_matrix.labels` is not exactly equal (same order) to `arbor.response.levels`; or `perf.positive_class` is not in `arbor.response.levels`. Mismatch errors MUST name BOTH lists, e.g. `performance labels [Failure, Success] do not match model classes [Success, Failure]`. Keep this OUT of `parsePerformanceTxt` so the parser stays pure (REQ-004 testability). | ✅ | 2026-06-04 |
| TASK-007 | In `src/main.ts`, import `initUpload` and call `initUpload((arbor, sourceLabel) => { try { renderArbor(arbor); setModelSource(sourceLabel); } catch (err) { /* surfaced by upload.ts via re-throw or shared error region */ } })` during/after `bootstrap()` — wrap the upload render in **try/catch** as the REQ-005 backstop (re-throw so TASK-006's atomic handler keeps the modal open with the message). When an uploaded arbor is rendered: insert/replace a transient `<option value="" disabled selected>Uploaded: <sourceLabel></option>` in `#dataset-select` so the widget reflects the off-manifest source (removed when a manifest item is chosen), and set `#model-source` via `textContent` (SEC-001). Add `setModelSource(label)` and ensure the manifest path also sets `#model-source` to the dataset label. Ensure `renderArbor` does not assume a manifest entry exists. | ✅ | 2026-06-04 |
| TASK-008 | In `src/styles.css`, add styles for `.upload-modal` (centered overlay with backdrop), the file inputs, the `#upload-source` input, the sentence `<textarea>`, the `#upload-error` (reuse the error red used in `main.ts` startup handler, `#b03a2e`), the `#upload-open` button, and the top-bar `.model-source` label. Match existing CSS custom-property and color conventions (e.g. `--sidebar-w`, `--node-failure`). | ✅ | 2026-06-04 |
| TASK-009 | Update `public/about.md` to document the "Load your own…" workflow: required tree JSON schema (`arborview/tree@1`), that the R scripts (`export_tree.R`, `add_performance.R`, `add_failure_definition.R`) are the source format, the expected caret `confusionMatrix` text format for performance.txt, that the failure-definition sentence is free text, that performance is **classification-only and its class labels must match the model's** (REQ-008), and that the source label shown in the top bar is the filename (browsers cannot read the full path — user may override it). | ✅ | 2026-06-04 |

### Implementation Phase 3

- GOAL-003: Validate correctness against R reference output, add tests, and verify build.

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-010 | Add the dev-only test runner **vitest** (DEP-002 — decided 2026-06-04, the manual-`scripts/` fallback is dropped), plus a `"test": "vitest run"` script in `package.json`. | ✅ | 2026-06-04 |
| TASK-011 | Write `src/parsePerformance.test.ts`. Coverage is the shipped set **EOWY{1,2,5} only** — do NOT add EOWY3/4 (deliberately not shipped; may leave disk next version). For each, parse `example_data/SE_Oct2025_CART_performance_P3500_EOWY{1,2,5}.txt` and compare against the `performance` object embedded in `public/data/EOWY{1,2,5}_classification.json`: **numeric fields with a 6-digit tolerance** (`toBeCloseTo`, matching R `toJSON(digits=6)`), labels/matrix/strings **exact** (REQ-004). Add a **CRLF case**: take one fixture with `\r\n` injected and assert it parses identically to its LF form (REQ-009). Add a malformed-input case asserting a descriptive `Error` is thrown. | ✅ | 2026-06-04 |
| TASK-012 | Write `src/validateArbor.test.ts`: assert each `public/data/*.json` passes `validateArbor`, and assert representative invalid inputs (wrong `schema` → version-aware message, missing `tree`, bad `response.type`, **a deep/nested malformed child node** to exercise the recursive walk) throw with field-naming messages. Also test `reconcilePerformance` (TASK-006b / REQ-008): accept a matching perf, and reject (a) a regression arbor (`levels === null`), (b) reordered labels, (c) a `positive_class` not in `levels` — asserting both label lists appear in the message. | ✅ | 2026-06-04 |
| TASK-013 | Run `npm run build` (`tsc && vite build`) and confirm zero TypeScript errors and a successful Vite build. Manually exercise the upload flow with `dev` server: upload `EOWY1_classification.json` (strip its existing `performance`/`failure_definition` first to prove the add path), upload the matching performance.txt, type a sentence, and confirm the tree, performance panel, and failure overlay all render. | ⚙️ build verified (`tsc`+`vite` clean; 20 vitest tests pass) — browser manual e2e pending user | 2026-06-04 |

## 3. Alternatives

- **ALT-001**: Full-screen landing page that forces a data choice before showing the tool (closer to paretoexplorer's `!loaded` gate). Rejected: ArborView already auto-loads a manifest dataset and the requirement is to *supplement*, not gate, that flow. A modal is less disruptive.
- **ALT-002**: A persistent "Upload" tab alongside Visualizer/About. Rejected as heavier than needed; a button-triggered modal keeps the single-screen visualizer focus. Can be revisited if upload grows more options.
- **ALT-003**: Accept the raw rpart model / CSV and build the tree in-browser. Rejected: tree construction lives in R (`export_tree.R`); reimplementing rpart export client-side is out of scope. Upload consumes the already-exported JSON.
- **ALT-004**: Reuse a CSV/role-assignment "import setup" table like paretoexplorer. Rejected: ArborView's input is a structured tree JSON, not a flat table, so column-role assignment does not apply.

## 4. Dependencies

- **DEP-001**: Existing runtime libs only — `d3`, `dompurify`, `marked`, `@floating-ui/dom` (already in `package.json`). No new runtime dependency.
- **DEP-002**: Dev-only test runner `vitest` (pulls no runtime code into the bundle). **Approved 2026-06-04** — added as a devDependency; the earlier "manual `scripts/` fallback" is dropped.
- **DEP-003**: Existing exported types in `src/types.ts`: `Arbor`, `Performance`, `ConfusionMatrix`, `ManifestEntry`. Existing helpers in `src/utils.ts`: `escapeHtml`. Existing `renderTree` in `src/tree.ts`.

## 5. Files

- **FILE-001**: `src/main.ts` — refactor `loadDataset` to extract `renderArbor(arbor)`; import and initialize `initUpload`. (TASK-001, TASK-007)
- **FILE-002**: `src/parsePerformance.ts` — NEW; client-side port of `R/add_performance.R::parse_performance_txt`. (TASK-002, TASK-003)
- **FILE-003**: `src/validateArbor.ts` — NEW; runtime validation of uploaded tree JSON against the `Arbor` shape. (TASK-004)
- **FILE-004**: `src/upload.ts` — NEW; modal lifecycle, file reads, assembly of the `Arbor`, atomic Apply, `reconcilePerformance` perf↔tree guard, source-label default, error display. (TASK-006, TASK-006b)
- **FILE-005**: `index.html` — add `#upload-open` button, `#model-source` top-bar label, `#upload-source` input, and `#upload-modal` markup. (TASK-005)
- **FILE-006**: `src/styles.css` — styles for upload button and modal. (TASK-008)
- **FILE-007**: `public/about.md` — document the upload workflow and expected formats. (TASK-009)
- **FILE-008**: `src/parsePerformance.test.ts`, `src/validateArbor.test.ts` — NEW tests. (TASK-011, TASK-012)
- **FILE-009**: `package.json` — add `test` script and the vitest devDependency. (TASK-010)
- **FILE-010**: `.gitattributes` — pin `*.txt text eol=lf` so performance fixtures stay LF-stable across Windows checkouts. **Already applied 2026-06-04.** (RISK-005)
- **FILE-REF-001**: `R/add_performance.R`, `R/add_failure_definition.R`, `R/export_tree.R` — reference specs for parser and field semantics; NOT modified.
- **FILE-REF-002**: `c:\GitHub\paretoexplorer\src\ParetoApp.jsx` — UX reference (`startImportSetup`, `handleFile`, `!loaded` landing); NOT used as code.

## 6. Testing

- **TEST-001**: `parsePerformanceTxt` matches the R-produced `performance` blocks for the shipped **EOWY{1,2,5}** files — numeric fields within a 6-digit tolerance, labels/matrix/strings exact (REQ-004). (EOWY3/4 deliberately excluded.)
- **TEST-002**: `parsePerformanceTxt` throws descriptive `Error`s for malformed inputs (no `Reference` line, missing `Prediction` header, short matrix row).
- **TEST-003**: `validateArbor` accepts every shipped `public/data/*.json` and rejects wrong-schema (version-aware msg) / missing-tree / bad-response-type / **deep malformed child** inputs with field-naming messages.
- **TEST-004**: Manual end-to-end: upload tree JSON only → renders; + performance.txt → performance panel populates; + sentence → failure overlay shows the text; top-bar source label shows the filename; cancel/Escape closes the modal without changing the current view.
- **TEST-005**: `npm run build` completes with zero `tsc` errors.
- **TEST-006**: XSS check — upload a tree whose `title`/class label, a failure sentence, **and the source label** contain `<img src=x onerror=...>`; confirm all render inert text, not executed HTML (SEC-001, incl. the new top-bar `#model-source` sink).
- **TEST-007**: Line-ending robustness — a CRLF-encoded performance file parses identically to its LF form (REQ-009).
- **TEST-008**: Perf↔tree reconciliation (`reconcilePerformance`, REQ-008) rejects a regression arbor, reordered labels, and an out-of-set `positive_class`, with both label lists named in the error; Apply stays atomic (nothing renders on failure, modal stays open).

## 7. Risks & Assumptions

- **RISK-001**: Subtle divergence between the TS parser and the R parser (whitespace, integer vs float, CI edge cases). Mitigated by TEST-001 comparing directly to R output.
- **RISK-002**: Performance files with >2 classes or unusual caret formatting may differ from the 2-class examples. Mitigation: parser is generic over N labels (as the R code is); flag any non-conforming format with a clear error rather than silent mis-parse.
- **RISK-003**: Refactor of `loadDataset` (TASK-001) could regress the manifest path. Mitigation: keep the extracted body byte-for-byte and smoke-test manifest datasets after refactor.
- **RISK-004**: ~~Adding vitest is a new devDependency the maintainer may not want.~~ **Resolved 2026-06-04** — vitest approved (dev-only, no runtime/bundle impact); fallback removed.
- **RISK-005**: CRLF line endings in user-uploaded performance files would corrupt labels/cells under a naive `\n` split and then falsely trip the REQ-008 label guard. Mitigation: REQ-009 normalization + trim + TEST-007 CRLF case; repo fixtures pinned LF via `.gitattributes` (`*.txt text eol=lf`).
- **RISK-006**: A user mis-pairs a tree JSON with the wrong performance.txt (the upload removes the old R-script/manifest guard). Mitigation: REQ-008 exact-label reconciliation + atomic Apply (REQ-011) surface the mismatch instead of rendering wrong numbers.
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

## 9. Resolved Design Decisions (grill-me session, 2026-06-04)

These resolutions are already folded into the requirements/tasks above; recorded here for rationale.

- **DD-01 (→REQ-005, TASK-004/007)**: `validateArbor` walks the tree **recursively**, and the upload render is wrapped in try/catch. "MUST NOT crash" = validated-or-caught. Root-only validation gave false confidence against hand-edited uploads.
- **DD-02 (→TEST-001, TASK-011)**: parser-vs-R test uses **6-digit numeric tolerance** (matching R `toJSON(digits=6)`); labels/matrix/strings exact. The parser itself never rounds — rounding belongs in the test.
- **DD-03 (→DEP-002, TASK-010)**: **vitest approved**; manual-script fallback dropped. Correctness rests on parser↔R equivalence, which deserves real automated tests; dev-only dep has no runtime/security cost.
- **DD-04 (→REQ-008, TASK-006b)**: performance is reconciled against the tree — reject regression, require **exact-order** label equality vs `response.levels`, require `positive_class ∈ levels`, name both lists on mismatch. Upload removed the old script/manifest guard, so wrong-file pairing is now a live error path.
- **DD-05 (→TASK-011)**: parser test coverage is **EOWY{1,2,5} only**; EOWY3/4 excluded deliberately (research ships 1/2/5-yr horizons; 3/4 may leave disk next version).
- **DD-06 (→REQ-010, TASK-005/007)**: post-upload, a transient disabled `<option>` reflects the off-manifest source. Browsers expose only `file.name` (basename), so the top-bar provenance label defaults to the filename with an optional user override — a literal absolute path is impossible in-browser.
- **DD-07 (→REQ-009, RISK-005, FILE-010)**: normalize line endings (`/\r\n?|\n/`) + trim tokens; add a CRLF test; pin `*.txt eol=lf`. LF fixtures are luck — real Windows-authored uploads are the CRLF source.
- **DD-08 (→TASK-004)**: schema check stays exact against a single `SUPPORTED_SCHEMA` constant but emits a **version-aware** error. Don't forward-accept unknown versions (the TS types only model `@1`; rendering unknown shapes is the crash risk from DD-01).
- **DD-09 (→REQ-003)**: the failure sentence is **ungated** on regression (free annotation, no structural coupling) — unlike performance, which has a hard class-label dependency.
- **DD-10 (→SEC-001, TEST-006)**: existing DOM sinks audited safe; the only new sink is the top-bar source label, rendered via `textContent`.
- **DD-11 (→REQ-011, TASK-006)**: Apply is **atomic** — any failure aborts the whole load and keeps the modal open; no partial-success that could hide a mismatched performance file.
- **DD-12 (→REQ-004, TASK-002/006b)**: `parsePerformanceTxt` stays a **pure** `string → Performance`; the perf↔tree cross-check lives in `upload.ts` (assembly-time), preserving clean R-equivalence testing.
