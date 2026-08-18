# Episode packages

This directory holds product-story episodes. Each folder is one package:

```text
content/<episode-id>/
  episode.config.json
  research/
  story/
  production/
  media/                  # real-media episodes (003+)
  artifact-index.json     # 003+
```

`episode.config.json` may set `kind`:

| kind        | Meaning                                          |
| ----------- | ------------------------------------------------ |
| `episode`   | Current or evaluation product story (default)    |
| `benchmark` | Goal 3 comparison package, nested as `v2-goal3/` |
| `fixture`   | Acceptance-only package, never published         |

## What belongs here

- `episode-001` … `episode-005` are product stories.
- `episode-001/v2-goal3` and `episode-002/v2-goal3` are frozen Goal 3 benchmarks.
  Resolve them with `EPISODE_ID=episode-001-v2-goal3`; do not add a sibling
  symlink at `content/` root, and do not register them as renderable episodes.
- `episode-m5e2e` is the M5 acceptance fixture.

New product work uses `episode-<number>` plus a `media-mix` render contract.
Do not copy `v2-goal3/` or `episode-m5e2e` as a template.
