# ArborView

Interactive web visualization for CART decision trees built with R's `rpart`. Export an rpart model to JSON, then explore its structure, node statistics, variable importance, and performance in the browser — rendered with D3.js.

**Live demo:** https://arborview-delta.vercel.app/

## What it does

- Interactive D3 tree: pan, zoom, drag nodes, hover for tooltips
- Decision-path breadcrumb from root to any node
- Node detail: impurity, complexity, deviance, class probabilities
- Variable-importance chart
- Model-performance panel: confusion matrix + classification statistics
- Failure-definition overlay for domain context
- Classification (Gini) and regression (MSE) trees
- Dataset selector for comparing multiple models

## Quick start

Requires **Node.js 18+** (with npm). R is only needed to export your *own* models — the repo ships with sample datasets you can explore immediately.

```bash
npm install
npm run dev
```

Open the URL Vite prints (typically `http://localhost:5173`) and pick a dataset from the header dropdown.

New here? Start with the [tutorial](docs/tutorial.md).

## Documentation

Documentation follows the [Diátaxis](https://diataxis.fr/) framework — four kinds, each with one job:

| Guide | Read it when you want to… |
|---|---|
| [Tutorial](docs/tutorial.md) | Learn the app from zero by running it and exploring a tree. |
| [How-to guides](docs/how-to/README.md) | Solve a specific task: export a model, add performance, recolor classes, register a dataset. |
| [Reference](docs/reference.md) | Look up exact details: JSON schema, R script arguments, npm scripts, CSS variables. |
| [Explanation](docs/explanation.md) | Understand the concepts: CART, impurity, the two colour systems, the export-to-D3 architecture. |

Contributors coming from R or Python also have language primers:
[TypeScript for R users](docs/typescript-for-r-users.md) ·
[TypeScript for Python users](docs/typescript-for-python-users.md).

## License

MIT — Copyright 2026 Joseph Kasprzyk, Zach Carpenter, Edith Zagona
