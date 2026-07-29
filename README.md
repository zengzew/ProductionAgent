# Product Story Video Lab

This repository builds sourced, repeatable Chinese product-story short videos
with Remotion.
Episode 001 follows Poke through its 2026 general release, product mechanics,
reported message volume and acquisition.

The current episode pipeline produces one 9:16 video. Legacy Genspark and
landscape Poke packages are not part of this repository.

## Product-story short-video pipeline

The workflow uses six gated roles. They are logical roles with
file handoffs, not a LangGraph or CrewAI runtime. Each role reads the previous
role's artifacts instead of turning research directly into narration.

1. **Research Analyst** writes facts, sources, research chronology, technology
   boundaries and growth data. This role does not write story conclusions.
2. **Story Director** chooses one question, separates sourced answers from
   unanswered boundaries, compares angles and builds a time-coded three-act
   structure.
3. **Script Writer** writes natural Chinese from the approved structure. Every
   narration sentence records its mode, Claim IDs and attribution. Rewrite is a
   mode of this role, not a separate agent.
4. **Audience Critic** scores Hook, Conflict, Human element, Product clarity,
   Growth logic, Technology explanation and Natural Chinese. A score below 85,
   any dimension below 60%, or any blocker rejects the script.
5. **Fact Guardian** independently checks every narration unit, attribution,
   metric, date and causal boundary. It does not rewrite. A failure routes back
   to Research Analyst, Story Director or Script Writer.
6. **Delivery Critic** reviews the rendered 9:16 MP4, SRT and measured TTS as a
   zero-context viewer. Word breaks, excessive sub-second cues, an opaque first
   frame or swallowed narration reject delivery.

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
    final-script.md
    caption-plan.json
    critic-report.md
    fact-check-report.md
  production/
    delivery-critic-report.md
```

`facts.json` is the Claim Ledger. `timeline.json` is the research chronology;
it is separate from `production/timeline.json`, which is generated later from
measured audio. `final-script.md` is the approved editorial handoff and is
structured so the production phase can materialize `script.json`.
`caption-plan.json` keeps complete Chinese semantic units in one timed cue,
using at most two simultaneous lines. Existing production artifacts remain the
previous snapshot until that phase starts.

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

## Fixed narration voice

Episode 001 uses the fixed project narration profile:

- Microsoft Edge neural TTS
- voice: `zh-CN-YunjianNeural`
- rate: `+25%`（基准语速的 1.25x）
- pitch: `-2Hz`
- FFmpeg loudnorm: `I=-16`, `TP=-1.5`, `LRA=7`

The TTS script does not accept a provider, API key, model, voice or manual audio
directory. It uses `.venv/bin/edge-tts` directly. Edge TTS needs network access
but no project credential.

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

The content checks verify source lineage, claim labels, hook timing, caption
limits and asset declarations. Output inspection reads the vertical MP4 back
with ffprobe and FFmpeg to verify its dimensions, duration, codecs, sample rate
and audio peak. Delivery validation binds the independent review to the exact
video, subtitles and timeline hashes; `story-approved` is not a delivery pass.

## Publication checks

- "100 million" means company-reported message volume over roughly three
  months. It is not a user, retention, revenue or successful-task metric.
- March 19 is described as general availability and waitlist removal, not
  Poke's first appearance.
- Official page screenshots still need a final human rights and editorial-use
  review.
- Use the destination platform's synthetic narration disclosure when required.

This project does not upload or publish the video.
