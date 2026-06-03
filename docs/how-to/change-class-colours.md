# How to change the class colours

**Goal:** recolor the `Success` and `Failure` classes, or assign colours to additional class names.

ArborView keeps all semantic colours in two places: CSS variables for the values, and one mapping function for which class uses which variable.

## Change an existing colour

Edit the CSS custom properties at the top of `src/styles.css`:

| Variable | Default | Controls |
|---|---|---|
| `--node-success` | `#1d6fa4` | "Success" tree nodes and probability bars |
| `--node-failure` | `#b45309` | "Failure" tree nodes and probability bars |
| `--cm-correct` | `#2f855a` | Confusion-matrix correct (diagonal) cells |
| `--cm-error` | `#b03a2e` | Confusion-matrix error (off-diagonal) cells |

Change a value, save, and the browser updates on reload. Note that `--node-*` encode the *class label* while `--cm-*` encode *prediction correctness* — they are deliberately separate systems (see the [explanation](../explanation.md#why-two-colour-systems)).

## Add a colour for a new class name

The mapping from class name to CSS variable lives in `semanticColors()` in `src/utils.ts`:

```ts
_semanticCache = {
  Success: s.getPropertyValue("--node-success").trim(),
  Failure: s.getPropertyValue("--node-failure").trim(),
};
```

1. Add a new CSS variable in `src/styles.css`, e.g. `--node-marginal: #...;`.
2. Add a matching entry in `semanticColors()`, e.g. `Marginal: s.getPropertyValue("--node-marginal").trim()`.

Class names with no entry fall back to D3's Tableau10 palette, so this step is only needed when you want a specific, meaningful colour.
