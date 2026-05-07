# About ArborView

ArborView is an interactive web-based visualization tool for CART (Classification and Regression Tree) decision trees built with R's `rpart` package. It exports rpart models to JSON and renders them in the browser using D3.js, making it easy to explore and communicate tree structure, node statistics, and variable importance.

## How to Use This Tool

1. **Select a dataset** from the dropdown in the header. Each dataset corresponds to one exported rpart model.
2. **Read the Failure Definition** in the overlay panel at the upper-left corner of the tree canvas. It provides plain-English context for what "Failure" means in this model — use it to ground your interpretation of node colors and predictions before exploring the tree.
3. **Explore the tree** by hovering over nodes to see summary statistics in a tooltip and in the sidebar panels.
4. **Click a node** to pin its information in the sidebar — the decision path (breadcrumb) and node detail panel will stay focused on that node even as you continue to hover elsewhere.
5. **Pan and zoom** the tree canvas with your mouse — click-and-drag on the canvas background to pan, scroll to zoom.
6. **Drag nodes** to manually reposition them — click and drag any individual node to adjust its position on the canvas. Edges and rule labels update in real time. This does not affect the tree structure.
7. **Read the decision path** in the "Decision path" panel on the right. It shows the sequence of split rules from the root down to the selected node, ending with the node's prediction.
8. **Review node details** in the "Node detail" panel. It shows statistics like sample count, impurity, complexity, and for classification trees, the class probability bars.
9. **Check variable importance** in the sidebar — the chart shows which predictors contributed most to splits in the tree, normalised so the most important variable is always the full bar width.
10. **Review model performance** in the "Model performance" panel at the bottom of the sidebar. When performance data is available it shows a confusion matrix (rows = predicted class, columns = reference class) and key classification statistics including accuracy, kappa, sensitivity, specificity, PPV/NPV, and balanced accuracy. Hover any metric label for a plain-English definition.

## Understanding CART Trees

CART stands for **Classification and Regression Trees**. The algorithm recursively partitions the training data into increasingly pure subgroups, based on the values of predictor variables.

### Classification Trees

A **classification tree** predicts a categorical outcome (a class label). At each leaf node, the tree predicts the majority class of the training observations that reached that node.

- **What is being classified?** The response variable is a categorical label — for example, a species name, a pass/fail outcome, or a risk category.
- **Impurity metric:** Gini index (`1 − Σ pᵢ²`), where pᵢ is the proportion of class i at a node. Lower Gini = more pure node.
- **Color coding:** In classification trees, each node is colored by its predicted class. The color palette matches the class probability bars in the Node detail panel.

### Regression Trees

A **regression tree** predicts a continuous numeric outcome. At each leaf node, the tree predicts the mean response value of the training observations that reached that node.

- **What value is being predicted?** The response variable is a numeric measurement — for example, miles per gallon, a test score, or a financial metric.
- **Impurity metric:** Mean Squared Error (MSE = deviance / n). Lower MSE = more homogeneous node.
- **Color coding:** In regression trees, node color is scaled by the predicted mean response value.

## Node Statistics Reference

| Statistic | Description |
|---|---|
| **node id** | rpart's integer node ID. Root = 1; left child of node k = 2k; right = 2k+1. |
| **depth** | Distance from the root (root = 0). |
| **samples** | Number of training observations that reached this node. |
| **prediction** | Majority class (classification) or mean response value ŷ (regression). |
| **impurity** | Per-observation impurity — Gini index for classification, MSE for regression. |
| **complexity** | Cost-complexity parameter (α) at which this split would be pruned. Smaller = more stable. |
| **deviance** | Total impurity × n at this node (Gini × n for classification; residual sum of squares for regression). |
| **node prob** | Fraction of the entire training set that reached this node (classification only). |

## Model Performance Statistics

When a performance report has been embedded in the dataset, the **Model performance** panel shows:

- **Confusion matrix** — a grid of predicted vs. actual class counts. Diagonal cells (correct predictions) are highlighted green; off-diagonal cells (errors) are highlighted red.
- **Accuracy** — overall fraction of correct predictions, with a 95% confidence interval.
- **Kappa** — Cohen's κ, measuring agreement above what would be expected by chance. Values near 1 indicate strong agreement; values near 0 indicate chance-level performance.
- **Sensitivity** — true positive rate for the designated positive class (how often actual positives are correctly identified).
- **Specificity** — true negative rate (how often actual negatives are correctly rejected).
- **PPV** — positive predictive value (precision): of all predictions of the positive class, how many were correct.
- **NPV** — negative predictive value: of all predictions of the negative class, how many were correct.
- **Balanced accuracy** — the average of sensitivity and specificity. Useful when class prevalence is unequal, since it does not reward always predicting the majority class.
- **Positive class** — which class was designated as "positive" when the statistics were computed.

Performance data is added to a dataset's JSON file by running `R/add_performance.R` with a `caret::confusionMatrix()` text output file. Datasets without a performance file show a placeholder in this panel.

## Predictor Variables

Predictor variable descriptions depend on the specific model and dataset loaded. Refer to the dataset documentation provided alongside each model for definitions of individual predictor names.

The **Variable importance** panel ranks predictors by their total contribution to impurity reduction across all splits in the tree. A predictor can appear as important even if it is not used at the root split — it may be used repeatedly at deeper levels.

---

*To customize this page for your model, replace `public/about.md` with your own Markdown content. You can describe your specific response variable, predictor definitions, data source, and any other context that helps readers interpret the tree.*
