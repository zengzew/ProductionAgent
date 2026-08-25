# Evaluation Rubric

- Status: normative engineering contract
- Rubric family: `engineering-evaluation-v1`

## Scoring rules shared by all critics

Scores are decision inputs, not decoration. Validators MUST recompute totals, weights, floors, and
blocker consistency from the machine gate.

1. A dimension score MUST cite at least one reviewed artifact locator or issue ID.
2. Scores use the anchors in this document. A critic may choose an integer between anchors only when
   its evidence explains why both neighboring anchors are inaccurate.
3. Missing evidence receives the lower anchor. The model does not receive benefit of the doubt.
4. A blocker overrides the numeric total.
5. A dimension below its floor rejects the result even when the total passes.
6. Scores from different `rubricVersion` values are not directly comparable.
7. A retry over unchanged artifact hashes must reproduce the same deterministic measurements. A
   subjective score change without new evidence is evaluation drift and cannot close an issue.

Normalized score is:

```text
sum((dimension score / dimension maximum) * dimension weight) * 100
```

Weights sum to 1. Where existing reports already sum directly to 100, normalized and raw totals are
equal.

## Severity standard

| Severity  | Standard                                                                                         |
| --------- | ------------------------------------------------------------------------------------------------ |
| `info`    | No correction required; records a useful observation and never changes verdict.                  |
| `low`     | Local quality imperfection; product meaning and current gate remain intact.                      |
| `medium`  | Clear correction required before downstream production unless the rubric explicitly allows PASS. |
| `high`    | Likely audience loss, serious misunderstanding, or material production defect; blocks PASS for   |
|           | Audience and Retention critics.                                                                  |
| `blocker` | Violates fact, contract, rights, duration, format, safety, or a critic-specific hard rule.       |

The same observed defect MUST retain severity across reruns under the same rubric. Severity changes
require changed evidence or an explicit rubric migration.

## Oral Judge

The current rubric is `oral-review-v2`. Existing `oral-review-v1` reports remain parseable as
immutable historical artifacts, but new reviews MUST use v2. Scores from v1 and v2 are not directly
comparable.

| Dimension            | Max | Weight | Floor |
| -------------------- | --- | ------ | ----- |
| Chinese naturalness  | 5   | 1/3    | 4     |
| Spoken delivery      | 5   | 1/3    | 4     |
| Information fidelity | 5   | 1/3    | 4     |

PASS requires every dimension >= 4, no blocker, and normalized score >= 80. The per-dimension floor
is controlling; a 5 cannot compensate for a 3.

### Oral score anchors

| Dimension            | 5                                                                                       | 4                                                                                               | 3                                                                                   | 0-2                                                                                 |
| -------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Chinese naturalness  | Chinese-native order throughout; sources, people, and product stages sound like speech. | One or two local imperfections, with no archive wording, literal stage translation, or blocker. | Repeated written, translated, or record-like phrasing requires rewrite.             | Multiple sections are unnatural, ambiguous, or cannot be understood without repair. |
| Spoken delivery      | Varied cadence; each sentence carries one idea; turns and pauses are immediately clear. | A local rhythm issue exists, but breath, address, and direction remain clear.                   | Repeated cadence, unclear turn direction, or breath repair is required.             | The script cannot be read naturally at the configured pace.                         |
| Information fidelity | Every person, action, fact, source level, Claim, and uncertainty boundary is unchanged. | Expression changes are harmless and every source/Claim boundary remains intact.                 | At least one wording choice risks changing audience judgment and requires checking. | A fact, scope, source identity, causality, authorization boundary, or Claim drifts. |

Missing evidence receives the lower anchor. Scores 0, 1, and 2 distinguish scope: 2 means multiple
affected sections, 1 means most of the script fails, and 0 means the artifact is missing,
unreviewable, or directly contradicts the contract.

### Oral Judge v2 calibration fixtures

`oral-judge-calibration-v1` clarifies the existing v2 anchors; it does not change the 4/5 floors,
the blocker rules, or the rubric and Prompt identifiers. Judge the exact candidate sentence before
using the draft to confirm intent. A low-severity observation is not automatically a failed check.

Use this decision boundary in order:

1. If two grammatically plausible readings change a date, statistics window, metric, source,
   causality, or authorization boundary, fail `informationFidelity`. Overall preference or an
   inferable intended reading cannot waive this failure.
2. Otherwise, if a first-time listener must insert or replace the subject to recover who performs
   the action, fail `translatedSyntax`.
3. Otherwise, a local awkward collocation or pause may lower naturalness or delivery to 4 while the
   relevant check remains `PASS`. Record the exact phrase as a low-severity observation without a
   blocker.

| Fixture ID                         | Exact candidate                                                                             | Stable classification                                                                                   |
| ---------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `local-awkwardness-non-blocking`   | 如果你想把这套用法发给朋友，Poke 会把背景设定、开场白和要连接的服务，收进一个 Recipe 链接。 | 4/4/5; all checks `PASS`; no blocker; verdict `PASS`. The object-side comma is local awkwardness only.  |
| `listener-must-repair-subject`     | 如果这套用法想发给朋友，Poke 会把它收进一个 Recipe 链接。                                   | 3/4/5; `translatedSyntax` `FAIL`; blocker; verdict `REJECT`. The listener must supply “你想把”.         |
| `time-window-attachment-ambiguity` | 收购前大约三个月，Cognition 说，用户和 Poke 已经发了一亿多条消息。                          | 4/4/3; `informationFidelity` `FAIL`; blocker; verdict `REJECT`. The time can modify two different acts. |

The executable mirror lives at `tests/fixtures/oral-judge-calibration.json`. Repeating a review over
the same draft, candidate, rubric, and Prompt must preserve each fixture's failed checks and verdict.
Changing a fixture classification requires an explicit rubric migration, not a reviewer preference.

### Mandatory v2 checks

Every check records at least one reviewed locator and observation in `checks.<name>.evidence`.
Representative PASS evidence is required; a generic statement without a segment, Claim, or exact
phrase locator is not evidence.

| Check                       | PASS standard                                                                                                     |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `translatedSyntax`          | No sustained English subject order, long translated modifier, abstract verb-object stack, or manual-like listing. |
| `sourceAttributionLanguage` | People and feedback use normal Chinese identities/actions; research-file labels do not replace the story action.  |
| `productStageLanguage`      | Beta/release/availability terms become a sourced identity or user-visible change, not a literal status label.     |
| `turnDirection`             | “仍、却、反而、不过”等词的预期落差明确；中性授权或核对步骤不被误读成褒贬判断。                                    |
| `sentenceCadence`           | Sentence lengths and structures vary without poster-like fragments, uniform beats, or fake conversational ticks.  |
| `spokenBreath`              | Punctuation follows real pauses; one sentence does not require two consecutive breaths at target pace.            |
| `informationFidelity`       | Draft, final script, Claim IDs, source level, metrics, chronology, causality, and authorization boundary agree.   |

PASS requires every mandatory check to be `PASS`. `FAIL` means a correction is required for
first-pass comprehension or information fidelity; it is not a synonym for any imperfection. Any
`FAIL` is a blocker and must name the minimum required correction. Automatic failures include:

- using labels such as “独立体验者”, “访谈里”, or “在那篇体验里” in place of a concrete speaker
  or action;
- reading `Beta users` or `general availability` as “Beta 用户” or “一般可用状态” instead of a
  Claim-supported Chinese identity or user-visible change;
- using “仍、却、反而、不过” with no clear expectation and direction;
- changing a fact, number, date, causality, source identity, authorization boundary, metric, Claim,
  or uncertainty level;
- adding an unsupported person, scene, motive, result, or life detail;
- replacing a Claim-supported ending with a generic question or future doubt.

A third failed round routes to `human-editor` regardless of numeric score. `oral-review-v1` has no
v2 check evidence and therefore cannot be upgraded or selected as a v2 result by reinterpretation.

## Audience Critic

Rubric version remains `product-story-v4`.

| Dimension              | Max | Weight | Floor |
| ---------------------- | --- | ------ | ----- |
| Hook                   | 15  | 0.15   | 9     |
| Conflict               | 15  | 0.15   | 9     |
| Human element          | 10  | 0.10   | 6     |
| Product clarity        | 15  | 0.15   | 9     |
| Growth logic           | 15  | 0.15   | 9     |
| Technology explanation | 15  | 0.15   | 9     |
| Natural Chinese        | 15  | 0.15   | 9     |

PASS requires total >= 85, every floor met, no high/blocker issue, and no hard blocker below.

### Audience percentage anchors

Apply these anchors to each dimension maximum, then round only to a permitted integer score:

| Percent | Standard                                                                                       |
| ------- | ---------------------------------------------------------------------------------------------- |
| 100%    | Requirement is explicit, easy to locate, supported by evidence, and sustained through the cut. |
| 80%     | Requirement works; one local weakness does not change comprehension or continuation.           |
| 60%     | Core requirement is present but fragile, delayed, or partially repetitive. This is the floor.  |
| 40%     | Viewers need inference or prior context; revision is required.                                 |
| 0%      | Missing, contradicted, or impossible to evaluate.                                              |

### Dimension standards

| Dimension              | Full-credit evidence                                                                                    | Automatic dimension failure                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Hook                   | First frame shows a changed state/action; 0-3 seconds are zero-context clear; by 20 seconds a relevant  | Core action appears after 3 seconds, or 20-second continuation question is absent.            |
|                        | continuation question exists.                                                                           |                                                                                               |
| Conflict               | One product tension explains user experience and advances toward a sourced answer without manufactured  | Conflict is a generic crisis, unsupported reversal, or future doubt unrelated to product use. |
|                        | crisis.                                                                                                 |                                                                                               |
| Human element          | A sourced person/user performs visible actions whose choices connect to product behavior.               | Invented protagonist/action, or no observable human action.                                   |
| Product clarity        | By 20 seconds, a zero-context viewer can say what it does/where it is used; each later concept solves a | Product remains a list of names/features, or requires brand knowledge to parse.               |
|                        | previously shown need.                                                                                  |                                                                                               |
| Growth logic           | Metric definition, period, source identity, and sequence are explicit; scale is not converted to cause, | Messages become users/retention/revenue, or chronology is stated as causality.                |
|                        | retention, or revenue.                                                                                  |                                                                                               |
| Technology explanation | Technical detail changes visible experience, permission, cost, or distribution and is explained in      | Unsupported architecture or unexplained jargon becomes the story.                             |
|                        | ordinary language.                                                                                      |                                                                                               |
| Natural Chinese        | Spoken Chinese is direct, varied, attributable, and free from report/translation templates.             | Translation/report tone dominates, or sources/data gaps are narrated as the story.            |

Hook is independently split:

| Hook component                | Max | Anchors                                                                            |
| ----------------------------- | --- | ---------------------------------------------------------------------------------- |
| Zero-background comprehension | 8   | 8 clear by 3s; 6 clear with minor label dependence; 4 delayed/ambiguous; 0 absent. |
| Continuation question         | 7   | 7 relevant by 20s; 5 present but generic; 3 weak/product-insider; 0 absent.        |

The two hook components MUST sum to the Hook score.

Audience blockers include unsupported fact or causality, fabricated person/motive/result, strong fact
without feasible synchronous evidence, first 20 seconds without a product mental model, a story event
that cannot reconnect to product choice and user-visible result, explicit source attribution more than
twice, generic CTA ending, unsupported market outcome, and every `high` viewer-exit issue.

### Goal 3.2 Audience evidence calibration

`editorial-policy-v1` clarifies how to apply the existing dimensions; it does not change
`product-story-v4`, its weights, floors, threshold, blockers, or routes.

- A result-led Hook earns credit when the action is zero-context clear and synchronous evidence has a
  distinct job. Multiple amounts, screenshots, or labels repeating the same claim do not add evidence.
- Product clarity and growth logic should expose a traceable need -> product action -> user-visible
  result -> distribution action -> measured-result chain. Chronology remains chronology unless Claims
  support causality.
- Interviews, comments, product UI, distribution material, and result graphics count only when source,
  context, readability, and the current proposition match. Their quantity or cut rate does not earn
  credit.
- A closing model earns credit only when every link was established earlier and the opening action now
  carries new meaning. A generic market, wealth, or engagement question is not payoff.

## Fact Guardian

Rubric version remains `fact-guardian-v1`. This is a binary weighted rubric: a dimension receives its
full weight only when every checked unit passes; otherwise it receives zero and emits at least one
blocker issue.

| Dimension                    | Weight | Pass standard                                                                            |
| ---------------------------- | ------ | ---------------------------------------------------------------------------------------- |
| Claim coverage               | 0.25   | Every segment/unit binds existing, narration-allowed Claims.                             |
| Semantic fidelity            | 0.25   | Wording preserves Claim meaning, strength, actor, result, and uncertainty.               |
| Source identity/attribution  | 0.15   | Company, founder, independent report, and editorial analysis remain distinct.            |
| Metric and time scope        | 0.15   | Definition, value, period, event date, and first/open/growth events are not conflated.   |
| Causality/inference boundary | 0.10   | Chronology is not upgraded to cause; motives, architecture, and attribution not guessed. |
| Visual truth boundary        | 0.10   | Real page, official footage, programmatic graphic, and demonstration are represented     |
|                              |        | consistently with the Claim and asset basis.                                             |

Threshold is 100. Every dimension floor is its full weight. Any open factual issue is a blocker and
REJECTS regardless of how many other units pass. This deliberately prevents a high average from
masking one unbroadcastable sentence.

The validator MUST confirm `checkedSegments` and `checkedNarrationUnits` equal the current parsed
script counts. Missing coverage is `contract.invalid-output`, not a lower editorial score.

## Retention Critic

Rubric version remains `retention-critic-v2`.

| Window               | Max | Weight | Floor |
| -------------------- | --- | ------ | ----- |
| First 3 seconds      | 25  | 0.25   | 15    |
| First 30 seconds     | 25  | 0.25   | 15    |
| Mid-video engagement | 25  | 0.25   | 15    |
| Ending satisfaction  | 25  | 0.25   | 15    |

PASS requires total >= 80, every window >= 15, every window risk in `low|medium`, no high/blocker
issue, no unresolved prior feedback, and exact script/visual hashes.

### Retention anchors

| Score band | Observable standard                                                                               |
| ---------- | ------------------------------------------------------------------------------------------------- |
| 23-25      | Clear visual action and new information; no plausible exit point beyond normal audience variance. |
| 20-22      | Strong continuation with one specific low-risk weakness.                                          |
| 15-19      | Core promise is intact but a medium-risk delay, repetition, or readability problem exists.        |
| 6-14       | High-risk window; viewer lacks a reason, model, visible change, or payoff.                        |
| 0-5        | Missing, contradicted, or unreviewable window.                                                    |

Window standards:

- First 3 seconds: first frame already shows a result or changed state, object and action are
  understandable without the product name, and evidence can appear synchronously.
- First 30 seconds: the product mental model, curiosity gap, and viewer-relevant question are active.
- Mid-video: each 20-40 second span adds an action, evidence item, scale, choice, consequence, or
  changed judgment; the planned 60-90 second pace shift advances the same story.
- Ending: it answers the opening question with the same action now carrying new meaning, stops on a
  supported result/state/action, and has no generic CTA or unsupported future claim.

Any `high` window creates a high issue and blocker. A report cannot label the window low/medium while
containing a high issue in that time range.

### Goal 3.2 Retention evidence calibration

`editorial-policy-v1` clarifies the existing window observations; it does not change
`retention-critic-v2`, scores, floors, blockers, or routes.

- First 3 seconds: evaluate the understandable result/action, synchronous proof, and answerable open
  question—not headline size, money, or edit frequency.
- First 30 seconds: phase questions must receive timely evidence answers, and a concrete product input,
  operation, feedback, or rule must establish the mental model within the 40–80 second format.
- Mid-video: a sourced setback, reversal, or direction change is useful only when it changes viewer
  judgment. No reversal is required when the evidence does not support one; fabricated crisis and
  repeated emotional B-roll are risks.
- Visual density means new action, evidence, choice, scale, consequence, or judgment carried by the
  interview/product/need/distribution/result material. Cut count and animation are not retention proof.
- Ending: the opening action/result must gain meaning from the middle and resolve before any optional
  close. Market forecasts, generic wealth questions, and generic models cannot substitute for payoff.

## Compliance Critic

The rubric version is `compliance-critic-v1`. This is a binary system profile over the selected
narration and visual plan.

| Dimension            | Weight | Pass standard                                                                     |
| -------------------- | ------ | --------------------------------------------------------------------------------- |
| Platform policy      | 0.40   | No selected copy or visual violates an applicable platform publication rule.      |
| Advertising language | 0.35   | Claims and promotional wording avoid prohibited or unsupported advertising text.  |
| Brand safety         | 0.25   | Product, people, source labels, and visual context remain safe and non-deceptive. |

Threshold is 100 and every dimension floor is 1. Any open `compliance.*` issue is a blocker and
REJECTS the candidate. Scores are recomputed like Fact Guardian's binary profile; a passing dimension
cannot compensate for a failing one.

## Delivery Critic

Rubric version remains `delivery-critic-v1`. Like Fact Guardian, this is a binary weighted rubric.

| Dimension                      | Weight | Pass standard                                                                      |
| ------------------------------ | ------ | ---------------------------------------------------------------------------------- |
| Artifact integrity             | 0.15   | MP4, SRT, timeline paths/hashes match current selected artifacts.                  |
| Duration and vertical format   | 0.15   | ffprobe reads 1080x1920, 30 fps, and duration between 40 and 80 seconds.           |
| Caption integrity and timing   | 0.20   | No English/Chinese word split; micro-cue ratio <= 10%; cues align to narration.    |
| Audio intelligibility and sync | 0.15   | No swallowing, broken pronunciation, abnormal pause, clipping, or material desync. |
| First-frame comprehension      | 0.10   | Concrete zero-context action/result is understood within 3 seconds.                |
| Evidence, rights, readability  | 0.20   | Used assets match manifest/source/Claim, labels are visible, evidence readable.    |
| Render continuity/safe area    | 0.05   | No cut-off evidence, unsafe subtitle overlap, broken frame, or filler repetition.  |

Threshold is 100 and every dimension floor is its full weight. Any failed dimension emits a blocker
and routes to a production stage.

Machine measurements override estimates:

- final MP4 duration below `40.000` or above `80.000` seconds is a blocker;
- any English or Chinese word split is a blocker;
- micro cue means duration `< 1.0` second; ratio `> 0.10` is a blocker;
- wrong resolution, frame rate, orientation, missing stream, or stale hash is a blocker.

Playback observations are also hard blockers when they concern first-frame comprehension, speech
intelligibility/sync, source/evidence readability, missing source label, manifest mismatch, or a
generated interface presented as real. Each requires a time-range evidence locator.

## Score-to-verdict algorithm

Validators apply this order:

```text
1. Validate report schema and reviewed hashes.
2. Recompute deterministic metrics and all score arithmetic.
3. Verify each dimension has evidence and meets its floor.
4. Derive blockers from issues and critic-specific hard rules.
5. Derive deterministic route for every open issue.
6. PASS only if threshold/floors pass, blocker set is empty, and primaryRoute is null.
7. Otherwise REJECT only if at least one valid open issue and primaryRoute exist.
8. Any other combination is INVALID_OUTPUT, not PASS or REJECT.
```

## Rubric change control

Changing a dimension, weight, floor, anchor, threshold, or blocker condition requires:

1. a new immutable `rubricVersion`;
2. updated critic schema/profile;
3. updated routing and regression fixtures;
4. replay of golden reports under both old and new rubrics;
5. explicit declaration that cross-version score comparison is unsupported or a documented migration.

Prompt changes alone cannot change rubric meaning.
