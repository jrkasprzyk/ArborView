# How to add a model-performance panel

**Goal:** show a confusion matrix and classification statistics (accuracy, kappa, sensitivity, specificity, PPV/NPV, balanced accuracy) in the sidebar for a classification model.

**Before you start:** you need the dataset's exported JSON already in `public/data/`, and a performance report saved as a plain-text file from `caret::confusionMatrix()`.

## Save a performance report from R

```r
library(caret)
report <- confusionMatrix(predictions, reference)
capture.output(report, file = "performance.txt")
```

The parser expects caret's standard layout: a `Reference` line, a `Prediction` header row listing the class labels, the matrix rows, then the statistics block. A file in any other format is rejected with an explanatory error.

## Patch it into the JSON

Run from the repository root. The **performance file comes first**, the tree JSON second:

```bash
Rscript R/add_performance.R path/to/performance.txt public/data/my_model.json
```

This adds a top-level `performance` field to the JSON in place. Reload the browser and the **Model performance** panel will show the matrix and statistics. Hover any metric label for a plain-English definition.

Datasets without a performance file simply show a placeholder message — adding performance is always optional.

## See also

- [Performance object](../reference.md#performance-object) — every field the parser produces.
- [Explanation: the two colour systems](../explanation.md#why-two-colour-systems) — why the confusion matrix uses different colours from the tree nodes.
