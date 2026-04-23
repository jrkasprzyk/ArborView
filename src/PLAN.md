ArborView: Interactive CART VisualizationArborView is a tool designed to bridge the gap between R's rpart models and modern, interactive web visualizations.🛠️ The ArchitectureTo bridge the gap between R and a web-based JS tool, you’ll need a data pipeline that converts the nested list structure of an rpart object into a JSON format.1. The Data Bridge (R Side)The rpart object isn't naturally JSON-friendly. Using partykit helps convert it to a consistent structure for export.Rlibrary(rpart)
library(partykit)
library(jsonlite)

# Your model
fit <- rpart(Kyphosis ~ Age + Number + Start, data = kyphosis)

# Convert and export
tree_list <- as.list(as.party(fit))
write_json(tree_list, "tree_data.json")
2. The Visualization Engine (JS Side)Since trees are hierarchical, D3.js is the gold standard for custom web-based layouts.D3.js: Use d3.hierarchy and d3.tree to calculate node positions.Interactivity: Use Floating UI for polished tooltips.Bundler: Use Vite for fast development and easy deployment.💡 Key Features for "Interactivity"Smart Tooltips: Show Entropy or Gini Impurity reduction at each node.Path Highlighting: Hover over a leaf to highlight the logic chain back to the root.Breadcrumbs: Provide a text-based trail of the decision path (e.g., Age > 10 → Start < 5).Node Scaling: Size nodes based on the number of samples ($n$) at that node.🎨 Project Branding: ArborViewArborView is currently available on the npm registry!How to claim it:Bashmkdir arborview && cd arborview
npm init --scope=@your-username
Data Structure ExampleYour JS tool should expect a recursive JSON structure like this:JSON{
  "name": "Root",
  "split": "Age < 10",
  "impurity": 0.45,
  "samples": 100,
  "children": [
    { "name": "Leaf A", "samples": 40, "value": "Class 1" },
    { "name": "Node B", "split": "Start > 5", "children": [...] }
  ]
}
🚀 Deployment StrategyR Markdown / Quarto: The fastest way to bundle custom JS into an R workflow using htmlwidgets.Full Web App: A React/Vite frontend connected to a Plumber API in R for real-time model visualization.