# Contributing to ArborView

The team is primarily R users. Most contribution tasks — adding new models, tweaking what gets exported, adjusting display titles — happen entirely in R. The TypeScript side rarely needs to be touched.

---

## How the pieces fit together

```
R session
  └─ rpart model (fit object or .rds file)
       └─ R/export_tree.R  ──►  public/data/<name>.json
                                      │
                           public/data/manifest.json  (tells the app which files exist)
                                      │
                                   Browser
                              (reads the JSON, draws the tree)
```

The browser never talks to R. Your job on the R side is to produce JSON files and register them in the manifest. The browser handles everything from there.

---

## Prerequisites

**R side** (most contributors only need this):
- R 4.x
- `rpart`, `jsonlite` (`install.packages(c("rpart", "jsonlite"))`)

**JavaScript side** (only needed to run the app locally or make UI changes):
- Node.js 18+ and npm (download from nodejs.org)

---

## Adding a new model

This is the most common task and requires only R.

### Step 1 — Fit your model

ArborView supports `method = "class"` (classification) and `method = "anova"` (regression). Other rpart methods will produce an error on export.

```r
library(rpart)

fit <- rpart(Response ~ ., data = my_data, method = "class")

# Optionally prune before exporting
fit <- prune(fit, cp = 0.01)
```

### Step 2 — Export to JSON

```r
source("R/export_tree.R")

arborview_export(fit, "public/data/my_model.json", title = "My Model Name")
```

`arborview_export()` arguments:

| Argument | Default | Notes |
|---|---|---|
| `fit` | required | An `rpart` object |
| `path` | required | Output path; directory is created automatically |
| `title` | `deparse(fit$call)` | Label shown in the dataset dropdown |
| `pretty` | `TRUE` | Pretty-print JSON; set to `FALSE` for smaller files |

If you only want to inspect the JSON without writing a file, omit `path`:

```r
cat(arborview_export(fit))
```

If you have a saved model file:

```bash
Rscript R/export_tree.R path/to/fit.rds public/data/my_model.json "My Model Name"
```

### Step 3 — Register it in the manifest

Open `public/data/manifest.json` and add an entry to the `datasets` array:

```json
{
  "datasets": [
    { "id": "my_model", "label": "My Model Name", "file": "my_model.json" },
    { "id": "eowy5",    "label": "SE Oct2025 CART — EOWY5 (classification)", "file": "EOWY5_classification.json" }
  ]
}
```

- `id` — short identifier, no spaces (used internally, not shown to users)
- `label` — what appears in the dropdown
- `file` — filename relative to `public/data/`

The first entry in the array is loaded when the page opens.

---

## What gets exported

The JSON produced by `arborview_export()` contains everything the visualiser needs:

- **Tree structure** — all nodes, nested recursively. Each node carries:
  - Sample count (`n`), deviance, impurity, complexity
  - For classification: predicted class, per-class counts and probabilities, Gini index
  - For regression: predicted mean value, MSE
  - For internal nodes: the split variable and threshold (or category set for factors)
  - For every node: the full decision path from root as plain-English rules, so the sidebar can display it without re-parsing the tree
- **Variable importance** — from `fit$variable.importance`, displayed as a bar chart
- **CP table** — the cross-validation error table from `fit$cptable` (exported but not yet visualised in the UI)
- **Metadata** — model title, rpart method, class levels, original R call

The format is documented field-by-field in `src/types.ts` if you want the full picture.

---

## Viewing the app locally

If you want to see your changes in the browser:

```bash
npm install     # first time only
npm run dev     # opens at http://localhost:5173
```

The page reloads automatically when you edit JSON files in `public/data/` or update `manifest.json`. You do not need to restart the server.

---

## The TypeScript side (reference only)

You should not need to touch any of these files for routine model-adding work. This section is here in case something needs to change.

| File | What it does |
|---|---|
| `src/main.ts` | Loads the manifest and datasets; drives the sidebar panels |
| `src/tree.ts` | Draws the SVG tree using D3 |
| `src/tooltip.ts` | Builds the hover tooltip |
| `src/types.ts` | Mirrors the JSON schema as TypeScript types — update this if you add fields to the R exporter |
| `src/utils.ts` | Number formatting and HTML escaping |

If you add a new field in `export_tree.R` and want the UI to display it, the change touches two places: `src/types.ts` (add the field to the type definition) and whichever of the above files renders the relevant panel.

### Building for production

```bash
npm run build     # outputs a self-contained static site to dist/
npm run preview   # serve dist/ locally to verify before deploying
```

Drop the `dist/` folder on any static host (S3, GitHub Pages, an internal web server).

---

## Known limitations

- **rpart only.** The exporter does not support other tree packages (`randomForest`, `xgboost`, `ranger`, etc.).
- **Binary trees only.** rpart always produces binary splits; the renderer assumes exactly two children per internal node.
- **No pruning UI.** The CP table is included in the JSON but not yet visualised — a future panel could show the cross-validation error curve.
- **No search or filter.** For very deep trees, navigation is purely manual zoom and pan.
