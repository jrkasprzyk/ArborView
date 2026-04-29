# TypeScript for R Users

This guide covers just enough TypeScript to read and understand the ArborView source code. You don't need to write TypeScript to contribute — most ArborView work happens in R. But if you want to understand what the browser side is doing, this will get you oriented.

## The big picture

TypeScript is JavaScript with types added on top. Think of it as R, but:

- Variables don't have classes you discover at runtime — you declare them upfront
- The code runs in a browser, not an R session
- There's no CRAN; packages come from npm

The TypeScript in ArborView is compiled to plain JavaScript before the browser ever sees it. The types exist only to catch mistakes during development.

## Variables

R uses `<-` (or `=`) to assign. TypeScript uses `const` (can't be reassigned) or `let` (can be reassigned):

```r
# R
name <- "ArborView"
count <- 0
count <- count + 1
```

```ts
// TypeScript
const name = "ArborView";   // like R's lockBinding — can't reassign
let count = 0;
count = count + 1;
```

You'll see `const` almost everywhere in ArborView. Use `let` only when you need to reassign.

## Types

R's types (`character`, `numeric`, `logical`, `NULL`) map roughly to:

| R | TypeScript |
|---|---|
| `character` | `string` |
| `numeric` / `integer` | `number` |
| `logical` | `boolean` |
| `NULL` | `null` |
| `NA` | `null` (in JSON/TS context) |
| named list | object `{}` |
| vector / list | array `[]` |

TypeScript lets you declare what type a variable holds using a `:` annotation:

```ts
const title: string = "My Model";
const n: number = 42;
const isLeaf: boolean = true;
```

In practice, TypeScript usually infers the type from the value, so you don't need to write the annotation explicitly — the example above is the same as just `const title = "My Model"`.

## Functions

R functions and TypeScript functions look similar. The main difference is that TypeScript annotates the parameter types and return type:

```r
# R
add <- function(x, y) {
  x + y
}
```

```ts
// TypeScript — types on parameters and return value
function add(x: number, y: number): number {
  return x + y;
}
```

You'll also see **arrow functions**, which are like R's anonymous functions:

```r
# R anonymous function
sapply(nodes, function(node) node$n)
```

```ts
// TypeScript arrow function
nodes.map((node) => node.n)
```

## Objects (like named lists)

TypeScript objects work like R named lists. Access fields with `.` just like `$` in R:

```r
# R
node <- list(node_id = 1, depth = 0, n = 100)
node$depth  # 0
```

```ts
// TypeScript
const node = { node_id: 1, depth: 0, n: 100 };
node.depth  // 0
```

## Arrays (like vectors)

TypeScript arrays are like R vectors, but they can hold any type:

```r
# R
levels <- c("setosa", "versicolor", "virginica")
levels[1]  # "setosa"  (1-based!)
```

```ts
// TypeScript
const levels = ["setosa", "versicolor", "virginica"];
levels[0]  // "setosa"  (0-based!)
```

**Note:** TypeScript arrays are 0-indexed. The first element is `[0]`, not `[1]`.

## Type aliases and interfaces

This is where TypeScript earns its name. You can define a named type, which is like documenting the shape of a list in R — except the compiler enforces it:

```r
# R — no enforcement, just convention
# node should be a list with: node_id (int), depth (int), is_leaf (logical)
```

```ts
// TypeScript — the compiler checks this
type TreeNode = {
  node_id: number;
  depth: number;
  is_leaf: boolean;
};
```

In `src/types.ts`, every object that ArborView uses is defined this way. If you pass an object that's missing a field or has the wrong type, TypeScript will refuse to compile.

## Optional fields (`?`)

A `?` after a field name means it might not be present — like an argument with a default of `NULL` in R:

```ts
type TreeNode = {
  node_id: number;
  predicted_class?: string;   // only present for classification trees
  predicted_value?: number;   // only present for regression trees
};
```

Before using an optional field, code typically checks whether it exists:

```ts
if (node.predicted_class !== null) {
  // safe to use node.predicted_class here
}
```

## Union types (`|`)

A `|` means "one of these types" — similar to saying a parameter can be `character` or `NULL` in R:

```ts
type ResponseType = "classification" | "regression";  // only these two strings are valid

type Split = NumericSplit | CategoricalSplit;  // either kind of split object
```

## `null` and `undefined`

TypeScript has two "nothing" values, which can be confusing:

- `null` — explicitly set to nothing (like R's `NULL`)
- `undefined` — the variable exists but was never assigned

In ArborView's JSON, absent values are always `null`. You'll mostly encounter `null` checks:

```ts
if (node.children !== null) {
  // this is an internal node with children
}
```

## Imports and exports

TypeScript files share code using `import` and `export`, similar to how R packages use `@export` and `library()`:

```r
# R
library(rpart)           # load a package
```

```ts
// TypeScript — import specific names from another file
import { TreeNode, Arbor } from "./types";
```

In ArborView, `src/types.ts` exports all the type definitions, and the other files import from it.

## Reading ArborView's types

Here's an excerpt from `src/types.ts` with R-lens annotations:

```ts
export type Arbor = {
  schema: string;            // character(1) — version tag
  title: string;             // character(1) — display label
  method: string;            // "class" or "anova"
  response: {
    type: ResponseType;      // "classification" | "regression"
    levels: string[] | null; // character vector or NULL
  };
  variables: {
    predictors: string[];              // character vector
    importance: Record<string, number>; // named numeric vector
  };
  cptable?: CpTableRow[];    // optional — like an argument defaulting to NULL
  call: string;              // deparse(fit$call)
  tree: TreeNode;            // the root node (children nested inside)
};
```

`string[]` is TypeScript's way of writing "character vector". `Record<string, number>` means "named numeric vector" (a dictionary where every key is a string and every value is a number).

## Where to go from here

The ArborView TypeScript lives in `src/`. The files are:

- `src/types.ts` — all type definitions (safe to read, no side effects)
- `src/main.ts` — loads data, wires up the sidebar UI
- `src/tree.ts` — D3 tree renderer
- `src/tooltip.ts` — tooltip rendering

If you want to go deeper, the [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html) is well-written and approachable.
