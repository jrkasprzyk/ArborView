# How to register a dataset

**Goal:** make an exported JSON file appear in the header dropdown.

ArborView discovers datasets through one index file: `public/data/manifest.json`.

## Steps

1. Place your exported JSON in `public/data/` (the [export guide](export-a-model.md) writes there by default).
2. Open `public/data/manifest.json` and add one entry to the `datasets` array:

```json
{
  "datasets": [
    { "id": "my_model", "label": "My Model", "file": "my_model.json" }
  ]
}
```

| Field | Meaning |
|---|---|
| `id` | Short unique key for the dataset. |
| `label` | Text shown in the dropdown. |
| `file` | Filename **relative to `public/data/`**. |

3. Reload the browser. Your label now appears in the dropdown.

## Tips

- Use clear, outcome-focused labels — the dropdown is how users tell models apart. For example `"Powell < 3500' by end of WY 1"` reads better than `"eowy1"`.
- A JSON file sitting in `public/data/` that is **not** listed in the manifest is simply ignored; the manifest is the single source of truth for what loads.
