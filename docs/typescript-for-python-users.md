# TypeScript for Python Users

This guide covers just enough TypeScript to read and work with the ArborView source code. If you know Python well, TypeScript will feel familiar — it's a statically-typed language with similar syntax and many analogous constructs.

## The big picture

TypeScript is JavaScript with a type system bolted on — think of it as Python with mandatory type hints, where the type checker runs at compile time rather than as an optional linter. Key differences from Python:

- Types are required (or inferred), not optional annotations
- Code compiles to plain JavaScript before running in the browser
- Semicolons terminate statements (optional but conventional)
- There's no pip/conda; packages come from npm

## Variables

Python variables are just assignment. TypeScript distinguishes between reassignable (`let`) and fixed (`const`) bindings:

```python
# Python
name = "ArborView"
count = 0
count += 1
```

```ts
// TypeScript
const name = "ArborView";  // like a final binding — can't reassign
let count = 0;
count += 1;
```

Prefer `const` by default; use `let` only when you need to reassign. You'll rarely see `var` in modern TypeScript — treat it like Python 2's `print` statement.

## Type annotations

Python type hints are optional. TypeScript types are enforced at compile time:

```python
# Python — hints are optional, ignored at runtime
def greet(name: str) -> str:
    return f"Hello, {name}"
```

```ts
// TypeScript — types are required, checked at compile time
function greet(name: string): string {
  return `Hello, ${name}`;
}
```

TypeScript often **infers** types from context, so you don't always have to write them:

```ts
const title = "ArborView";  // TypeScript infers: string
const n = 42;               // TypeScript infers: number
```

## Primitive types

| Python | TypeScript |
|---|---|
| `str` | `string` |
| `int` / `float` | `number` (no distinction) |
| `bool` | `boolean` |
| `None` | `null` or `undefined` |
| `list` | array `[]` |
| `dict` | object `{}` |

## Defining object shapes

Python uses `TypedDict`, `dataclasses`, or Pydantic models to describe the shape of a dict/object. TypeScript uses `type` aliases or `interface`:

```python
# Python
from typing import TypedDict

class TreeNode(TypedDict):
    node_id: int
    depth: int
    is_leaf: bool
```

```ts
// TypeScript
type TreeNode = {
  node_id: number;
  depth: number;
  is_leaf: boolean;
};
```

These are equivalent in intent. The TypeScript compiler checks that every `TreeNode` you create has these fields at the right types.

## Optional fields (`?`)

Python's `Optional[X]` (or `X | None`) has a direct TypeScript equivalent:

```python
# Python
from typing import Optional

class TreeNode(TypedDict):
    predicted_class: Optional[str]   # may be absent for regression trees
```

```ts
// TypeScript
type TreeNode = {
  predicted_class?: string;   // the ? means: present or absent
};
```

A `?` on a field means it may be `undefined` (not present). Fields that are explicitly `null` in the JSON are typed as `string | null` instead.

## Union types

Python's `Union[A, B]` (or `A | B` in Python 3.10+) maps directly:

```python
# Python
from typing import Union
Split = Union[NumericSplit, CategoricalSplit]
ResponseType = Literal["classification", "regression"]
```

```ts
// TypeScript
type Split = NumericSplit | CategoricalSplit;
type ResponseType = "classification" | "regression";
```

String literal unions like `ResponseType` above are TypeScript's equivalent of `Literal` — only those exact strings are valid.

## Arrays and indexing

TypeScript arrays are like Python lists, with 0-based indexing. The type `string[]` means "array of strings":

```python
# Python
levels = ["setosa", "versicolor", "virginica"]
levels[0]   # "setosa"
```

```ts
// TypeScript
const levels: string[] = ["setosa", "versicolor", "virginica"];
levels[0]   // "setosa"
```

## Objects / dicts

TypeScript objects work like Python dicts with string keys, but accessed with `.` instead of `[]`:

```python
# Python
node = {"node_id": 1, "depth": 0, "n": 100}
node["depth"]   # 0
```

```ts
// TypeScript
const node = { node_id: 1, depth: 0, n: 100 };
node.depth   // 0  (dot access is conventional for known-shape objects)
```

For a dict with arbitrary string keys (like Python's `dict[str, float]`), TypeScript uses `Record<string, number>`:

```ts
const importance: Record<string, number> = {
  wt: 847.7,
  cyl: 785.6,
};
```

## Arrow functions

Python lambdas are single-expression only. TypeScript arrow functions are full functions and are used everywhere:

```python
# Python
square = lambda x: x ** 2
nodes_n = list(map(lambda n: n["n"], nodes))
```

```ts
// TypeScript
const square = (x: number) => x ** 2;
const nodesN = nodes.map((n) => n.n);
```

Multi-line arrow functions use `{}` and an explicit `return`:

```ts
const describe = (node: TreeNode) => {
  const label = node.is_leaf ? "leaf" : "internal";
  return `${label} node at depth ${node.depth}`;
};
```

## Template literals

Python f-strings map directly to TypeScript template literals (backtick strings):

```python
# Python
f"Node {node_id} at depth {depth}"
```

```ts
// TypeScript
`Node ${node_id} at depth ${depth}`
```

## `null` vs `undefined`

TypeScript has two "nothing" values. This trips up Python developers:

- `null` — explicitly set to nothing (like Python's `None`)
- `undefined` — variable was declared but never assigned, or an optional field is absent

In ArborView's JSON data, missing values are `null`. Use strict equality to check:

```ts
if (node.predicted_class !== null) {
  // safe to use node.predicted_class here
}
```

Avoid `==` (loose equality) — always use `===`. In TypeScript, `null == undefined` is `true` but `null === undefined` is `false`.

## Imports and exports

Python's `from module import X` maps directly:

```python
# Python
from types import TreeNode, Arbor
```

```ts
// TypeScript
import { TreeNode, Arbor } from "./types";
```

The `./` prefix means the path is relative to the current file. Packages from npm are imported without a path prefix (e.g., `import * as d3 from "d3"`).

## Null-safe access and type narrowing

Python's `isinstance()` checks narrow types. TypeScript does the same:

```python
# Python
if isinstance(split, NumericSplit):
    print(split.threshold)  # type checker knows this is NumericSplit here
```

```ts
// TypeScript
if (split.type === "numeric") {
  console.log(split.threshold);  // TypeScript knows it's NumericSplit here
}
```

## Reading ArborView's types

Here's the top-level `Arbor` type from `src/types.ts` with Python-lens annotations:

```ts
export type Arbor = {
  schema: string;            // str — version tag
  title: string;             // str — display label
  method: string;            // "class" or "anova"
  response: {
    type: ResponseType;                  // Literal["classification", "regression"]
    levels: string[] | null;             // list[str] | None
  };
  variables: {
    predictors: string[];                // list[str]
    importance: Record<string, number>;  // dict[str, float]
  };
  cptable?: CpTableRow[];    // list[CpTableRow] | None  (optional field)
  call: string;              // str — the R call that built the model
  tree: TreeNode;            // root node; children nested recursively
};
```

`export` makes the type importable by other files — like `__all__` in a Python module.

## Where to go from here

The ArborView TypeScript lives in `src/`:

- `src/types.ts` — all type definitions (good first read)
- `src/main.ts` — loads data, wires up the sidebar UI
- `src/tree.ts` — D3 tree renderer
- `src/tooltip.ts` — tooltip rendering

For a deeper dive, the [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html) is thorough and well-written. If you're coming from Python specifically, the [TypeScript for Python Programmers](https://www.typescriptlang.org/docs/handbook/typescript-in-5-minutes-oop.html) page in the handbook is also worth a skim.
