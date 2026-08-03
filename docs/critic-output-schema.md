# Critic Output Schema

- Status: normative engineering contract
- Schema: `critic-output-v1`

## Scope

This schema normalizes results from:

- Oral Judge
- Audience Critic
- Fact Guardian
- Retention Critic
- Delivery Critic

It is designed for deterministic routing. Natural-language report bodies remain useful for editors,
but an orchestrator MUST consume only the leading JSON gate.

## Storage and compatibility

The current report paths and gate markers remain unchanged:

| Critic           | Artifact                               | Existing marker    | Existing rubric version |
| ---------------- | -------------------------------------- | ------------------ | ----------------------- |
| Oral Judge       | `story/oral-review.md`                 | `oral-review-gate` | `oral-review-v1`        |
| Audience Critic  | `story/critic-report.md`               | `critic-gate`      | `product-story-v4`      |
| Fact Guardian    | `story/fact-check-report.md`           | `fact-check-gate`  | `fact-guardian-v1`      |
| Retention Critic | `story/retention-report.md`            | `retention-gate`   | `retention-critic-v2`   |
| Delivery Critic  | `production/delivery-critic-report.md` | `delivery-gate`    | `delivery-critic-v1`    |

`critic-output-v1` is an additive envelope inside the existing marker. Existing required fields such
as `reviewedSha256`, legacy `scores`, `verdict`, and `returnTo` MUST remain until their validators are
migrated. Current Zod readers may ignore the additional fields.

The JSON gate is canonical. The Markdown below it MUST NOT introduce additional open issues, change
severity, or imply a different verdict.

## Common result

Each gate MUST add these fields:

```ts
type CriticResult = {
  schemaVersion: "critic-output-v1";
  episodeId: string;
  executionId: string;
  critic: CriticName;
  round: number;
  rubricVersion: string;
  reviewedArtifacts: ArtifactRef[];
  evaluation: EvaluationResult;
  issues: CriticIssue[];
  blockers: string[]; // blocker issue IDs, not duplicated prose
  verdict: "PASS" | "REJECT";
  primaryRoute: Route | null;
  returnTo: string; // current legacy route target
};
```

Rules:

- `reviewedArtifacts` contains every artifact whose content affected the verdict, not merely the
  main script or video.
- `round` is monotonically increasing per critic and rubric version for the episode.
- `blockers` is the set of issue IDs whose effective severity blocks PASS.
- `primaryRoute` is `null` on PASS. On REJECT it is computed by
  [routing-policy.md](./routing-policy.md), never authored from prose.
- Legacy `returnTo` MUST equal `primaryRoute.routeTarget` when the existing gate enum supports that
  target, or use the fixed compatibility mapping in [routing-policy.md](./routing-policy.md). It is
  `none` when the route is null. Future orchestration consumes `primaryRoute`, not legacy `returnTo`.
- PASS requires all issues to be `resolved` or informational and all critic-specific thresholds to
  pass.

## Critic issue

Every issue has all requested routing and correction data:

```ts
type CriticIssue = {
  id: string;
  category: IssueCategory;
  severity: "info" | "low" | "medium" | "high" | "blocker";
  status: "open" | "resolved" | "waived";
  ownerAgent: AgentOwner;
  routeTarget: RouteTarget;
  affectedArtifact: {
    artifactId: string;
    path: string;
    sha256: string;
    locator: {
      kind:
        | "json-pointer"
        | "line-range"
        | "segment"
        | "claim"
        | "time-range"
        | "srt-cue"
        | "whole-artifact";
      value: string;
    };
  };
  evidence: Array<{
    kind:
      | "artifact-observation"
      | "cross-artifact-diff"
      | "claim-check"
      | "metric"
      | "playback-observation";
    artifactRef?: ArtifactRef;
    locator?: string;
    observed: string;
    expected: string;
    claimIds: string[];
  }>;
  suggestedCorrection: {
    objective: string;
    acceptanceChecks: string[];
  };
  constraintsNotToBreak: Array<{
    id: string;
    description: string;
    artifactRefs: ArtifactRef[];
    claimIds: string[];
  }>;
  sourceIssueId?: string;
};
```

### Issue rules

- IDs use `issue-<critic>-r<round>-<two-digit-sequence>` and are immutable.
- `ownerAgent` is the accountable executor. `routeTarget` is the current workflow checkpoint or
  production stage. For creative issues the two normally have the same identifier.
- Delivery issues use `ownerAgent=production-executor` and one of `captions`, `timeline`, `tts`, or
  `render` as `routeTarget`.
- `affectedArtifact.sha256` MUST be one of `reviewedArtifacts`, unless the issue is
  `contract.invalid-output` against the report itself.
- `locator` MUST be precise enough for a deterministic fixture to find the affected content. A label
  such as `middle` or `somewhere in the hook` is invalid.
- `evidence` MUST contain at least one observed-versus-expected record. `evidence` cannot be only an
  opinion such as “pace is weak.”
- `suggestedCorrection.objective` describes the required outcome, not replacement copy. At least one
  acceptance check MUST be machine-testable or human-checkable against a named artifact.
- `constraintsNotToBreak` MUST contain at least one protected fact, Claim, gate, duration, ownership,
  or tone constraint. An empty array is invalid.
- `waived` requires an external human decision artifact and MUST NOT be set by a critic or runner.
- A later report resolves an issue by retaining its ID in revision evidence. It MUST NOT delete or
  rename the historical issue.

## Controlled issue categories

Free-form categories are forbidden.

```text
contract.invalid-output
contract.stale-input

research.evidence-gap
research.source-conflict
research.claim-ledger-error

story.core-question
story.unsupported-premise
story.structure
story.information-progression
story.ending-payoff

attention.hook
attention.curiosity-gap
attention.reveal-order
attention.emotional-tension

script.information-selection
script.claim-binding
script.fact-accuracy
script.repetition

oral.naturalness
oral.spoken-delivery
oral.information-fidelity

visual.evidence
visual.asset-rights
visual.readability
visual.pacing
visual.safe-area

retention.first-3-seconds
retention.first-30-seconds
retention.mid-video
retention.ending

delivery.caption-split
delivery.caption-timing
delivery.audio
delivery.timeline
delivery.duration-audio
delivery.duration-timeline
delivery.duration-render
delivery.format
delivery.render
delivery.evidence-readability
delivery.asset-manifest
```

Adding a category is a schema-version change and requires a routing-table update in the same change.

## Owner and route enumerations

```ts
type AgentOwner =
  | "research-analyst"
  | "story-director"
  | "viral-director"
  | "script-writer"
  | "oral-rewriter"
  | "oral-judge"
  | "audience-critic"
  | "fact-guardian"
  | "visual-director"
  | "retention-critic"
  | "delivery-critic"
  | "production-executor";

type RouteTarget = AgentOwner | "human-editor" | "captions" | "timeline" | "tts" | "render";
```

Critics are not owners of editorial corrections because they do not fix the artifacts they assess.
A critic may be `ownerAgent` only for `contract.invalid-output` or `contract.stale-input`, which means
rerun that same critic after operational recovery; it does not consume creative revision budget.

## Evaluation result

```ts
type EvaluationResult = {
  dimensions: Array<{
    id: string;
    score: number;
    maxScore: number;
    weight: number; // normalized weight, dimensions sum to 1
    evidenceIssueIds: string[];
  }>;
  rawTotal: number;
  normalizedTotal: number; // 0..100
  threshold: number; // normalized 0..100
  dimensionFloors: Record<string, number>;
  passedThresholds: boolean;
};
```

Dimension IDs, maxima, weights, anchors, floors, and blockers are fixed by
[evaluation-rubric.md](./evaluation-rubric.md). `rawTotal`, `normalizedTotal`, and
`passedThresholds` MUST be recomputed by validation rather than trusted from model output.

## Route

```ts
type Route = {
  ownerAgent: AgentOwner;
  routeTarget: RouteTarget;
  restartAt: string;
  reasonCode: IssueCategory;
  issueIds: string[];
};
```

All open issues for the selected owner and restart boundary are batched in `issueIds`. The route is
derived from issue categories, severity, affected artifact provenance, and fixed precedence. The
critic may populate issue data, but it cannot choose a different route.

## JSON Schema core

The following schema is the normative common core. Critic-specific legacy fields are added by the
profiles below.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://productionagent.local/schemas/critic-output-v1.json",
  "type": "object",
  "required": [
    "schemaVersion",
    "episodeId",
    "executionId",
    "critic",
    "round",
    "rubricVersion",
    "reviewedArtifacts",
    "evaluation",
    "issues",
    "blockers",
    "verdict",
    "primaryRoute",
    "returnTo"
  ],
  "properties": {
    "schemaVersion": {"const": "critic-output-v1"},
    "episodeId": {"pattern": "^episode-[a-z0-9-]+$"},
    "executionId": {"type": "string", "minLength": 1},
    "critic": {
      "enum": [
        "oral-judge",
        "audience-critic",
        "fact-guardian",
        "retention-critic",
        "delivery-critic"
      ]
    },
    "round": {"type": "integer", "minimum": 1},
    "rubricVersion": {"type": "string", "minLength": 1},
    "reviewedArtifacts": {"type": "array", "minItems": 1, "items": {"$ref": "#/$defs/artifactRef"}},
    "evaluation": {"$ref": "#/$defs/evaluation"},
    "issues": {"type": "array", "items": {"$ref": "#/$defs/issue"}},
    "blockers": {"type": "array", "uniqueItems": true, "items": {"type": "string"}},
    "verdict": {"enum": ["PASS", "REJECT"]},
    "primaryRoute": {"oneOf": [{"type": "null"}, {"$ref": "#/$defs/route"}]},
    "returnTo": {"type": "string", "minLength": 1}
  },
  "$defs": {
    "sha256": {"type": "string", "pattern": "^[a-f0-9]{64}$"},
    "artifactRef": {
      "type": "object",
      "required": [
        "artifactId",
        "episodeId",
        "path",
        "mediaType",
        "schemaVersion",
        "revision",
        "sha256",
        "sizeBytes",
        "producer",
        "createdAt"
      ],
      "properties": {
        "artifactId": {"type": "string", "minLength": 1},
        "episodeId": {"type": "string", "minLength": 1},
        "path": {"type": "string", "minLength": 1},
        "mediaType": {"type": "string", "minLength": 1},
        "schemaVersion": {"type": "string", "minLength": 1},
        "revision": {"type": "integer", "minimum": 1},
        "sha256": {"$ref": "#/$defs/sha256"},
        "sizeBytes": {"type": "integer", "minimum": 0},
        "producer": {"type": "string", "minLength": 1},
        "createdAt": {"type": "string", "format": "date-time"}
      },
      "additionalProperties": false
    },
    "evaluation": {
      "type": "object",
      "required": [
        "dimensions",
        "rawTotal",
        "normalizedTotal",
        "threshold",
        "dimensionFloors",
        "passedThresholds"
      ],
      "properties": {
        "dimensions": {"type": "array", "minItems": 1},
        "rawTotal": {"type": "number", "minimum": 0},
        "normalizedTotal": {"type": "number", "minimum": 0, "maximum": 100},
        "threshold": {"type": "number", "minimum": 0, "maximum": 100},
        "dimensionFloors": {"type": "object", "additionalProperties": {"type": "number"}},
        "passedThresholds": {"type": "boolean"}
      },
      "additionalProperties": true
    },
    "issue": {
      "type": "object",
      "required": [
        "id",
        "category",
        "severity",
        "status",
        "ownerAgent",
        "routeTarget",
        "affectedArtifact",
        "evidence",
        "suggestedCorrection",
        "constraintsNotToBreak"
      ],
      "properties": {
        "id": {"pattern": "^issue-[a-z0-9-]+-r[0-9]+-[0-9]{2}$"},
        "category": {"type": "string", "minLength": 1},
        "severity": {"enum": ["info", "low", "medium", "high", "blocker"]},
        "status": {"enum": ["open", "resolved", "waived"]},
        "ownerAgent": {"type": "string", "minLength": 1},
        "routeTarget": {"type": "string", "minLength": 1},
        "affectedArtifact": {"type": "object"},
        "evidence": {"type": "array", "minItems": 1},
        "suggestedCorrection": {"type": "object"},
        "constraintsNotToBreak": {"type": "array", "minItems": 1},
        "sourceIssueId": {"type": "string"}
      },
      "additionalProperties": false
    },
    "route": {
      "type": "object",
      "required": ["ownerAgent", "routeTarget", "restartAt", "reasonCode", "issueIds"],
      "properties": {
        "ownerAgent": {"type": "string"},
        "routeTarget": {"type": "string"},
        "restartAt": {"type": "string"},
        "reasonCode": {"type": "string"},
        "issueIds": {
          "type": "array",
          "minItems": 1,
          "uniqueItems": true,
          "items": {"type": "string"}
        }
      },
      "additionalProperties": false
    }
  },
  "additionalProperties": true
}
```

The common schema deliberately permits additive legacy fields at the top level. Implementations MUST
also validate the detailed TypeScript constraints above and the critic profile below; the abbreviated
JSON Schema objects for `evaluation`, `issue`, and `route` are not permission to omit their fields.

## Critic profiles

### Oral Judge profile

Required legacy fields remain `reviewedFile`, `reviewedSha256`, `sourceDraftFile`,
`sourceDraftSha256`, three 0..5 `scores`, `minimumScore=4`, and `styleSamples`.

Allowed issue families are `contract.*`, `script.information-selection`, `script.fact-accuracy`, and
`oral.*`. Factual drift introduced during rewriting uses `oral.information-fidelity`; an error already
present in the draft uses `script.fact-accuracy`. A third failed round MUST route to `human-editor`.

### Audience Critic profile

Required legacy fields remain the seven weighted `scores`, `hookBreakdown`, `total`,
`threshold=85`, `viewerExitRisks`, and `rewriteRequired`.

Every legacy viewer-exit risk MUST correspond one-to-one with a structured issue. Its legacy
`feedback-*` ID is stored as `sourceIssueId` until the report format is fully migrated.

### Fact Guardian profile

Required legacy fields remain `reviewedFile`, `reviewedSha256`, `checkedSegments`,
`checkedNarrationUnits`, `blockers`, `verdict`, and `returnTo`.

Each segment and narration unit MUST be accounted for in evaluation evidence. Every open issue is a
hard failure; Fact Guardian has no warning-only path for an unsupported broadcast fact.

### Retention Critic profile

Required legacy fields remain both reviewed artifact hashes, four 0..25 `scores`, `windows`, `total`,
`threshold=80`, `viewerExitRisks`, `previousReview`, and `resolvedFeedback`.

`resolvedFeedback` MUST map each prior open issue to before/after ArtifactRefs. Reusing a prior hash
cannot resolve an issue.

### Delivery Critic profile

Required legacy fields remain the three reviewed paths/hashes, measured caption metrics, playback
booleans, `blockers`, `verdict`, and the production-stage `returnTo`.

Every delivery issue uses `ownerAgent=production-executor`. Measurements derived from SRT, timeline,
inspection, or ffprobe MUST be recomputed by validation. Human playback observations must include a
time-range locator and named acceptance check.

## Verdict consistency

A report is invalid when any of these is true:

- PASS with a failed threshold, failed dimension floor, open blocking issue, or non-null route;
- REJECT with no open issue or no route;
- `blockers` references a missing or resolved issue;
- a high/blocker issue is omitted from `blockers` where the rubric makes it blocking;
- `returnTo` conflicts with the deterministic primary route or its documented legacy mapping;
- reviewed hashes do not match current bytes;
- the same issue ID appears with changed category, affected artifact, or original evidence;
- a Markdown statement contradicts the JSON gate.

Invalid reports follow the invalid-output policy and MUST NOT trigger creative revision.
