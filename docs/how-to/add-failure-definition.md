# How to add (or clear) a failure definition

**Goal:** give readers a plain-English sentence explaining what "Failure" means for a model. It appears in the overlay panel in the upper-left corner of the tree canvas, grounding how people interpret node colours and predictions.

**Before you start:** the dataset's exported JSON must already exist in `public/data/`.

## Set the definition

Run from the repository root. The JSON path comes **first**, the sentence second:

```bash
Rscript R/add_failure_definition.R public/data/my_model.json "A trace is considered a failure if Powell falls below 3500 ft at any point up to end of water year 5."
```

This sets the top-level `failure_definition` field in place. Reload the browser to see it in the overlay.

## Clear the definition

Pass an empty string to remove the field:

```bash
Rscript R/add_failure_definition.R public/data/my_model.json ""
```

## Windows / PowerShell note

PowerShell does not treat `\` as a line-continuation character. Keep the whole command on one line, or use a backtick `` ` `` to continue across lines. Wrap the sentence in double quotes so spaces are preserved.
