# Verification layers

- Status: normative engineering contract
- Contract set: `engineering-contracts-v1`

Mechanical validators prove structure. They do not prove that a video is
interesting, clear, or worth finishing. Banned-word regexes, a hook question
mark, score floors and schema fields are Fast/Contract evidence only. Retention
and creative quality are judged in Production acceptance: real render, Codex
inspection, and human approval.

## Layers

| Layer                 | When                                                        | What to run                                                                                                                                                                 |
| --------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fast                  | Every local change                                          | Format/types as needed, affected unit tests, episode schema. `pnpm test:affected`. `pnpm validate:episode -- --profile fast` for Episode files.                             |
| Contract              | PR, or rights/hash/checkpoint/resume/media pipeline changes | One Vitest run with coverage (`pnpm test:coverage` in CI). Hash, checkpoint, resume and media contract tests. `pnpm validate:episode -- --profile production`.              |
| Production acceptance | New Episode or release                                      | Real footage, real TTS, actual render, Codex inspection, final human approval. `pnpm validate:episode -- --profile release` is the structural gate, not the creative proof. |

Do not treat a green Fast or Contract run as evidence that the cut will hold
attention. A full `pnpm test` passing 500 cases still cannot certify that the
finished video is worth watching.

## Daily vs milestone habit

Milestone acceptance may still run a file test, a media group, an
orchestration group, typecheck, lint and a full suite. Daily work must not.
Episode content, documentation, or a single validator change should stay in
Fast unless the affected-test map says otherwise.

| Change                                                        | Default                                                                                                                      |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `content/**`, `docs/**`, `agents/**`                          | `pnpm validate:episode -- --profile fast` if Episode files changed; no Vitest suite                                          |
| One validator or `src/lib/**` file                            | `pnpm test:affected`                                                                                                         |
| `src/media/**`, checkpoint, hash, resume                      | Contract tests from the map; not the full 80+ files                                                                          |
| `package.json`, lockfile, `vitest.config.ts`, `tsconfig.json` | Full suite                                                                                                                   |
| New Episode / release                                         | Production acceptance: `validate:episode --profile release`, real TTS/render, Codex, human. Do **not** run the Vitest suite. |

`pnpm verify:autonomous` uses the same map. `--full` is the escape hatch.

Independent validators remain: `validate:research`, `validate:workflow`,
`validate:story`, `validate:content`, `validate:delivery`. The command layer is
`validate:episode --profile fast|production|release`.

## ArtifactRef hash checks

SHA-256 of file bytes is a trust-boundary check, not a per-node ritual.

Recompute (read bytes and hash) at:

1. External input entering the system (`buildArtifactRef`, media ingest)
2. Checkpoint resume
3. Pre-render
4. Final approval (Delivery Critic package and current-byte human approval)

Same-process graph nodes, manifests, selection and verification reuse a
digest cached against size, mtime and inode. A later node in the same run
must not re-hash an ArtifactRef that already passed in this process unless it
is one of the four boundaries.

## CI

CI classifies the diff with `scripts/ci-scope.ts`.

- Code, config, tests, or tooling: Contract layer. Format, lint, typecheck, one
  `pnpm test:coverage` run, then `validate:episode --profile production` for
  episode-001/002 fixtures.
- Episode content only (`content/`, `output/`, `public/episodes/`): skip the
  Vitest suite. Validate the changed episode. Do not treat 600+ unit tests as
  episode acceptance.
- Empty/unknown CI diffs fail closed to the Contract layer.

It does not run `pnpm test` and `pnpm test:coverage` back to back. It does not
render, call TTS, or stand in for Delivery approval.
