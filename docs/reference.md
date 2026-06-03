# Reference

Exact, lookup-oriented details for ArborView. For task instructions see the [how-to guides](how-to/README.md); for concepts see the [explanation](explanation.md).

## Contents

- [Requirements](#requirements)
- [Adding Rscript to PATH](#adding-rscript-to-path)
- [npm scripts](#npm-scripts)
- [R scripts](#r-scripts)
- [Project structure](#project-structure)
- [Class-colour CSS variables](#class-colour-css-variables)
- [JSON schema](#json-schema)
- [Manifest](#manifest)

---

## Requirements

- **Node.js** 18+ and npm.
- **R** with packages `rpart`, `jsonlite` (and `partykit` for some workflows) — only needed to export your own models.

npm is bundled with Node.js. Install Node 18+ from https://nodejs.org, or with a package manager:

```bash
# macOS
brew install node
# Windows
winget install OpenJS.NodeJS
```

Reopen your terminal afterward, then verify:

```bash
node --version
npm --version
```

## Adding Rscript to PATH

`Rscript` ships with R and is required when exporting models from the command line. Check whether it is already available:

```bash
Rscript --version
```

If not found, add the directory containing `Rscript` to your PATH. On Windows it is usually a versioned install directory:

```text
C:\Program Files\R\R-4.x.x\bin
```

Locate it from PowerShell if unsure:

```powershell
Get-ChildItem "C:\Program Files\R" -Recurse -Filter Rscript.exe
```

Then add that `bin` directory to your user PATH (Start → **Edit environment variables for your account** → **Environment Variables** → **Path** → **Edit** → **New**), save, and reopen your terminal.

## npm scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the Vite development server. |
| `npm run build` | Type-check with `tsc` and bundle for production. |
| `npm run preview` | Serve the production build locally. |

## R scripts

All scripts live in `R/` and are run from the repository root.

### `export_tree.R`

Converts an rpart model to ArborView JSON. Supports methods `"class"` and `"anova"` only; others are rejected.

```bash
Rscript R/export_tree.R <in.rds> <out.json> [title]
```

| Argument | Required | Description |
|---|---|---|
| `<in.rds>` | yes | Saved rpart model. |
| `<out.json>` | yes | Output path; parent directory is created if missing. |
| `[title]` | no | Dropdown label; defaults to the model's R call. |

Interactive equivalent:

```r
source("R/export_tree.R")
arborview_export(fit, "public/data/my_model.json", title = "My Model")
```

### `add_performance.R`

Parses a `caret::confusionMatrix()` text report and patches it into an exported JSON as a `performance` field.

```bash
Rscript R/add_performance.R <perf.txt> <tree.json>
```

The performance text file is the **first** argument, the tree JSON the second. Both must exist.

### `add_failure_definition.R`

Sets or clears the `failure_definition` field on an exported JSON.

```bash
Rscript R/add_failure_definition.R <tree.json> "<sentence>"
```

The JSON path is **first**, the sentence second. An empty string (`""`) clears the field.

## Project structure

```
ArborView/
├── src/
│   ├── main.ts          # App entry, dataset loading, sidebar UI
│   ├── tree.ts          # D3 tree renderer
│   ├── tooltip.ts       # Tooltip rendering
│   ├── utils.ts         # Utility functions (incl. semanticColors)
│   ├── types.ts         # TypeScript type definitions
│   └── styles.css       # Styles (incl. class-colour CSS variables)
├── R/
│   ├── export_tree.R            # rpart → JSON exporter
│   ├── add_performance.R        # patches caret confusionMatrix into JSON
│   └── add_failure_definition.R # sets/clears failure_definition in JSON
├── public/
│   ├── about.md         # About tab content
│   └── data/            # JSON tree files and manifest.json
├── docs/                # This documentation
├── example_data/        # Sample rpart models (.rds)
└── index.html
```

## Class-colour CSS variables

Four CSS custom properties at the top of `src/styles.css` are the single source of truth for semantic colours. The class-name → variable mapping lives in `semanticColors()` in `src/utils.ts`.

| Variable | Default | Encodes | Used in |
|---|---|---|---|
| `--node-success` | `#1d6fa4` | "Success" class label (domain meaning) | Tree nodes, probability bars |
| `--node-failure` | `#b45309` | "Failure" class label (domain meaning) | Tree nodes, probability bars |
| `--cm-correct` | `#2f855a` | Correct prediction (model accuracy) | Confusion-matrix diagonal cells |
| `--cm-error` | `#b03a2e` | Incorrect prediction (model accuracy) | Confusion-matrix off-diagonal cells |

Class names without a `semanticColors()` entry fall back to D3's Tableau10 palette. See [How to change the class colours](how-to/change-class-colours.md) to edit these, and the [explanation](explanation.md#why-two-colour-systems) for why there are two systems.

## JSON schema

`arborview_export()` writes one self-contained JSON file per model.

### Top-level fields

| Field | Type | Description |
|---|---|---|
| `schema` | string | Always `"arborview/tree@1"`. Used to detect version mismatches. |
| `title` | string | Human-readable label shown in the dataset dropdown. |
| `method` | string | rpart method: `"class"` (classification) or `"anova"` (regression). |
| `response.type` | string | `"classification"` or `"regression"`. |
| `response.levels` | string array or null | Ordered class labels for classification; `null` for regression. Index `i` matches index `i` in each node's `class_counts` and `class_probs`. |
| `variables.predictors` | string array | Names of all predictor variables from the model formula. |
| `variables.importance` | object | Variable-importance scores (higher = more important). Keys are predictor names; values are raw scores. |
| `cptable` | array or absent | One row per tree size evaluated during cross-validation: `CP`, `nsplit`, `rel_error`, `xerror`, `xstd`. |
| `call` | string | The original R call that produced the model. |
| `tree` | object | Root node; children nested recursively (see below). |
| `performance` | object or absent | Whole-tree statistics from `caret::confusionMatrix()`, added by `add_performance.R`. |
| `failure_definition` | string or absent | Plain-English sentence shown in the canvas overlay, added by `add_failure_definition.R`. |

### Node fields

Every node — leaf or internal split — has these:

| Field | Type | Description |
|---|---|---|
| `node_id` | integer | rpart node ID. Root = 1; left child of node `k` = `2k`; right = `2k+1`. |
| `depth` | integer | Distance from root (root = 0). |
| `n` | integer | Training observations that reached this node. |
| `weight` | number | Sum of case weights; equals `n` when no weights were used. |
| `deviance` | number | Total deviance (impurity × n). Classification: weighted Gini × n. Regression: residual sum of squares. |
| `complexity` | number | Cost-complexity parameter (α) at which this node would be pruned. Smaller = more stable. |
| `is_leaf` | boolean | `true` for terminal leaves. |
| `impurity` | number | Per-observation impurity. Classification: Gini (1 − Σpᵢ²). Regression: MSE (deviance / n). |
| `rule_from_root` | string array | Plain-English rules from the root down to (not including) this node. Empty for the root. |

**Classification-only** (when `response.type == "classification"`):

| Field | Type | Description |
|---|---|---|
| `predicted_class` | string | Majority-class label at this node. |
| `class_counts` | integer array | Raw counts per class; order matches `response.levels`. |
| `class_probs` | number array | Proportion per class; order matches `response.levels`; sums to 1. |
| `node_prob` | number | Fraction of the entire training set that reached this node. |

**Regression-only** (when `response.type == "regression"`):

| Field | Type | Description |
|---|---|---|
| `predicted_value` | number | Mean response value at this node. |

**Internal-node-only** (when `is_leaf == false`):

| Field | Type | Description |
|---|---|---|
| `split_var` | string | Predictor used to split here. |
| `split` | object | The split condition (see below). |
| `children` | array | Two-element `[left_child, right_child]`, each a full node object. |

### Split objects

Numeric split (e.g. `age < 12.5`):

```json
{
  "type": "numeric",
  "threshold": 12.5,
  "left_op": "<",
  "right_op": ">="
}
```

> The operators may be inverted (`left_op` `>=`, `right_op` `<`) for rpart's less common right-leaning split variant; always read them from the object rather than assuming.

Categorical split (e.g. `region ∈ {West, South}`):

```json
{
  "type": "categorical",
  "left_levels": ["West", "South"],
  "right_levels": ["East", "Midwest"]
}
```

`left_levels` and `right_levels` are the factor levels routed to each child. Levels absent from both were `NA` in the training data.

### Performance object

Present only after `add_performance.R` has run. Parsed from `caret::confusionMatrix()` text.

| Field | Type | Description |
|---|---|---|
| `positive_class` | string | The class caret designated as "positive". |
| `confusion_matrix.labels` | string array | Class labels; order matches `matrix` rows and columns. |
| `confusion_matrix.matrix` | number[][] | `matrix[i][j]` = count predicted as `labels[i]`, true class `labels[j]`. Rows = predicted, columns = reference. |
| `accuracy` | number | Overall fraction correct. |
| `accuracy_ci` | [number, number] | 95% confidence interval for accuracy. |
| `kappa` | number | Cohen's kappa — agreement above chance. |
| `no_information_rate` | number | Accuracy of always predicting the majority class. |
| `sensitivity` | number | True positive rate for the positive class. |
| `specificity` | number | True negative rate for the positive class. |
| `ppv` | number | Positive predictive value (precision). |
| `npv` | number | Negative predictive value. |
| `prevalence` | number | Fraction of the test set in the positive class. |
| `detection_rate` | number | Fraction of the test set correctly identified as positive. |
| `detection_prevalence` | number | Fraction of the test set predicted as positive. |
| `balanced_accuracy` | number | Average of sensitivity and specificity. |

## Manifest

`public/data/manifest.json` is the index of available datasets:

```json
{
  "datasets": [
    { "id": "my_model", "label": "My Model", "file": "my_model.json" }
  ]
}
```

| Field | Description |
|---|---|
| `id` | Short unique key. |
| `label` | Text shown in the dropdown. |
| `file` | Filename relative to `public/data/`. |

See [How to register a dataset](how-to/register-a-dataset.md) for the task steps.
