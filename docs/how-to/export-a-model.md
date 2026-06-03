# How to export an rpart model to JSON

**Goal:** turn a trained `rpart` model into the JSON file ArborView reads.

**Before you start:** install R packages `rpart` and `jsonlite`. Confirm `Rscript` is on your PATH with `Rscript --version` (see the [Reference](../reference.md#adding-rscript-to-path) if it is not found).

ArborView only supports `rpart` method `"class"` (classification) and `"anova"` (regression). Other methods are rejected with an error.

## Option A — from an interactive R session

```r
source("R/export_tree.R")

fit <- rpart::rpart(Class ~ ., data = mydata)
arborview_export(fit, "public/data/my_model.json", title = "My Model")
```

`arborview_export()` creates the output directory if it does not exist and writes a single self-contained JSON file.

## Option B — from the command line

If you already saved the model as an `.rds` file:

```bash
Rscript R/export_tree.R model.rds public/data/my_model.json "My Model"
```

The arguments are, in order: input `.rds`, output `.json`, and an optional title. If you omit the title, ArborView uses the model's R call as a label.

## Next step

The file now exists but the app will not list it until you add it to the manifest. Continue with [Register a dataset](register-a-dataset.md).

## See also

- [JSON schema](../reference.md#json-schema) — every field the export writes.
- [Add a model-performance panel](add-model-performance.md) — optional confusion matrix and statistics.
