# add_performance.R
# Parses a caret confusionMatrix .txt file and patches it into an existing
# ArborView JSON file as a top-level `performance` field.
#
# Usage:
#   Rscript R/add_performance.R <perf.txt> <tree.json>
#
# Example (run once per dataset from repo root):
#   Rscript R/add_performance.R example_data/SE_Oct2025_CART_performance_P3500_EOWY1.txt public/data/EOWY1_classification.json
#   Rscript R/add_performance.R example_data/SE_Oct2025_CART_performance_P3500_EOWY2.txt public/data/EOWY2_classification.json
#   Rscript R/add_performance.R example_data/SE_Oct2025_CART_performance_P3500_EOWY3.txt public/data/EOWY3_classification.json
#   Rscript R/add_performance.R example_data/SE_Oct2025_CART_performance_P3500_EOWY5.txt public/data/EOWY5_classification.json

suppressPackageStartupMessages(library(jsonlite))

parse_num <- function(s) {
  s <- trimws(s)
  if (grepl("^<", s)) return(NA_real_)
  v <- suppressWarnings(as.numeric(s))
  v
}

parse_performance_txt <- function(path) {
  lines <- readLines(path, warn = FALSE)

  # --- Confusion matrix section ---
  # Line pattern:
  #           Reference
  # Prediction Failure Success
  #    Failure      19       4
  #    Success       0     377
  ref_idx    <- grep("^\\s*Reference\\s*$", lines)
  header_idx <- ref_idx + 1
  header     <- trimws(lines[header_idx])

  # Class labels follow the word "Prediction" on the header line
  labels <- strsplit(sub("^Prediction\\s+", "", header), "\\s+")[[1]]
  n      <- length(labels)

  mat <- matrix(0L, nrow = n, ncol = n)
  for (i in seq_len(n)) {
    row_line   <- lines[header_idx + i]
    nums_str   <- sub(paste0("^\\s*", labels[i], "\\s+"), "", row_line)
    mat[i, ]   <- as.integer(strsplit(trimws(nums_str), "\\s+")[[1]])
  }

  # --- Statistics section ---
  # Each stat line looks like:   "               Accuracy : 0.99   "
  stat_pat   <- "^\\s+(.+?)\\s*:\\s*(.+?)\\s*$"
  stat_lines <- grep(stat_pat, lines, value = TRUE)

  stats <- list()
  for (l in stat_lines) {
    m          <- regmatches(l, regexec(stat_pat, l))[[1]]
    stats[[trimws(m[2])]] <- trimws(m[3])
  }

  # Parse 95% CI string "(0.9746, 0.9973)"
  ci_raw <- stats[["95% CI"]]
  ci <- if (!is.null(ci_raw)) {
    as.numeric(regmatches(ci_raw, gregexpr("[0-9.e+-]+", ci_raw))[[1]][1:2])
  } else {
    c(NA_real_, NA_real_)
  }

  list(
    positive_class       = gsub("'", "", trimws(stats[["'Positive' Class"]])),
    confusion_matrix     = list(
      labels = as.list(labels),
      matrix = lapply(seq_len(nrow(mat)), function(i) as.list(mat[i, ]))
    ),
    accuracy             = parse_num(stats[["Accuracy"]]),
    accuracy_ci          = as.list(ci),
    kappa                = parse_num(stats[["Kappa"]]),
    no_information_rate  = parse_num(stats[["No Information Rate"]]),
    sensitivity          = parse_num(stats[["Sensitivity"]]),
    specificity          = parse_num(stats[["Specificity"]]),
    ppv                  = parse_num(stats[["Pos Pred Value"]]),
    npv                  = parse_num(stats[["Neg Pred Value"]]),
    prevalence           = parse_num(stats[["Prevalence"]]),
    detection_rate       = parse_num(stats[["Detection Rate"]]),
    detection_prevalence = parse_num(stats[["Detection Prevalence"]]),
    balanced_accuracy    = parse_num(stats[["Balanced Accuracy"]])
  )
}

# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------
if (!interactive() && sys.nframe() == 0L) {
  args <- commandArgs(trailingOnly = TRUE)

  if (length(args) < 2L) {
    cat("Usage: Rscript R/add_performance.R <perf.txt> <tree.json>\n")
    quit(status = 1L)
  }

  perf_path <- args[[1]]
  json_path <- args[[2]]

  for (p in c(perf_path, json_path)) {
    if (!file.exists(p)) {
      cat(sprintf("Error: file not found: %s\n", p))
      quit(status = 1L)
    }
  }

  perf      <- parse_performance_txt(perf_path)
  tree_json <- jsonlite::read_json(json_path)
  tree_json$performance <- perf

  out <- jsonlite::toJSON(tree_json, auto_unbox = TRUE, null = "null",
                          na = "null", pretty = TRUE, digits = 6)
  writeLines(out, json_path, useBytes = TRUE)
  message(sprintf("Patched performance into %s", json_path))
}
