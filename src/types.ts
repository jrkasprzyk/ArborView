export type NumericSplit = {
  type: "numeric";
  threshold: number;
  left_op: "<" | ">=";
  right_op: "<" | ">=";
};

export type CategoricalSplit = {
  type: "categorical";
  left_levels: string[];
  right_levels: string[];
};

export type Split = NumericSplit | CategoricalSplit;

export type TreeNode = {
  node_id: number;
  depth: number;
  n: number;
  weight: number;
  deviance: number;
  complexity: number;
  is_leaf: boolean;
  impurity: number;
  rule_from_root: string[];

  // classification
  predicted_class?: string;
  class_counts?: number[];
  class_probs?: number[];
  node_prob?: number;

  // regression
  predicted_value?: number;

  // internal
  split_var?: string;
  split?: Split;
  children?: TreeNode[];
};

export type ResponseType = "classification" | "regression";

export type Arbor = {
  schema: string;
  title: string;
  method: string;
  response: {
    type: ResponseType;
    levels: string[] | null;
  };
  variables: {
    predictors: string[];
    importance: Record<string, number>;
  };
  cptable?: unknown;
  call: string;
  tree: TreeNode;
};

export type ManifestEntry = { id: string; label: string; file: string };
export type Manifest = { datasets: ManifestEntry[] };
