# Revision Policy

- Status: normative engineering contract
- Policy version: `revision-policy-v1`

## Goals

Revision must improve a named issue without losing the strongest valid prior work. The system must be
able to answer:

- which bytes were reviewed;
- which revision is current and which is best;
- what issue caused the change;
- whether the candidate regressed;
- whether agents are oscillating;
- how much automated revision budget remains;
- why and where a human must take over.

## Revision vocabulary

| Term        | Meaning                                                                         |
| ----------- | ------------------------------------------------------------------------------- |
| Baseline    | Selected-valid artifact set and rubric/prompt versions before a correction.     |
| Candidate   | New validated artifact revision not yet selected.                               |
| Selected    | Revision currently exposed at the canonical path for downstream work.           |
| Best        | Strongest comparable revision that passed the selection rules; always retained. |
| Superseded  | Previously selected revision retained for audit but not active.                 |
| Rejected    | Schema-valid candidate that failed an editorial or regression gate.             |
| Quarantined | Invalid output that never entered editorial comparison.                         |

Candidate, selected, and best are references to artifact bytes, not copies in orchestration state.

## Revision ledger

A future implementation MUST maintain:

```text
content/<episode>/revision-ledger.json
```

Until implemented, current `story/workflow.json`, review hashes, and filesystem history remain valid
but provide only a partial legacy view. The reserved ledger schema is:

```ts
type RevisionLedger = {
  schemaVersion: "revision-ledger-v1";
  episodeId: string;
  approvalEpoch: number;
  baselineId: string;
  budgets: {
    oralRoundsUsed: number;
    creativeRoundsUsed: number;
    deliveryRoundsUsed: number;
  };
  selected: Record<string, ArtifactRef>;
  best: Record<string, ArtifactRef>;
  attempts: Array<{
    revisionId: string;
    executionId: string;
    ownerAgent: string;
    issueIds: string[];
    before: ArtifactRef[];
    candidate: ArtifactRef[];
    evaluations: ArtifactRef[];
    disposition: "selected" | "rejected" | "quarantined" | "human-required";
    regressionIds: string[];
    oscillationIds: string[];
    createdAt: string;
  }>;
};
```

`baselineId` is SHA-256 over canonical JSON containing the sorted input artifact hashes, prompt
versions/hashes, rubric versions, and constraints used for comparison. Candidates with different
baseline IDs are not score-comparable.

## Budget policy

Budgets are independent:

| Budget                   | Maximum | Consumed by                                                                    |
| ------------------------ | ------- | ------------------------------------------------------------------------------ |
| Oral review rounds       | 3       | Each valid Oral Judge verdict for the same draft/approval epoch.               |
| Creative revision rounds | 3       | Each valid REJECT correction cycle initiated by Audience, Fact, or Retention.  |
| Delivery correction      | 3       | Each valid Delivery REJECT followed by a production correction and new review. |

The current `maximumCreativeRounds: 3` remains compatible and is the source for the creative maximum.

The following do not consume creative or delivery revision budget:

- retryable API/tool failures;
- stale-input rejection before model execution;
- schema-invalid or hash-invalid output;
- a deterministic command rerun that produces identical bytes;
- validation failure caused by repository tooling rather than artifact judgment.

These failures have their own retry ceiling in [failure-modes.md](./failure-modes.md). They still
record execution attempts and cost.

Budget is checked before dispatch. A result cannot consume round 4 and then escalate. When remaining
budget is zero, the runner creates a human-escalation decision and leaves the best selected-valid
revision in place.

## Approval epoch

An approval epoch groups comparable revision work. A new epoch begins when any of these changes:

- canonical research facts, sources, or timeline;
- core story question;
- schema, prompt, or rubric version affecting the stage;
- an explicit human decision changes a protected constraint.

Starting an epoch resets automated revision counters only through an explicit workflow transition. It
does not erase history or make an old best revision valid against new inputs. Operational retries do
not start an epoch.

## Candidate workflow

1. Snapshot the selected and best ArtifactRefs.
2. Dispatch the deterministic route with issue IDs and constraints to preserve.
3. Validate candidate structure and verify input hashes.
4. Confirm every targeted issue has evidence of change.
5. Rerun the required downstream gates from [routing-policy.md](./routing-policy.md).
6. Detect regressions and oscillations.
7. Select the candidate only if all required gates and selection rules pass.
8. Otherwise retain or restore the prior best selected-valid revision.
9. Record ledger, workflow, and observability events atomically.

An agent cannot declare its own candidate best. The runner derives selection from valid critic
artifacts.

## Best-version tracking

Best is tracked per logical artifact and approval epoch. A candidate is eligible only when:

- all candidate artifacts and dependency hashes are valid;
- all issues assigned to the revision are resolved with before/after hashes;
- protected constraints remain satisfied;
- all required hard gates pass;
- no regression rule fires;
- critic versions match the baseline versions.

For comparable candidates, selection uses Pareto dominance rather than a blended aesthetic score:

```text
candidate dominates best when:
  no hard gate or protected metric is worse,
  no regression threshold is crossed,
  and at least one targeted issue, dimension, or deterministic metric is strictly better.
```

If neither revision dominates the other, the runner keeps the current best and asks for human
selection only if the workflow cannot progress without choosing. It MUST NOT average unrelated
dimensions or use cost/token usage as quality tie-breakers.

When the previous best is stale because canonical inputs changed, it remains the historical best but
is not eligible for selection. The first candidate that passes all current hard gates becomes the best
for the new epoch.

## Regression detection

Every revision compares before and candidate results using the same rubric version and baseline.

### Hard regression

Any one of these rejects the candidate:

- a PASS becomes REJECT;
- a new blocker or high issue appears;
- a protected Claim, source identity, metric scope, causality boundary, rights basis, duration limit,
  or final format is broken;
- a previously resolved issue reopens at the same artifact locator;
- Fact Guardian or Delivery Critic changes any binary dimension from pass to fail;
- reviewed artifact hashes are stale or a gate becomes invalid.

### Score regression

These thresholds create a regression record even if the candidate remains above the overall pass
threshold:

| Critic           | Regression threshold                                                                    |
| ---------------- | --------------------------------------------------------------------------------------- |
| Oral Judge       | Any dimension decreases by >= 1 point.                                                  |
| Audience Critic  | Any dimension decreases by >= 2 points, total decreases by >= 3, or a floor is crossed. |
| Retention Critic | Any window decreases by >= 3 points, total decreases by >= 4, or a floor is crossed.    |
| Fact Guardian    | Any binary dimension changes from pass to fail.                                         |
| Delivery Critic  | Any binary dimension changes from pass to fail or a deterministic metric worsens past   |
|                  | its hard threshold.                                                                     |

A smaller decline is recorded as drift. It prevents Pareto dominance but does not by itself create a
hard regression. Selection therefore remains conservative without pretending every one-point model
variation is a product failure.

### Constraint regression

Each issue's `constraintsNotToBreak` becomes an executable comparison set. A candidate MUST cite the
new artifact evidence for each constraint. Missing evidence fails the candidate; silence does not
mean preservation.

## No-progress detection

A revision is no-progress when:

- every candidate output hash equals its corresponding before hash;
- the targeted issue remains open with identical evidence;
- only report scores or prose changed while the affected artifact did not;
- the suggested correction was restated but no acceptance check changed from fail to pass.

No-progress consumes the applicable valid revision round because the agent produced a valid but
ineffective domain attempt. It can never change REJECT to PASS.

## Oscillation detection

The runner examines artifact hashes, issue states, and category/owner pairs within the approval epoch.

| Signature        | Detection rule                                                                     |
| ---------------- | ---------------------------------------------------------------------------------- |
| Hash cycle       | Selected/candidate sequence repeats `A -> B -> A` or returns to any rejected hash. |
| Issue cycle      | The same issue/locator changes `open -> resolved -> open`.                         |
| Correction cycle | Fixing issue A recreates issue B, then fixing B recreates A at the same locators.  |
| Route cycle      | Primary routes alternate between the same two owners without a new input hash.     |

The first signature creates an oscillation warning and keeps the best version. A second oscillation
signature in the same approval epoch, or any repeated `A -> B -> A -> B`, immediately escalates to a
human even if nominal round budget remains.

Changing only rubric/prompt version starts a new baseline and is not called oscillation, but requires
explicit migration and replay.

## Rejection and restoration

When a candidate regresses, oscillates, or fails its required gates:

- mark candidate revisions `rejected`;
- retain their bytes and evaluation references for audit;
- restore the prior best only when all its current dependency hashes still match;
- otherwise keep workflow `in-progress` with no false selected-valid artifact;
- route the remaining issue if budget remains; otherwise escalate.

Restoration is a pointer/canonical-file promotion, not history rewriting. The runner MUST NOT use
destructive Git reset or silently discard user edits.

## Human escalation artifact

Escalation MUST record:

```ts
type HumanEscalation = {
  schemaVersion: "human-escalation-v1";
  episodeId: string;
  reason:
    | "budget-exhausted"
    | "oscillation"
    | "unroutable"
    | "constraint-conflict"
    | "rights-authority-required";
  openIssueIds: string[];
  selectedBestRefs: ArtifactRef[];
  rejectedCandidateRefs: ArtifactRef[];
  decisionNeeded: string;
  forbiddenAutomaticActions: string[];
};
```

The artifact contains references and a concise decision request, not full content. While escalation is
open, automated editorial production is paused. A human decision may select a revision, change a
constraint, approve a new epoch, or stop the episode; it may not retroactively alter audit history.

## Existing workflow compatibility

- Existing Oral Judge and creative three-round limits remain unchanged.
- Current `previousReview`, `resolvedFeedback`, and before/after hashes in retention reports are valid
  revision evidence.
- Current `reviewCycles` in `story/workflow.json` remain valid control records.
- The future ledger adds immutable history and best pointers; it does not replace canonical episode
  artifact paths or require LangGraph.
