# How to replace the About page

**Goal:** customize the in-app About tab with content specific to your model — your response variable, predictor definitions, data source, and any interpretation notes.

## Steps

1. Open `public/about.md`.
2. Replace its contents with your own Markdown. The file is rendered directly into the About tab.
3. Reload the browser to see your changes.

## What to include

The default About page is written generically. The most useful additions for your readers are:

- **What "Failure" / each class means** in your domain.
- **Predictor definitions** — the tree shows variable names only; readers need a key.
- **Data source and date** so the model's provenance is clear.
- Any caveats about how far the tree should be trusted.

Standard Markdown works: headings, tables, lists, links, and emphasis all render. Keep it focused — the About tab is for orientation, not a full report.
