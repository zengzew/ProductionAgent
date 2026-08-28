# Formal HumanDecision protocol

WP-M3-04 uses one audit protocol for the three human gates:

```text
content-approval  -> freeze + production authorization
unfreeze-approval -> scoped L4 edit/refreeze
final-approval    -> internal published-ready state only
```

The canonical Zod contract is `human-decision-v1` in
`src/orchestration/schemas/human-decision.ts`. A decision contains a stable
`decisionId`, canonical `gate`, `decision` (`approve`, `reject`, or
`direct-edit`), `reviewer`, offset timestamp, bounded reason, related
`ArtifactRef[]`, and the current `approvalEpoch`. Refs are hash-bound; no
artifact body is accepted in the decision or placed in `ProductionState`.

Persistence writes the decision under
`content/<episode>/production/human-decisions/` and registers it in the local
artifact index. The same `decisionId` and identical payload can be replayed
without adding another artifact record; a different payload with that ID is a
collision. A reject also writes a `human-issue-v1` artifact under
`content/<episode>/production/issues/` and resolves its owner/restart route
through `config/ownership.json`. Content is not changed by rejection.

A direct edit points to a selected `before` ref and a newer hash-bound `after`
ref whose producer is `human:<reviewer>`. The service records provenance,
marks dependent selected artifacts stale transitively, selects the new ref,
and creates locks for each changed locator. Automated content revisions receive
the state's locks by default and fail closed when a candidate overlaps one.

Content approval advances the epoch and creates a manifest plus
`productionAuthorization`. Production code that opts into the formal gate
calls `assertProductionStart(state, {requireFormalApproval: true})`; missing,
manifest-mismatched, or old-epoch authorization is rejected. Any content
direct-edit or later unfreeze makes prior authorization stale by epoch.

The LangGraph path is the default at the orchestration boundary;
`ORCHESTRATOR=manual` remains an explicit fallback. `createFoundationGraph({repoRoot})`
uses formal content/final handlers; the production subgraph accepts
`requireFormalApproval: true` for a strict start check. Legacy M3.3 unfreeze
resume payloads are normalized into the same formal artifact while the legacy
request/editor artifact remains available for compatibility.

Final approval only updates internal checkpoint state. It does not call a
network client, upload a file, publish to a platform, or mutate external data.
