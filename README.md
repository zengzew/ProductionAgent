# AI Product Storytelling Studio

This repository builds sourced, repeatable Chinese AI product stories and
renders them as short videos with Remotion. Facts define what may be said;
director decisions define the audience promise, reveal order and visual rhythm.
Episode 001 follows Poke through its 2026 general release, product mechanics,
reported message volume and acquisition. Episode 002 follows Roost Social and
shows how a slow-message app turns waiting into a visible, playful experience.

The current manual episode pipeline produces one 9:16 video. Legacy Genspark
and landscape Poke packages are not part of this repository.

## Current execution boundary

The production path remains artifact-driven and manual: people or Codex tasks
update the source-of-truth files, then run the explicit validation, materialize,
TTS, timeline, render and review commands for each approved stage.
`ORCHESTRATOR=manual` is the default.

`src/orchestration/` is a real LangGraph-backed foundation, but it is not a
single command that crosses human approval boundaries. M1 and M2 are
exit-accepted: they provide the reference-only graph/checkpoint skeleton and
the bounded content evaluation, single-owner revision, best-version selection
and freeze foundation. WP-M3-01 adds opt-in deterministic adapters for the
existing production scripts, and WP-M3-02 adds an opt-in LangGraph production
subgraph with bounded delivery repair; artifact files remain the content source
of truth.

Formal `HumanDecision` handling, direct-edit locks, approval-epoch production
authorization, unfreeze, final approval, publication, production persistence
and M4 cache/observability hardening are not implemented. The production
subgraph starts from a current frozen content manifest, routes Delivery Critic
REJECTs through the deterministic production owner, and stops at
`production-ready` or human escalation; it does not add approval or publication
semantics. The default `ORCHESTRATOR=manual` path is unchanged. See
[`docs/production-adapters.md`](docs/production-adapters.md).

## Current editorial and duration standard

- Every episode uses a fact-backed, positive promotional tone. Product value,
  real usage, design choices and verified results lead the story.
- Risks, disputes and missing metrics appear only when they materially affect
  product understanding, factual accuracy or release compliance. They do not
  become the default story spine or ending.
- The last line lands on a claim-supported product state, user action or
  concrete result. It does not question the product's future.
- The final 1080×1920 MP4 targets 60 seconds with a ±20-second tolerance: the
  measured duration must land between 40 and 80 seconds. Validation uses the
  measured TTS timeline and the rendered file's ffprobe duration.

## Product-story short-video pipeline

The workflow uses eleven gated roles with file handoffs. The manual artifact
path remains their current production interface; the M1/M2 LangGraph foundation
orchestrates only its accepted subset without changing these responsibilities.
Each role reads the previous role's artifacts instead of turning research
directly into narration.

1. **Research Analyst** writes facts, sources, research chronology, technology
   boundaries and growth data. This role does not write story conclusions.
2. **Story Director** owns `director-brief.md`: one core question, the audience
   promise, sourced answer, fact boundary, emotional arc and reveal order. It
   then aligns the story bible and timed structure to that decision.
3. **Viral Director** designs and evaluates the opening hook, curiosity gap,
   emotional tension, reveal order and ending payoff before drafting begins.
4. **Script Writer** writes an information-complete `script-draft.md` from the
   approved structure and attention strategy. It does not approve its own draft.
5. **Oral Rewriter** independently turns the draft into natural spoken Chinese
   without adding or changing facts.
6. **Oral Judge** scores Chinese naturalness, spoken delivery and information
   fidelity, and records evidence for seven natural-Chinese checks. All scores must reach 4/5 and
   every check must pass, with at most three rewrite rounds.
7. **Audience Critic** scores Hook, Conflict, Human element, Product clarity,
   Growth logic, Technology explanation and Natural Chinese. Every likely exit
   point must explain why the viewer leaves, request a testable change and name
   the responsible role.
8. **Fact Guardian** independently checks every narration unit, attribution,
   metric, date and causal boundary. It does not rewrite. A failure routes back
   to Research Analyst, Story Director, Script Writer or Oral Rewriter.
9. **Visual Director** translates every approved narration segment into scene
   structure, visual evidence, animation, asset requirements and pacing.
10. **Retention Critic** predicts drop-off in the first 3 seconds, first 30
    seconds, middle and ending. A rejection routes back to the responsible
    creative role; the next review must bind the prior report and prove each
    resolved item with changed artifact hashes.
11. **Delivery Critic** reviews the rendered 9:16 MP4, SRT and measured TTS as a
    zero-context viewer. Word breaks, excessive sub-second cues, an opaque first
    frame or swallowed narration reject delivery.

`story/workflow.json` is the episode control artifact. It records the fixed role
order, current state, every major decision and owner, artifacts, review rounds,
feedback routes and closure status. LangGraph state and checkpoints carry
references; they do not replace these files as the source of truth.

Writing roles still support Codex file handoffs. The automated polish stage may
call a configured hosted LLM API. The project continues to exclude self-hosted
LLM and speech-model infrastructure.

The execution contract and copy-paste Codex prompts live in
[`agents/README.md`](agents/README.md). Audience Critic and Fact Guardian should
prefer fresh Codex tasks so the writer is not approving its own work.

The thesis formula is an editorial comparison tool, not permission to declare a
"real reason" that the research does not support. A turning point may be a
sourced interval of change. When research only supports sequence, the story
uses sequence.

The canonical Poke pre-production package is:

```text
content/episode-001/
  research/
    facts.json
    sources.json
    timeline.json
    technology.md
    growth-data.md
  story/
    director-brief.md
    story-bible.md
    story-angle.md
    three-act-structure.md
    hook-candidates.md
    viral-strategy.md
    script-draft.md
    final-script.md
    oral-review.md
    caption-plan.json
    critic-report.md
    fact-check-report.md
    visual-plan.md
    retention-report.md
    reviews/
    workflow.json
  production/
    delivery-critic-report.md
    comparison-report.md
```

`facts.json` is the Claim Ledger. `timeline.json` is the research chronology;
it is separate from `production/timeline.json`, which is generated later from
measured audio. `script-draft.md` is the information draft.
`final-script.md` is the spoken rewrite and is structured so the production
phase can materialize `script.json`; `oral-review.md` binds both files by
SHA-256.
`caption-plan.json` keeps complete Chinese semantic units in one timed cue,
using at most two simultaneous lines. Existing production artifacts remain the
previous snapshot until that phase starts.

`director-brief.md` binds the audience-facing decisions to the current research
hashes. `viral-strategy.md` binds its attention design to that brief and the
current story inputs.
`visual-plan.md` binds one executable visual treatment to every final-script
segment. `retention-report.md` binds its four-window drop-off prediction to the
exact final script and visual plan. `workflow.json` verifies ownership and
revision closure. All four are required before production can start.

## Official product evidence

When a product has a public official website, app-store listing, official
in-app screenshots, launch video or traceable real interaction recording that
materially explains the story, each episode should use at least one real
official product visual. Prefer the evidence type that proves the core action
most directly instead of defaulting to a static screenshot.

- Use a traceable official URL; do not treat marketing copy as independent
  evidence.
- Record the local path, source URL, capture date, owner, editorial-use basis,
  intended use and claim IDs in `production/asset-manifest.json`.
- Label the rendered visual as a real page screenshot and identify the source.
- Keep the relevant UI readable in the 9:16 frame and clear of captions.
- Treat official video and real interaction recordings the same way: bind them
  to claims, label the source, show the core action when the claim is first
  spoken and verify that action remains legible after vertical framing.
- If no stable or reviewable official image is available, use a
  claim-supported programmatic graphic. Label synthetic UI as a demonstration;
  never present it as a real product screenshot.

Validate research and story only, without creating audio or video:

```bash
pnpm validate:research
pnpm validate:workflow
pnpm validate:story
```

Pass another episode to validators with `--episode`, for example:

```bash
pnpm validate:research -- --episode episode-002
```

## Episode 001 output

- `output/episode-001/vertical_9x16.mp4`: 1080×1920 vertical video
- `output/episode-001/subtitles_zh.srt`: timed Simplified Chinese captions
- `output/episode-001/fact-check-report.md`: claim and source summary
- `output/episode-001/run-report.md`: execution and verification evidence
- `content/episode-001/production/comparison-report.md`: hash-bound comparison
  against the preserved publish-v2 baseline

## Episode 002 output

- `output/episode-002/vertical_9x16.mp4`: 1080×1920 Roost Social video
- `output/episode-002/subtitles_zh.srt`: timed Simplified Chinese captions
- `output/episode-002/run-report.md`: execution and verification evidence

## Automated polish and judge

- `config/polish-v2.json`: hosted LLM mode, prompt paths, thresholds and
  maximum rounds
- `config/editorial-text-rules.json`: versioned banned-pattern, sentence-length,
  protected-term and spoken-number rules shared by polish and validators
- `config/production-contract.json`: global duration, frame-rate, caption,
  timeline-padding and asset-capture limits; episode-specific overrides remain
  in `content/<episode>/episode.config.json`
- `prompts/v4/`: current Goal 3.2 Oral Rewriter prompt files; the unchanged `polish-judge-v2`
  preflight remains in `prompts/v3/`, and earlier prompt files are immutable history
- `editorial-calibration/policies/prompt-editorial-policy-v1.json`: human-approved, role-scoped
  transferable policy; it does not approve intake samples or load them at runtime
- `style/approved/`: human-approved few-shot manuscripts

Run `pnpm polish` with `OPENAI_API_KEY` (and optionally
`POLISH_LLM_MODEL`). Prompts, hard constraints, thresholds and
`style/approved/` are configurable. Every invocation writes a judge report,
including API/config failures. `pnpm ab:compare` generates old/new narration,
audio and a human comparison form from the same information draft.

## Narration providers

`config/tts-v2.json` selects the provider. MiniMax is enabled by default and reads
only `MINIMAX_API_KEY`; missing credentials or provider errors can fall back to
Edge. Set `defaultProvider` to `edge` to switch back.

- Microsoft Edge neural TTS
- voice: `zh-CN-YunjianNeural`
- rate: `+25%`
- pitch: `-2Hz`
- FFmpeg loudnorm: `I=-16`, `TP=-1.5`, `LRA=7`

MiniMax is synthesized sentence by sentence and requests word timestamps.
Matching timestamps drive subtitle alignment; absent or mismatched timestamps
fall back to the existing semantic-cue proportional alignment.

Set up the Python environment once:

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

## Run the manual Episode 001 stages

Requirements: Node.js 24.x, pnpm 11.9.0, FFmpeg/ffprobe, Chromium and the Python
environment above.

```bash
pnpm install
pnpm validate:research
pnpm validate:workflow
pnpm validate:story
pnpm materialize:story
pnpm validate:content
pnpm tts
pnpm timeline
pnpm render:smoke
pnpm render:vertical
pnpm inspect:output
pnpm validate:delivery
pnpm validate:comparison
```

These commands are deliberately stage-specific. Run each human review and gate
before continuing; do not wrap the sequence in a command that automatically
promotes an episode through approval boundaries.

Run the Remotion Studio with:

```bash
pnpm preview
```

## Quality gates

Run the relevant gates against the current checkout. Historical acceptance
reports do not certify later dependency, code or media changes, and an approved
older MP4 does not renew approval for current render code.

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm validate:research
pnpm validate:workflow
pnpm validate:story
pnpm materialize:story
pnpm validate:content
pnpm tts
pnpm timeline
pnpm render:smoke
pnpm render:vertical
pnpm inspect:output
pnpm validate:delivery
pnpm validate:comparison
```

The workflow check verifies one owner for every major decision and requires a
later PASS to close any recorded rejection with changed artifacts. The story
checks also verify Director Brief and attention-strategy input hashes, Viral
Director scores, complete visual-plan purpose/state/render coverage, actionable
viewer-exit diagnoses, and a Retention Critic PASS bound to the exact script and
visual plan. The content checks verify source lineage, claim labels, hook timing,
generic CTA rejection, caption limits and traceable real-asset declarations. Output
inspection reads the vertical MP4 back with ffprobe and FFmpeg to verify its
dimensions, the 40–80-second duration window, codecs, sample rate and audio peak. Delivery validation
binds the independent review to the exact video, subtitles and timeline hashes;
`story-approved` is not a delivery pass.
Delivery review also checks that official website and in-app screenshots are
readable, source-labelled and consistent with their asset-manifest entries.
For a reproduced episode, comparison validation binds both videos and timelines,
requires improvement in all six editorial proxy dimensions and keeps the
limitation explicit: only post-publication audience data can prove real retention.

## Publication checks

- "100 million" means company-reported message volume over roughly three
  months. It is not a user, retention, revenue or successful-task metric.
- March 19 is described as general availability and waitlist removal, not
  Poke's first appearance.
- Official page screenshots still need a final human rights and editorial-use
  review.
- Use the destination platform's synthetic narration disclosure when required.

This project does not upload or publish the video.
