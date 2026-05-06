# add_failure_definition.R
# Patches a plain-English failure definition sentence into an existing
# ArborView JSON file as a top-level `failure_definition` field.
#
# Usage:
#   Rscript R/add_failure_definition.R <tree.json> "<sentence>"
#
# Example:
#   Rscript R/add_failure_definition.R public/data/EOWY1_classification.json \
#     "A tree is classified as Failure when its end-of-water-year basal area falls below the restoration target."
#
# To clear the definition, pass an empty string:
#   Rscript R/add_failure_definition.R public/data/EOWY1_classification.json ""

suppressPackageStartupMessages(library(jsonlite))

if (!interactive() && sys.nframe() == 0L) {
  args <- commandArgs(trailingOnly = TRUE)

  if (length(args) < 2L) {
    cat("Usage: Rscript R/add_failure_definition.R <tree.json> \"<sentence>\"\n")
    quit(status = 1L)
  }

  json_path  <- args[[1]]
  definition <- args[[2]]

  if (!file.exists(json_path)) {
    cat(sprintf("Error: file not found: %s\n", json_path))
    quit(status = 1L)
  }

  tree_json <- jsonlite::read_json(json_path)

  if (nchar(trimws(definition)) == 0L) {
    tree_json$failure_definition <- NULL
    message(sprintf("Cleared failure_definition from %s", json_path))
  } else {
    tree_json$failure_definition <- definition
    message(sprintf("Set failure_definition in %s", json_path))
  }

  out <- jsonlite::toJSON(tree_json, auto_unbox = TRUE, null = "null",
                          na = "null", pretty = TRUE, digits = 6)
  writeLines(out, json_path, useBytes = TRUE)
}
