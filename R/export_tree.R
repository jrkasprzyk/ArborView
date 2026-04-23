# ArborView: rpart -> hierarchical JSON exporter
#
# Produces a JSON file shaped for the ArborView web visualizer. Each internal
# node carries its split variable, threshold, class counts / probabilities (for
# classification) or predicted value + deviance (for regression), along with
# root-to-node rule text so the viz can render breadcrumbs without reparsing.
#
# Usage (interactive):
#   source("R/export_tree.R")
#   fit <- rpart(Class ~ ., data = cart_df)
#   arborview_export(fit, "public/data/my_tree.json", title = "My CART")
#
# Usage (CLI):
#   Rscript R/export_tree.R path/to/fit.rds path/to/out.json [title]

suppressPackageStartupMessages({
  library(rpart)
  library(jsonlite)
})

arborview_export <- function(fit, path = NULL, title = NULL, pretty = TRUE) {
  stopifnot(inherits(fit, "rpart"))

  method  <- fit$method
  frame   <- fit$frame
  splits  <- fit$splits
  ylevels <- attr(fit, "ylevels")

  node_ids <- as.integer(row.names(frame))

  # rpart stores (1 primary + ncompete + nsurrogate) rows in `splits` for each
  # internal node, in frame order. Record the row index of each node's primary.
  split_starts <- integer(nrow(frame))
  cursor <- 1L
  for (i in seq_len(nrow(frame))) {
    if (as.character(frame$var[i]) == "<leaf>") {
      split_starts[i] <- 0L
    } else {
      split_starts[i] <- cursor
      cursor <- cursor + 1L + frame$ncompete[i] + frame$nsurrogate[i]
    }
  }

  decode_split <- function(row_idx, var_name) {
    sp   <- splits[row_idx, ]
    ncat <- as.integer(sp[["ncat"]])
    if (ncat == -1L) {
      list(type = "numeric", threshold = unname(sp[["index"]]),
           left_op = "<", right_op = ">=")
    } else if (ncat == 1L) {
      list(type = "numeric", threshold = unname(sp[["index"]]),
           left_op = ">=", right_op = "<")
    } else if (ncat > 1L) {
      csplit_row   <- fit$csplit[sp[["index"]], seq_len(ncat)]
      levels_vec   <- attr(fit, "xlevels")[[var_name]]
      left_levels  <- levels_vec[csplit_row == 1L]
      right_levels <- levels_vec[csplit_row == 3L]
      list(type = "categorical",
           left_levels  = as.list(left_levels),
           right_levels = as.list(right_levels))
    } else {
      stop(sprintf("Unsupported ncat=%d on split for %s", ncat, var_name))
    }
  }

  build_info <- function(i) {
    row     <- frame[i, ]
    nid     <- node_ids[i]
    is_leaf <- as.character(row$var) == "<leaf>"

    info <- list(
      node_id    = nid,
      depth      = floor(log2(nid)),
      n          = unname(row$n),
      weight     = unname(row$wt),
      deviance   = unname(row$dev),
      complexity = unname(row$complexity),
      is_leaf    = is_leaf
    )

    if (method == "class") {
      yv     <- as.numeric(frame$yval2[i, ])
      nclass <- (length(yv) - 2L) / 2L
      counts <- as.integer(yv[2L:(1L + nclass)])
      probs  <- yv[(2L + nclass):(1L + 2L * nclass)]
      info$predicted_class <- ylevels[as.integer(yv[1L])]
      info$class_counts    <- as.list(counts)
      info$class_probs     <- as.list(round(probs, 6))
      info$node_prob       <- round(yv[2L + 2L * nclass], 6)
      info$impurity        <- round(1 - sum(probs * probs), 6)  # Gini
    } else {
      info$predicted_value <- unname(row$yval)
      info$impurity        <- unname(round(row$dev / row$n, 6))  # MSE
    }

    if (!is_leaf) {
      info$split_var <- as.character(row$var)
      info$split     <- decode_split(split_starts[i], info$split_var)
    }
    info
  }

  node_infos <- lapply(seq_len(nrow(frame)), build_info)
  names(node_infos) <- as.character(node_ids)

  walk <- function(nid, rule_stack) {
    info <- node_infos[[as.character(nid)]]
    info$rule_from_root <- as.list(rule_stack)

    if (!info$is_leaf) {
      sp <- info$split
      if (sp$type == "numeric") {
        thr <- formatC(sp$threshold, digits = 4, format = "g")
        left_rule  <- sprintf("%s %s %s", info$split_var, sp$left_op,  thr)
        right_rule <- sprintf("%s %s %s", info$split_var, sp$right_op, thr)
      } else {
        left_rule  <- sprintf("%s ∈ {%s}", info$split_var,
                              paste(unlist(sp$left_levels), collapse = ", "))
        right_rule <- sprintf("%s ∈ {%s}", info$split_var,
                              paste(unlist(sp$right_levels), collapse = ", "))
      }
      info$children <- list(
        walk(2L * nid,      c(rule_stack, left_rule)),
        walk(2L * nid + 1L, c(rule_stack, right_rule))
      )
    }
    info
  }

  tree <- walk(1L, character(0))

  importance <- if (length(fit$variable.importance) > 0L) {
    as.list(fit$variable.importance)
  } else {
    list()
  }

  # cptable is small and useful for showing complexity-vs-error curves later.
  cptable <- if (!is.null(fit$cptable)) {
    as.data.frame(fit$cptable)
  } else {
    NULL
  }

  out <- list(
    schema = "arborview/tree@1",
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

  json <- jsonlite::toJSON(out, auto_unbox = TRUE, null = "null",
                           na = "null", pretty = pretty, digits = 6)

  if (!is.null(path)) {
    dir.create(dirname(path), showWarnings = FALSE, recursive = TRUE)
    writeLines(json, path, useBytes = TRUE)
    invisible(path)
  } else {
    json
  }
}

`%||%` <- function(a, b) if (is.null(a)) b else a

# --- CLI entrypoint ------------------------------------------------------
if (!interactive() && sys.nframe() == 0L) {
  args <- commandArgs(trailingOnly = TRUE)
  if (length(args) < 2L) {
    cat("Usage: Rscript R/export_tree.R <in.rds> <out.json> [title]\n")
    quit(status = 1L)
  }
  fit <- readRDS(args[[1]])
  title <- if (length(args) >= 3L) args[[3]] else NULL
  arborview_export(fit, args[[2]], title = title)
  message(sprintf("Wrote %s", args[[2]]))
}