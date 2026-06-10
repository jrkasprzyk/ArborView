# Explanation

This document explains the ideas behind ArborView — what the trees mean, what the statistics measure, and why the app is built the way it is. It is for understanding, not for step-by-step tasks (see the [how-to guides](how-to/README.md)) or exact field definitions (see the [reference](reference.md)).

## What CART is

CART stands for **Classification And Regression Trees**. The algorithm starts with all the training data at a single root node and repeatedly splits it into two groups, each time choosing the predictor and threshold that make the resulting groups as "pure" as possible. It keeps splitting until further splits no longer help, producing a tree of decisions.

To make a prediction for a new observation, you start at the root and follow the split rules — left or right at each node — until you land in a leaf. The leaf's summary *is* the prediction.

Each internal node uses one primary split variable to perform the split. CART implementations like R's `rpart` also keep track of surrogate splits as alternate predictors to use only when the primary predictor's value is missing for a new observation.

This is why ArborView centres on the tree shape and the decision path: the structure is the model. A tree is unusually honest about its own reasoning, which is exactly what makes it worth visualizing rather than reducing to a single accuracy number.

### Classification vs regression trees

The two tree types differ only in what a leaf predicts:

- A **classification tree** (rpart method `"class"`) predicts a category. Each leaf reports the majority class of the training observations that reached it, along with the per-class proportions.
- A **regression tree** (rpart method `"anova"`) predicts a number. Each leaf reports the mean response value of its observations.

ArborView supports both and adapts its panels accordingly — class-probability bars appear only for classification trees; a single predicted value appears for regression trees.

## What the node statistics mean

### Impurity

Impurity measures how mixed a node is. A split is good when it lowers impurity in its children.

- **Classification** uses the **Gini index**, `1 − Σ pᵢ²`, where `pᵢ` is the proportion of class *i*. A pure node (all one class) has Gini 0; a node split evenly across classes has high Gini.
- **Regression** uses **MSE** (mean squared error), the average squared distance of observations from the node's mean. A node where every observation has nearly the same response value has low MSE.

Watching impurity fall as you move from root to leaves is watching the model do its job: each leaf describes a narrower, more homogeneous group.

### Complexity

The **complexity parameter** (α) is the cost-complexity value at which a node would be pruned away. It connects directly to overfitting: a tree that splits endlessly fits the training data perfectly but generalises poorly. Pruning removes splits whose improvement is not worth their added complexity. A smaller α on a node means the split is more stable — it earns its place.

### Deviance

Deviance is total impurity at a node — impurity multiplied by the number of observations. Where impurity is a *per-observation* quantity, deviance is the *aggregate*, which is why it scales with node size.

## Why two colour systems

This is the most easily-misread part of the app, so it is worth stating plainly. ArborView uses **two independent colour systems** that encode different things:

1. **Node colours** (`--node-success`, `--node-failure`) encode the **class label** — the model's prediction for that node.
2. **Confusion-matrix colours** (`--cm-correct`, `--cm-error`) encode **prediction correctness** — whether predictions were right or wrong.

Why not reuse one palette? Because a single leaf almost always contains a *mix* of correctly and incorrectly classified observations. A leaf predicted as "Failure" might be right about most of its observations and wrong about a few. One colour cannot honestly represent both "what class this node predicts" and "how often that prediction was correct" — those are different questions. So node colour answers the first (the dominant predicted class) and the confusion matrix answers the second (correctness), each with its own palette.

Keeping the systems separate prevents a subtle lie: it stops a confident node colour from being mistaken for a claim of accuracy.

## The failure-definition overlay

Tree nodes and the confusion matrix are only meaningful once you know what the classes *mean* in context. "Failure" is just a label until someone tells you it means, say, a reservoir dropping below a threshold by a certain year. The failure-definition overlay puts that sentence on the canvas itself, so readers ground their interpretation before they start reading colours. It is domain knowledge the model cannot supply on its own, which is why it is authored separately and patched into each dataset.

## The export-to-JSON-to-D3 architecture

ArborView deliberately splits the work in two: **R computes, the browser renders.**

The R exporter walks the fitted `rpart` object and pre-computes everything the visualiser needs — node statistics, decoded split conditions, and a `rule_from_root` breadcrumb for every node — then writes a single self-contained JSON file per model. The browser app does no statistical computation; it loads JSON and draws.

This separation has real benefits:

- **No R runtime in the browser.** The deployed app is static files — it hosts anywhere (the [live demo](https://arborview-delta.vercel.app/) runs on Vercel) and loads instantly.
- **Reproducibility.** The JSON is a frozen snapshot of a specific fitted model. Re-running the app never re-fits or re-randomises anything.
- **A stable contract.** The `schema` field (`arborview/tree@1`) versions the format, so the R and TypeScript sides can evolve independently as long as they agree on the schema.

The cost is that statistics are baked in at export time: to change what a node reports, you re-export rather than tweak the browser. For a visualiser of already-fitted models, that is the right trade.

## Further reading

- [TypeScript for R users](typescript-for-r-users.md) — for R contributors reading the front-end code.
- [TypeScript for Python users](typescript-for-python-users.md) — the same primer from a Python angle.
- [Reference](reference.md) — exact definitions of every field discussed here.
