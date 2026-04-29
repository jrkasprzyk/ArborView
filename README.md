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
├── example_data/        # Sample rpart models (.rds)
└── index.html
```

## License

MIT — Copyright 2026 Joseph Kasprzyk, Zach Carpenter, Edith Zagona
