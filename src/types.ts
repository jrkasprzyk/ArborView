/**
 * TypeScript type definitions for the ArborView JSON schema.
 *
 * These types mirror exactly what `R/export_tree.R` writes to disk.
 * If you change the R exporter, update these types to match.
 *
 * Quick orientation:
 *   Arbor      – the whole model (metadata + tree)
 *   TreeNode   – one node in the tree (leaf or internal split)
 *   Split      – the split condition stored on an internal node
 *   Manifest   – the index file listing available datasets
 */

// ---------------------------------------------------------------------------
// Splits
// ---------------------------------------------------------------------------

/**
 * A numeric threshold split, e.g. "age < 12.5".
 *
 * left_op / right_op are the operators that send an observation to the
 * left or right child.  rpart always puts the "less-than" branch on the left,
 * so left_op is almost always "<" and right_op is ">=".
 */
export type NumericSplit = {
  type: "numeric";
  threshold: number;
  left_op: "<" | ">=";
  right_op: "<" | ">=";
};

/**
 * A categorical split, e.g. "region ∈ {West, South}".
 *
 * left_levels  – factor levels that go to the left child
 * right_levels – factor levels that go to the right child
 * (levels not appearing in either set are missing / NA)
 */
export type CategoricalSplit = {
  type: "categorical";
  left_levels: string[];
  right_levels: string[];
};

/** Union of the two possible split types. */
export type Split = NumericSplit | CategoricalSplit;

// ---------------------------------------------------------------------------
// Tree nodes
// ---------------------------------------------------------------------------

/**
 * One node in the CART decision tree.
 *
 * Both leaf nodes and internal (split) nodes use this same type.
 * Fields that only make sense for one kind of node are marked optional.
 *
 * Tip: check `is_leaf` first, then safely access leaf-only or
 * internal-only fields.
 */
export type TreeNode = {
  /** rpart's own integer ID.  Root = 1, left child of k = 2k, right = 2k+1. */
  node_id: number;

  /** Distance from root (root = 0, root's children = 1, …). */
  depth: number;

  /** Number of training observations that reached this node. */
  n: number;

  /**
   * Sum of case weights for observations at this node.
   * When no case weights were used in rpart, weight equals n.
   */
  weight: number;

  /**
   * Total deviance (node impurity × n) at this node.
   * For classification: weighted Gini × n.
   * For regression: residual sum of squares.
   */
  deviance: number;

  /**
   * Cost-complexity parameter (alpha) at which this node would be pruned.
   * Smaller = more stable split; larger = this split only paid off with a
   * very lenient pruning budget.
   */
  complexity: number;

  /** True if this node is a terminal leaf (no children). */
  is_leaf: boolean;

  /**
   * Per-observation impurity.
   * Classification: Gini index   = 1 − Σ p_i²
   * Regression:     MSE          = deviance / n
   */
  impurity: number;

  /**
   * Human-readable decision rules from the root down to (but not including)
   * this node.  Empty array for the root itself.
   * Example for a depth-2 node: ["age < 12.5", "income >= 50000"]
   */
  rule_from_root: string[];

  // ---- Classification-only fields ----------------------------------------

  /** Majority-class label at this node (classification only). */
  predicted_class?: string;

  /**
   * Raw count of training observations per class.
   * Order matches `Arbor.response.levels`.
   */
  class_counts?: number[];

  /**
   * Proportion of training observations per class.
   * Order matches `Arbor.response.levels`.  Sums to 1.
   */
  class_probs?: number[];

  /**
   * Fraction of the entire training set that reached this node.
   * Useful for reading "how common is this path?".
   */
  node_prob?: number;

  // ---- Regression-only fields --------------------------------------------

  /** Mean response value for observations at this node (regression only). */
  predicted_value?: number;

  // ---- Internal-node-only fields -----------------------------------------

  /** Name of the predictor variable used to split at this node. */
  split_var?: string;

  /** The split condition (threshold or category set). */
  split?: Split;

  /** Left child at index 0, right child at index 1. Absent for leaves. */
  children?: TreeNode[];
};

// ---------------------------------------------------------------------------
// Top-level model
// ---------------------------------------------------------------------------

export type ResponseType = "classification" | "regression";

/**
 * One row of rpart's complexity-parameter (cp) table.
 * Useful for plotting the cross-validation error curve and choosing
 * a pruning level.
 */
export type CpTableRow = {
  CP: number;       // complexity parameter value
  nsplit: number;   // number of splits in the tree at this CP
  rel_error: number; // training error relative to root-node deviance
  xerror: number;   // cross-validation error (same scale as rel_error)
  xstd: number;     // standard deviation of the cross-validation error
};

/**
 * The top-level object produced by `arborview_export()` in R.
 * One of these is loaded per dataset.
 */
export type Arbor = {
  /** Always "arborview/tree@1". Used to detect version mismatches. */
  schema: string;

  /** Human-readable name shown in the UI (dataset selector label). */
  title: string;

  /**
   * The rpart method string.  "class" for classification, "anova" for
   * regression.  Use `response.type` (a friendlier enum) in UI code.
   */
  method: string;

  response: {
    /** "classification" or "regression" — safe to use in switch statements. */
    type: ResponseType;

    /**
     * Ordered class labels for classification trees (null for regression).
     * Index i in this array corresponds to index i in `class_counts` and
     * `class_probs` on each node.
     */
    levels: string[] | null;
  };

  variables: {
    /** Names of all predictor variables in the model formula. */
    predictors: string[];

    /**
     * Variable importance scores from rpart (higher = more important).
     * Keys are predictor names; values are raw importance scores.
     * Normalised to [0, 1] for display by the UI.
     */
    importance: Record<string, number>;
  };

  /**
   * Complexity-parameter table — one row per tree size evaluated during
   * cross-validation.  Useful for understanding pruning choices.
   */
  cptable?: CpTableRow[];

  /** The original R call that produced this model, e.g. "rpart(y ~ x1 + x2)". */
  call: string;

  /** Root node of the tree.  Children are nested recursively. */
  tree: TreeNode;

  /**
   * A plain-English sentence explaining what "Failure" means in this model.
   * Displayed in the Failure Definition overlay on the tree canvas.
   * Absent for datasets where this hasn't been set yet.
   */
  failure_definition?: string;

  /** Whole-tree performance metrics from caret::confusionMatrix(). Absent for datasets without a perf file. */
  performance?: Performance;
};

// ---------------------------------------------------------------------------
// Model performance (optional — present only when a performance file was patched in)
// ---------------------------------------------------------------------------

/**
 * A confusion matrix from caret's confusionMatrix() output.
 * Rows = predicted class, columns = reference (true) class.
 * labels[i] corresponds to matrix[i][j].
 */
export type ConfusionMatrix = {
  labels: string[];
  matrix: number[][];
};

/**
 * Whole-tree performance statistics produced by caret::confusionMatrix()
 * and embedded into the JSON by R/add_performance.R.
 */
export type Performance = {
  positive_class: string;
  confusion_matrix: ConfusionMatrix;
  accuracy: number;
  accuracy_ci: [number | null, number | null];
  kappa: number;
  no_information_rate: number;
  sensitivity: number;
  specificity: number;
  ppv: number;
  npv: number;
  prevalence: number;
  detection_rate: number;
  detection_prevalence: number;
  balanced_accuracy: number;
};

// ---------------------------------------------------------------------------
// Manifest (dataset index)
// ---------------------------------------------------------------------------

/** One entry in the manifest.json dataset index. */
export type ManifestEntry = {
  /** Short machine-readable identifier, e.g. "eowy5". */
  id: string;
  /** Human-readable label shown in the dataset dropdown. */
  label: string;
  /** Filename relative to the `public/data/` directory, e.g. "EOWY5_classification.json". */
  file: string;
};

/** The manifest.json file that lists all available datasets. */
export type Manifest = { datasets: ManifestEntry[] };
