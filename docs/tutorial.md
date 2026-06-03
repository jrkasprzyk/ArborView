# Tutorial: Explore your first tree in ArborView

This lesson walks you from a fresh clone to confidently reading a decision tree on screen. By the end you will have the app running locally and will understand what every part of the screen is telling you.

You do **not** need R for this tutorial. ArborView ships with sample datasets, and we will explore one of them — a small regression tree built from R's built-in `mtcars` data.

**Time:** about 10 minutes.
**You will need:** Node.js 18 or newer (this includes `npm`).

> Not sure if Node is installed? Run `node --version`. If you see a version number of 18 or higher, you are ready. If the command is not found, install Node from https://nodejs.org and reopen your terminal.

---

## Step 1 — Get the code and install dependencies

Clone the repository (or download it) and install the front-end packages:

```bash
git clone https://github.com/jrkasprzyk/ensemble-viewer.git
cd ensemble-viewer
npm install
```

`npm install` reads `package.json` and downloads D3, the tooltip library, and the Vite build tool into a local `node_modules/` folder. This runs once; you will not repeat it each session.

## Step 2 — Start the development server

```bash
npm run dev
```

Vite compiles the app and prints a local URL, usually:

```text
  ➜  Local:   http://localhost:5173/
```

Open that URL in your browser. You should see the ArborView header with a dataset dropdown, a large canvas, and a sidebar on the right.

## Step 3 — Choose the mtcars dataset

In the header dropdown, select **mtcars mpg (regression)**.

A tree appears on the canvas. This tree predicts a car's fuel economy (miles per gallon) from its other attributes. Because it is a *regression* tree, each leaf predicts a number — the average mpg of the cars that landed there.

Take a moment to notice:

- **Circles are nodes.** Bigger circles contain more training observations.
- **Lines are splits.** Each line is labelled with the rule that sends cars left or right, for example `cyl >= 5`.
- **The top node is the root** — every car starts here before the tree sorts it down to a leaf.

## Step 4 — Hover a node to read its statistics

Move your mouse over any node. A tooltip appears, and the sidebar panels update to describe that node:

- **Decision path** lists the rules from the root down to this node, ending with its prediction.
- **Node detail** shows the sample count, the predicted mpg, impurity (MSE here), complexity, and deviance.

Hover a few different nodes and watch how the predicted value changes as you move toward the leaves. Deeper leaves describe narrower, more specific groups of cars.

## Step 5 — Click a node to pin it

Hovering is exploratory; clicking commits. **Click** a leaf node near the bottom of the tree.

The sidebar now stays focused on that node even as you move your mouse elsewhere. This lets you read a leaf's details carefully — its decision path is the full "story" of how a car with those attributes is predicted to get that mpg.

Click the canvas background to unpin.

## Step 6 — Pan, zoom, and tidy the layout

The canvas is interactive:

- **Pan:** click-and-drag on empty canvas background.
- **Zoom:** scroll your mouse wheel.
- **Reposition a node:** click-and-drag a single node. Its edges and rule labels follow in real time.

Dragging a node only moves it on screen — it never changes the tree's structure or statistics. Use it to untangle crowded branches.

## Step 7 — Read the variable-importance chart

Find the **Variable importance** panel in the sidebar. Each bar shows how much a predictor contributed to the tree overall, normalised so the most important variable fills the full width.

Notice that an important variable is not always the one used at the very top split — a predictor can earn importance by being reused at several deeper splits.

---

## What you have learned

You can now:

- run ArborView locally with `npm run dev`,
- load a dataset and read the tree, tooltip, and sidebar panels,
- pin a node and trace its decision path,
- pan, zoom, and rearrange the canvas,
- interpret the variable-importance chart.

## Where to go next

- **Want to visualize your own model?** Follow [How to export an rpart model](how-to/export-a-model.md).
- **Curious *why* the trees look and behave this way?** Read the [Explanation](explanation.md) of CART, impurity, and the colour systems.
- **Need exact field definitions?** See the [Reference](reference.md).
