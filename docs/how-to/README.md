# How-to guides

Each guide here solves one specific task and assumes you already know your way around the app. If you are brand new, do the [tutorial](../tutorial.md) first.

Unlike browsing the built-in datasets — which works equally well on the [deployed app](https://arborview-delta.vercel.app/) — every guide below changes files in the repository, so you need a local clone running `npm run dev` (see the [README quick start](../../README.md#run-locally)).

## Bringing your model into ArborView

- [Export an rpart model to JSON](export-a-model.md)
- [Register a dataset so it appears in the dropdown](register-a-dataset.md)
- [Add a model-performance panel](add-model-performance.md)
- [Add (or clear) a failure definition](add-failure-definition.md)

## Customizing the app

- [Change the Success / Failure class colours](change-class-colours.md)
- [Replace the About page with your own content](replace-about-page.md)

> All R scripts are run from the **repository root**. They require R with the `rpart` and `jsonlite` packages installed. See the [Reference](../reference.md#r-scripts) for exact argument lists.
