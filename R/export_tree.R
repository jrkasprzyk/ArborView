# ArborView: rpart -> hierarchical JSON exporter
#
# Converts an rpart CART model into the JSON format expected by the
# ArborView web visualiser.  Each node in the output carries:
#   - Basic statistics (n, weight, deviance, impurity)
#   - Classification: predicted class, per-class counts + probabilities, Gini
#   - Regression:     predicted value, MSE
#   - Internal nodes: the split variable + threshold or category set
#   - Every node: rule_from_root — a plain-English breadcrumb from the root
#     down to that node, so the visualiser can show the decision path without
#     re-parsing the tree structure.
#
# Supported rpart methods: "class" (classification), "anova" (regression).
# Other methods (poisson, exp, user) are rejected with a clear error.
#
# Usage (interactive R session):
#   source("R/export_tree.R")
#   fit <- rpart(Class ~ ., data = cart_df)
#   arborview_export(fit, "public/data/my_tree.json", title = "My CART")
#
# Usage (command line):
#   Rscript R/export_tree.R path/to/fit.rds path/to/out.json [title]

suppressPackageStartupMessages({
  library(rpart)
  library(jsonlite)
})

# Null-coalescing operator: `a %||% b` returns b if a is NULL, else a.
`%||%` <- function(a, b) if (is.null(a)) b else a

# ---------------------------------------------------------------------------
# Main export function
# ---------------------------------------------------------------------------

arborview_export <- function(fit, path = NULL, title = NULL, pretty = TRUE) {

  # Validate input: must be an rpart object.
  stopifnot(inherits(fit, "rpart"))

  method  <- fit$method

  # Only "class" and "anova" are supported; anything else (poisson, exp, …)
  # would silently produce wrong statistics so we stop early.
  if (!method %in% c("class", "anova")) {
    stop(sprintf(
      "arborview_export: unsupported rpart method '%s'. Only 'class' and 'anova' are supported.",
      method
    ))
  }

  frame   <- fit$frame       # data frame with one row per node
  splits  <- fit$splits      # matrix with one row per split (primary + competitors + surrogates)
  ylevels <- attr(fit, "ylevels")  # class labels for classification trees

  node_ids <- as.integer(row.names(frame))  # rpart node IDs (root = 1, children = 2*k and 2*k+1)

  # -------------------------------------------------------------------------
  # Build a lookup: for each internal node, which row of `splits` holds its
  # PRIMARY split?
  #
  # Background: rpart stores splits in a flat matrix where each internal node
  # occupies (1 + ncompete + nsurrogate) consecutive rows:
  #   row 1            → primary split (the one actually used)
  #   rows 2..1+ncomp  → competitor splits (next-best alternatives)
  #   remaining rows   → surrogate splits (used when the primary variable is NA)
  # We only need the primary split, so we advance a cursor through the matrix
  # tracking each node's starting row.
  # -------------------------------------------------------------------------
  split_starts <- integer(nrow(frame))
  cursor <- 1L
  for (i in seq_len(nrow(frame))) {
    if (as.character(frame$var[i]) == "<leaf>") {
      split_starts[i] <- 0L  # leaf nodes have no split
    } else {
      split_starts[i] <- cursor
      # Advance past this node's primary + competitor + surrogate rows.
      cursor <- cursor + 1L + frame$ncompete[i] + frame$nsurrogate[i]
    }
  }

  # -------------------------------------------------------------------------
  # decode_split: convert one row of the splits matrix into a typed list
  #
  # rpart's `ncat` field encodes the split direction:
  #   ncat == -1  → numeric split, left branch goes to observations < threshold
  #   ncat ==  1  → numeric split, left branch goes to observations >= threshold
  #                 (this is the less common "right-leaning" variant)
  #   ncat >  1   → categorical split; `index` is a row into fit$csplit where
  #                 1 = goes left, 3 = goes right, 2 = missing/not applicable
  # -------------------------------------------------------------------------
  decode_split <- function(row_idx, var_name) {
    sp   <- splits[row_idx, ]
    ncat <- as.integer(sp[["ncat"]])

    if (ncat == -1L) {
      # Standard numeric split: left child gets observations where var < threshold.
      list(type      = "numeric",
           threshold = unname(sp[["index"]]),
           left_op   = "<",
           right_op  = ">=")

    } else if (ncat == 1L) {
      # Inverted numeric split: left child gets observations where var >= threshold.
      list(type      = "numeric",
           threshold = unname(sp[["index"]]),
           left_op   = ">=",
           right_op  = "<")

    } else if (ncat > 1L) {
      # Categorical split.
      # sp[["index"]] is the row number in fit$csplit.
      # fit$csplit has one column per factor level; value 1 = left, 3 = right.
      csplit_row   <- fit$csplit[sp[["index"]], seq_len(ncat)]
      levels_vec   <- attr(fit, "xlevels")[[var_name]]
      left_levels  <- levels_vec[csplit_row == 1L]
      right_levels <- levels_vec[csplit_row == 3L]
      list(type         = "categorical",
           left_levels  = as.list(left_levels),
           right_levels = as.list(right_levels))

    } else {
      stop(sprintf("arborview_export: unsupported ncat=%d on split for variable '%s'", ncat, var_name))
    }
  }

  # -------------------------------------------------------------------------
  # build_info: extract statistics for one node (one row of frame)
  #
  # frame$yval2 is a matrix with a different layout for classification vs
  # regression:
  #
  #   Classification row layout (with K classes):
  #     column 1         → predicted class index (1-based into ylevels)
  #     columns 2..K+1   → raw observation counts per class
  #     columns K+2..2K+1 → proportion of observations per class (sums to 1)
  #     column 2K+2      → node probability = n / n_root
  #
  #   Regression: yval2 is just a single-column matrix equal to yval (mean y).
  # -------------------------------------------------------------------------
  build_info <- function(i) {
    row     <- frame[i, ]
    nid     <- node_ids[i]
    is_leaf <- as.character(row$var) == "<leaf>"

    info <- list(
      node_id    = nid,
      depth      = floor(log2(nid)),  # rpart node numbering: depth of node k = floor(log2(k))
      n          = unname(row$n),
      weight     = unname(row$wt),
      deviance   = unname(row$dev),
      complexity = unname(row$complexity),
      is_leaf    = is_leaf
    )

    if (method == "class") {
      yv     <- as.numeric(frame$yval2[i, ])
      nclass <- (length(yv) - 2L) / 2L  # solve: total columns = 1 + K + K + 1 = 2K+2
      counts <- as.integer(yv[2L:(1L + nclass)])
      probs  <- yv[(2L + nclass):(1L + 2L * nclass)]
      info$predicted_class <- ylevels[as.integer(yv[1L])]
      info$class_counts    <- as.list(counts)
      info$class_probs     <- as.list(round(probs, 6))
      info$node_prob       <- round(yv[2L + 2L * nclass], 6)
      # Gini impurity = 1 - sum(p_i^2).  Ranges from 0 (pure) to (K-1)/K (maximally mixed).
      info$impurity        <- round(1 - sum(probs * probs), 6)

    } else {
      # Regression (anova): predicted value is the mean response at this node.
      # Impurity is MSE = deviance / n  (deviance = residual sum of squares).
      info$predicted_value <- unname(row$yval)
      info$impurity        <- unname(round(row$dev / row$n, 6))
    }

    if (!is_leaf) {
      info$split_var <- as.character(row$var)
      info$split     <- decode_split(split_starts[i], info$split_var)
    }

    info
  }

  # Build a named list of node info objects keyed by node ID string.
  node_infos <- lapply(seq_len(nrow(frame)), build_info)
  names(node_infos) <- as.character(node_ids)

  # -------------------------------------------------------------------------
  # walk: recursively build the nested tree structure
  #
  # rpart uses a "binary heap" numbering scheme: the left child of node k is
  # node 2k, and the right child is 2k+1.  We start from the root (node 1)
  # and recurse until we hit leaves.
  #
  # rule_stack accumulates the plain-English rules from the root to the current
  # node.  Each call appends one rule for the edge leading into the current node.
  # -------------------------------------------------------------------------
  walk <- function(nid, rule_stack) {
    info <- node_infos[[as.character(nid)]]
    info$rule_from_root <- as.list(rule_stack)

    if (!info$is_leaf) {
      sp <- info$split

      # Format the threshold for display (4 significant figures).
      if (sp$type == "numeric") {
        thr        <- formatC(sp$threshold, digits = 4, format = "g")
        left_rule  <- sprintf("%s %s %s", info$split_var, sp$left_op,  thr)
        right_rule <- sprintf("%s %s %s", info$split_var, sp$right_op, thr)
      } else {
        left_rule  <- sprintf("%s ∈ {%s}", info$split_var,
                              paste(unlist(sp$left_levels),  collapse = ", "))
        right_rule <- sprintf("%s ∈ {%s}", info$split_var,
                              paste(unlist(sp$right_levels), collapse = ", "))
      }

      # Recurse into left child (2*nid) and right child (2*nid+1).
      info$children <- list(
        walk(2L * nid,      c(rule_stack, left_rule)),
        walk(2L * nid + 1L, c(rule_stack, right_rule))
      )
    }

    info
  }

  tree <- walk(1L, character(0))  # start from root with an empty rule stack

  # -------------------------------------------------------------------------
  # Variable importance
  # -------------------------------------------------------------------------
  # rpart accumulates importance for each variable across all splits where it
  # appeared as primary or surrogate.  Higher = more important.
  importance <- if (length(fit$variable.importance) > 0L) {
    as.list(fit$variable.importance)
  } else {
    list()
  }

  # -------------------------------------------------------------------------
  # CP table (complexity parameter table)
  # -------------------------------------------------------------------------
  # The CP table has one row per tree size tried during cross-validation.
  # Columns: CP, nsplit, rel_error, xerror, xstd.
  # Keeping this allows tools to plot the bias-variance tradeoff curve later.
  cptable <- if (!is.null(fit$cptable)) {
    as.data.frame(fit$cptable)
  } else {
    NULL
  }

  # -------------------------------------------------------------------------
  # Assemble and serialise
  # -------------------------------------------------------------------------
  out <- list(
    schema = "arborview/tree@1",  # version tag — bump if the schema changes
    title  = title %||% deparse(fit$call)[1],
    method = method,
    response = list(
      type   = if (method == "class") "classification" else "regression",
      levels = if (method == "class") as.list(ylevels) else NULL
    ),
    variables = list(
      predictors = as.list(attr(fit$terms, "term.labels")),
      importance = importance
    ),
    cptable = cptable,
    call    = deparse(fit$call),
    tree    = tree
  )

  # digits = 6 gives enough precision for most CART statistics while keeping
  # file sizes reasonable.  Use digits = NA for full double precision if needed.
  json <- jsonlite::toJSON(out, auto_unbox = TRUE, null = "null",
                           na = "null", pretty = pretty, digits = 6)

  if (!is.null(path)) {
    # Create the output directory if it does not exist yet.
    dir.create(dirname(path), showWarnings = FALSE, recursive = TRUE)
    writeLines(json, path, useBytes = TRUE)
    invisible(path)
  } else {
    json
  }
}

# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------
# This block only runs when the script is executed via `Rscript`, not when
# it is source()'d inside an interactive R session.
if (!interactive() && sys.nframe() == 0L) {
  args <- commandArgs(trailingOnly = TRUE)

  if (length(args) < 2L) {
    cat("Usage: Rscript R/export_tree.R <in.rds> <out.json> [title]\n")
    quit(status = 1L)
  }

  rds_path <- args[[1]]
  if (!file.exists(rds_path)) {
    cat(sprintf("Error: input file not found: %s\n", rds_path))
    quit(status = 1L)
  }

  fit <- tryCatch(
    readRDS(rds_path),
    error = function(e) {
      cat(sprintf("Error reading RDS file '%s': %s\n", rds_path, conditionMessage(e)))
      quit(status = 1L)
    }
  )

  title <- if (length(args) >= 3L) args[[3]] else NULL
  arborview_export(fit, args[[2]], title = title)
  message(sprintf("Wrote %s", args[[2]]))
}
