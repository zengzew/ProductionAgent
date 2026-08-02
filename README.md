# Product Story Video Lab

This repository builds sourced, repeatable Chinese product-story short videos
with Remotion.
Episode 001 follows Poke through its 2026 general release, product mechanics,
reported message volume and acquisition. Episode 002 follows Roost Social and
asks why users accepted a messaging product that deliberately makes them wait.

The current episode pipeline produces one 9:16 video. Legacy Genspark and
landscape Poke packages are not part of this repository.

## Product-story short-video pipeline

The workflow uses eight gated roles. They are logical roles with
file handoffs, not a LangGraph or CrewAI runtime. Each role reads the previous
role's artifacts instead of turning research directly into narration.

1. **Research Analyst** writes facts, sources, research chronology, technology
   boundaries and growth data. This role does not write story conclusions.
2. **Story Director** chooses one question, separates sourced answers from
   unanswered boundaries, compares angles and builds a time-coded three-act
   structure.
3. **Script Writer** writes an information-complete `script-draft.md` from the
   approved structure. It does not approve its own draft as spoken copy.
4. **Oral Rewriter** independently turns the draft into natural spoken Chinese
   without adding or changing facts.
5. **Oral Judge** scores Chinese naturalness, spoken delivery and information
   fidelity. All three must reach 4/5, with at most three rewrite rounds.
6. **Audience Critic** scores Hook, Conflict, Human element, Product clarity,
   Growth logic, Technology explanation and Natural Chinese. A score below 85,
   any dimension below 60%, or any blocker rejects the script.
7. **Fact Guardian** independently checks every narration unit, attribution,
   metric, date and causal boundary. It does not rewrite. A failure routes back
   to Research Analyst, Story Director, Script Writer or Oral Rewriter.
8. **Delivery Critic** reviews the rendered 9:16 MP4, SRT and measured TTS as a
   zero-context viewer. Word breaks, excessive sub-second cues, an opaque first
   frame or swallowed narration reject delivery.

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
    story-bible.md
    story-angle.md
    three-act-structure.md
    hook-candidates.md
    script-draft.md
    final-script.md
    oral-review.md
    caption-plan.json
    critic-report.md
    fact-check-report.md
  production/
    delivery-critic-report.md
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

## Episode 002 output

- `output/episode-002/vertical_9x16.mp4`: 1080×1920 Roost Social video
- `output/episode-002/subtitles_zh.srt`: timed Simplified Chinese captions
- `output/episode-002/run-report.md`: execution and verification evidence

## Automated polish and judge

- `config/polish-v2.json`: hosted LLM mode, prompt paths, thresholds and
  maximum rounds
- `config/polish-v2-style.json`: sentence limits, banned terms, protected
  English terms and spoken-number guidance
- `prompts/`: Oral Rewriter and Oral Judge prompt templates
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

## Reproduce episode 001

Requirements: Node.js 22+, pnpm, FFmpeg/ffprobe, Chromium and the Python
environment above.

```bash
pnpm install
pnpm validate:research
pnpm validate:story
pnpm materialize:story
pnpm validate:content
pnpm tts
pnpm timeline
pnpm render:smoke
pnpm render
pnpm inspect:output
pnpm validate:delivery
```

Run the Remotion Studio with:

```bash
pnpm preview
```

## Quality gates

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm validate:research
pnpm validate:story
pnpm validate:content
pnpm inspect:output
pnpm validate:delivery
```

The content checks verify source lineage, claim labels, hook timing, generic
CTA rejection, caption limits and traceable real-asset declarations. Output
inspection reads the vertical MP4 back with ffprobe and FFmpeg to verify its
dimensions, duration, codecs, sample rate and audio peak. Delivery validation
binds the independent review to the exact video, subtitles and timeline hashes;
`story-approved` is not a delivery pass.
Delivery review also checks that official website and in-app screenshots are
readable, source-labelled and consistent with their asset-manifest entries.

## Publication checks

- "100 million" means company-reported message volume over roughly three
  months. It is not a user, retention, revenue or successful-task metric.
- March 19 is described as general availability and waitlist removal, not
  Poke's first appearance.
- Official page screenshots still need a final human rights and editorial-use
  review.
- Use the destination platform's synthetic narration disclosure when required.

This project does not upload or publish the video.
