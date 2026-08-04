# Episode 001 oral-review-v2 pilot 人工盲听结果

- Review date: `2026-08-04`
- Reviewer: `human-reviewer-user`
- Candidate SHA-256: `b6e7a27d5406539463e7640cc5478da3807c3fe5337392db12c334eb5d03e7cf`
- Canonical script SHA-256: `93b003ef17c77b413c10298c0d884e9f1fdd56cd36ee54d100ddad116121f9e2`
- Primary oral-review-v2 SHA-256: `cba2648087f81a91cce4c4d1f2872ffb8f3e793c8ac53d1f233221268bfa64ba`
- Secondary unselected review SHA-256: `dd19838f580b80a6f532251b7370e9472a85bdec2fc1c3e9fcdfb36eb43cfdd8`

## Blind response before reveal

| Question             | Human response     |
| -------------------- | ------------------ |
| Sample A naturalness | 3/5                |
| Sample B naturalness | 4/5                |
| More willing to hear | B, but not by much |
| Sounds more like AI  | A                  |
| Final choice         | B                  |

The reviewer did not provide phrase-level or timestamp-level observations. This result supports an
overall preference, but it cannot confirm whether either reviewer's local issue evidence was audible.

## Reveal

| Blind sample | Actual script                        |
| ------------ | ------------------------------------ |
| Sample A     | Current delivered canonical script   |
| Sample B     | New `oral-review-v2` pilot candidate |

The pilot candidate wins the blind naturalness comparison by one point. The advantage is real but
small, matching the reviewer's note that the difference was not large.

## Comparison with the sealed reviews

The primary independent review rejected Sample B at 3/4/3. It found two minimum corrections:

1. `seg-008` uses “如果这套用法想发给朋友”, which gives the desire to “这套用法” instead of
   the person sharing it.
2. `seg-003` places “收购前大约三个月” before “Cognition 说”, which can be heard as the
   disclosure time rather than the message statistics window.

The secondary unselected review passed the same bytes at 4/4/5. It noticed the `seg-008` phrase but
treated it as a local imperfection, and it did not identify the possible metric-window ambiguity.

The human preference for B validates the candidate's overall spoken delivery. It does not waive the
information-fidelity issue because the blind response contains no phrase-level evidence about the
three-month window. Under the repository's facts-first priority, the primary REJECT remains the
controlling release decision.

## Rubric finding

`oral-review-v2` improved issue discovery, but this pilot exposes inter-rater calibration drift. The
same candidate, hashes, rubric, and round produced opposite verdicts because the reviewers applied
different thresholds to a local syntax defect and a possible scope ambiguity.

Do not change the threshold from this single sample. Add calibration fixtures that distinguish:

- a local awkward phrase that lowers naturalness to 4 but does not change meaning;
- a phrase that makes the listener repair the subject and therefore fails `translatedSyntax`;
- a time or metric attachment ambiguity that fails `informationFidelity` even when the full script is
  preferred in a blind listen.

## Decision

Use Sample B as the basis for the next rewrite, but do not promote it as-is. Fix only `seg-003` and
`seg-008`, run `oral-review-v2` round 2 with the primary report as prior evidence, then blind-listen to
the affected clips. No orchestration migration is justified by this result.
