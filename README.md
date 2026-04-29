# ArborView

An interactive web-based visualization tool for CART decision trees built with R's `rpart` package. ArborView exports rpart models to JSON and renders them in the browser using D3.js, making it easy to explore and communicate tree structure, node statistics, and variable importance.

**Live demo:** https://arborview-delta.vercel.app/

## Features

- Interactive hierarchical tree layout powered by D3.js
- Node sizing proportional to sample count
- Hover tooltips with per-node statistics
- Decision path breadcrumb — rules from root to any selected node
- Detail panel showing impurity, complexity, deviance, and class probabilities
- Variable importance chart
- Support for both classification (Gini) and regression (MSE) trees
- Dataset selector for comparing multiple models

## Requirements

- **Node.js** (v18+) and npm
- **R** with packages: `rpart`, `jsonlite`, `partykit`

## Installation

```bash
npm install
```

## Usage

### 1. Export a model from R

```r
source("R/export_tree.R")

fit <- rpart::rpart(Class ~ ., data = mydata)
arborview_export(fit, "public/data/my_model.json", title = "My Model")
```

Or from the command line:

```bash
Rscript R/export_tree.R model.rds public/data/my_model.json "My Model"
```

Then add an entry for your file in `public/data/manifest.json`.

### 2. Start the dev server

```bash
npm run dev
```

Open the URL printed by Vite (typically `http://localhost:5173`) in your browser.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the Vite development server |
| `npm run build` | Compile TypeScript and bundle for production |
| `npm run preview` | Serve the production build locally |

## Project Structure

```
ArborView/
├── src/
│   ├── main.ts          # App entry, dataset loading, sidebar UI
│   ├── tree.ts          # D3 tree renderer
│   ├── tooltip.ts       # Tooltip rendering
│   ├── utils.ts         # Utility functions
│   ├── types.ts         # TypeScript type definitions
│   └── styles.css       # Styles
├── R/
│   └── export_tree.R    # rpart → JSON exporter
├── public/
│   └── data/            # JSON tree files and manifest
├── docs/
│   ├── typescript-for-r-users.md      # TypeScript primer for R contributors
│   └── typescript-for-python-users.md # TypeScript primer for Python contributors
├── example_data/        # Sample rpart models (.rds)
└── index.html
```

## JSON Schema

`arborview_export()` writes a single JSON file per model. Here is what each part of that file contains.

### Top-level fields

| Field | Type | Description |
|---|---|---|
| `schema` | string | Always `"arborview/tree@1"`. Used to detect version mismatches. |
| `title` | string | Human-readable label shown in the dataset dropdown. |
| `method` | string | rpart method string: `"class"` (classification) or `"anova"` (regression). |
| `response.type` | string | `"classification"` or `"regression"`. |
| `response.levels` | string array or null | Ordered class labels for classification trees; `null` for regression. Index `i` in this array corresponds to index `i` in each node's `class_counts` and `class_probs`. |
| `variables.predictors` | string array | Names of all predictor variables from the model formula. |
| `variables.importance` | object | Variable importance scores from rpart (higher = more important). Keys are predictor names; values are raw importance scores. |
| `cptable` | array or absent | One row per tree size evaluated during cross-validation. Each row has `CP`, `nsplit`, `rel_error`, `xerror`, `xstd`. Useful for plotting the bias-variance tradeoff and choosing a pruning level. |
| `call` | string | The original R call that produced the model, e.g. `"rpart(y ~ x1 + x2)"`. |
| `tree` | object | Root node of the tree. Children are nested recursively (see below). |

### Node fields

Every node — whether a leaf or an internal split — has these fields:

| Field | Type | Description |
|---|---|---|
| `node_id` | integer | rpart's integer node ID. Root = 1; left child of node `k` = `2k`; right child = `2k+1`. |
| `depth` | integer | Distance from root (root = 0, root's children = 1, …). |
| `n` | integer | Number of training observations that reached this node. |
| `weight` | number | Sum of case weights at this node. Equals `n` when no case weights were used. |
| `deviance` | number | Total deviance at this node (impurity × n). For classification: weighted Gini × n. For regression: residual sum of squares. |
| `complexity` | number | Cost-complexity parameter (alpha) at which this node would be pruned. Smaller = more stable split. |
| `is_leaf` | boolean | `true` for terminal leaves, `false` for internal split nodes. |
| `impurity` | number | Per-observation impurity. Classification: Gini index (1 − Σpᵢ²). Regression: MSE (deviance / n). |
| `rule_from_root` | string array | Plain-English decision rules from the root down to (but not including) this node. Empty for the root itself. Example: `["age < 12.5", "income >= 50000"]`. |

**Classification-only fields** (present when `response.type == "classification"`):

| Field | Type | Description |
|---|---|---|
| `predicted_class` | string | Majority-class label at this node. |
| `class_counts` | integer array | Raw observation counts per class. Order matches `response.levels`. |
| `class_probs` | number array | Proportion of observations per class. Order matches `response.levels`. Sums to 1. |
| `node_prob` | number | Fraction of the entire training set that reached this node. |

**Regression-only fields** (present when `response.type == "regression"`):

| Field | Type | Description |
|---|---|---|
| `predicted_value` | number | Mean response value for observations at this node. |

**Internal-node-only fields** (present when `is_leaf == false`):

| Field | Type | Description |
|---|---|---|
| `split_var` | string | Name of the predictor variable used to split at this node. |
| `split` | object | The split condition (see below). |
| `children` | array | Two-element array: `[left_child, right_child]`, each a full node object. |

### Split objects

A numeric split (e.g. `age < 12.5`):

```json
{
  "type": "numeric",
  "threshold": 12.5,
  "left_op": "<",
  "right_op": ">="
}
```

A categorical split (e.g. `region ∈ {West, South}`):

```json
{
  "type": "categorical",
  "left_levels": ["West", "South"],
  "right_levels": ["East", "Midwest"]
}
```

`left_levels` and `right_levels` are the factor levels routed to each child. Levels absent from both sets were `NA` in the training data.

### Manifest

`public/data/manifest.json` is a simple index of available datasets:

```json
{
  "datasets": [
    { "id": "my_model", "label": "My Model", "file": "my_model.json" }
  ]
}
```

`file` is the filename relative to `public/data/`.

## License

MIT — Copyright 2026 Joseph Kasprzyk, Zach Carpenter, Edith Zagona
