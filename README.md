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
- Model performance panel with confusion matrix and classification statistics (accuracy, kappa, sensitivity, specificity, PPV/NPV, balanced accuracy); hover any metric label for a plain-English definition
- Failure Definition overlay — per-dataset description of what "Failure" means in context, shown on the tree canvas
- Semantic class colours — `Success` and `Failure` labels mapped to distinct CSS variables for tree nodes and confusion matrix (see [Class colours](#class-colours))
- Support for both classification (Gini) and regression (MSE) trees
- Dataset selector for comparing multiple models

## Requirements

- **Node.js** (v18+) and npm
- **R** with packages: `rpart`, `jsonlite`, `partykit`

## Installing Node.js and npm

npm is bundled with Node.js. Install Node.js (v18+) for your platform:

### Mac

```bash
brew install node
```

If Homebrew is not installed, get it at https://brew.sh first. Alternatively, download the macOS installer directly from https://nodejs.org.

### Windows (Command Prompt)

```cmd
winget install OpenJS.NodeJS
```

Then close and reopen Command Prompt so `node` and `npm` are on your PATH. Alternatively, download the Windows installer from https://nodejs.org and run it.

### Windows (PowerShell)

```powershell
winget install OpenJS.NodeJS
```

Then close and reopen PowerShell so `node` and `npm` are on your PATH. Alternatively, download the Windows installer from https://nodejs.org and run it.

Verify the install on any platform:

```bash
node --version
npm --version
```

## Adding Rscript to PATH

`Rscript` is installed with R and is needed when exporting a model from the command line. Verify that it is already available:

```bash
Rscript --version
```

If that command is not found, add the directory containing `Rscript.exe` to your PATH. On Windows, it is usually in a versioned R install directory such as:

```text
C:\Program Files\R\R-4.x.x\bin
```

If you are not sure which version is installed, locate it from PowerShell:

```powershell
Get-ChildItem "C:\Program Files\R" -Recurse -Filter Rscript.exe
```

Then add the `bin` directory to your user PATH:

1. Open Start and search for **Edit environment variables for your account**.
2. Select **Environment Variables**, then under **User variables** select `Path` and choose **Edit**.
3. Choose **New** and add the R `bin` directory, for example `C:\Program Files\R\R-4.x.x\bin`.
4. Select **OK** to save, then close and reopen your terminal.

Verify the update:

```powershell
Rscript --version
```

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

### 1b. Add model performance (optional)

If you have a `caret::confusionMatrix()` performance report saved as a `.txt` file, patch it into the exported JSON:

```bash
Rscript R/add_performance.R path/to/performance.txt public/data/my_model.json
```

This adds a `performance` field to the JSON in place. The model performance panel in the sidebar will then show the confusion matrix and classification statistics. Datasets without a performance file simply show a placeholder message.

### 1c. Add a failure definition (optional)

Provide a plain-English sentence explaining what "Failure" means for this model. It appears in the overlay panel in the upper-left corner of the tree canvas.

```bash
Rscript R/add_failure_definition.R public/data/my_model.json "A trace is considered a failure if Powell falls below 3500 ft at any point up to end of water year 5."
```

To clear the definition later, pass an empty string:

```bash
Rscript R/add_failure_definition.R public/data/my_model.json ""
```

> **Note (Windows/PowerShell):** PowerShell does not treat `\` as a line-continuation character. Keep the command on a single line, or use a backtick `` ` `` to continue across lines.

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
│   ├── export_tree.R            # rpart → JSON exporter
│   ├── add_performance.R        # patches caret confusionMatrix output into exported JSON
│   └── add_failure_definition.R # sets/clears the failure_definition field in exported JSON
├── public/
│   ├── about.md         # About tab content (replace with your own Markdown)
│   └── data/            # JSON tree files and manifest
├── docs/
│   ├── typescript-for-r-users.md      # TypeScript primer for R contributors
│   └── typescript-for-python-users.md # TypeScript primer for Python contributors
├── example_data/        # Sample rpart models (.rds)
└── index.html
```

## Customization

### Class colours

Four CSS custom properties at the top of `src/styles.css` are the single source of truth for semantic/class-related colours in the app: tree node classes, probability bars, and confusion-matrix correctness/error states. They are split into two independent systems that encode different things:

| Variable | Default | Encodes | Used in |
|---|---|---|---|
| `--node-success` | `#1d6fa4` | "Success" class label (domain meaning) | Tree nodes, probability bars |
| `--node-failure` | `#b45309` | "Failure" class label (domain meaning) | Tree nodes, probability bars |
| `--cm-correct` | `#2f855a` | Correct prediction (model accuracy) | Confusion matrix diagonal cells |
| `--cm-error` | `#b03a2e` | Incorrect prediction (model accuracy) | Confusion matrix off-diagonal cells |

**Why two color systems?** Any leaf node can contain a mix of correctly and incorrectly classified observations, meaning that the same color system cannot represent both modeled classification and model accuracy. The node coloring represents the dominant class label in the node (model predictions), and the confusion matrix color represents whether or not the model predictions were correct."

The mapping from class name to CSS variable lives in `src/utils.ts` (`semanticColors()`). Add entries there to assign node colours to additional class names.

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
| `performance` | object or absent | Whole-tree classification statistics from `caret::confusionMatrix()`, added by `R/add_performance.R`. See below. |
| `failure_definition` | string or absent | Plain-English sentence describing what "Failure" means in this model, shown in the canvas overlay. Added by `R/add_failure_definition.R`. |

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

### Performance object

Present only when `R/add_performance.R` has been run. Parsed from `caret::confusionMatrix()` text output.

| Field | Type | Description |
|---|---|---|
| `positive_class` | string | The class designated as "positive" by caret. |
| `confusion_matrix.labels` | string array | Class labels; order matches `matrix` rows and columns. |
| `confusion_matrix.matrix` | number[][] | Confusion matrix where `matrix[i][j]` = count predicted as `labels[i]`, true class `labels[j]`. Rows = predicted, columns = reference. |
| `accuracy` | number | Overall fraction of correct predictions. |
| `accuracy_ci` | [number, number] | 95% confidence interval for accuracy. |
| `kappa` | number | Cohen's kappa — agreement above chance. |
| `no_information_rate` | number | Accuracy achieved by always predicting the majority class. |
| `sensitivity` | number | True positive rate for the positive class. |
| `specificity` | number | True negative rate for the positive class. |
| `ppv` | number | Positive predictive value (precision). |
| `npv` | number | Negative predictive value. |
| `prevalence` | number | Fraction of the test set belonging to the positive class. |
| `detection_rate` | number | Fraction of the test set correctly identified as the positive class. |
| `detection_prevalence` | number | Fraction of the test set predicted as the positive class. |
| `balanced_accuracy` | number | Average of sensitivity and specificity. |

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
