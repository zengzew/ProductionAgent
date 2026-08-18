import {describe, expect, it} from "vitest";
import {measureCaptionDelivery, parseDeliveryGate, parseSrt} from "../src/lib/delivery/delivery";

describe("delivery gate helpers", () => {
  it("parses SRT cues and measures micro cue ratio", () => {
    const cues = parseSrt(
      [
        "1",
        "00:00:00,000 --> 00:00:01,200",
        "提醒吃药",
        "",
        "2",
        "00:00:01,200 --> 00:00:01,900",
        "问球赛结果",
      ].join("\n"),
    );

    expect(cues).toHaveLength(2);
    expect(measureCaptionDelivery(cues)).toEqual({
      microCueCount: 1,
      microCueRatio: 0.5,
      minimumCueSeconds: 0.7,
    });
  });

  it("requires a delivery report to bind video, subtitles and timeline", () => {
    const hash = "a".repeat(64);
    const gate = parseDeliveryGate(`<!-- delivery-gate
{
  "rubricVersion": "delivery-critic-v1",
  "reviewedVideo": "output/episode-001/vertical_9x16.mp4",
  "reviewedVideoSha256": "${hash}",
  "reviewedSubtitles": "output/episode-001/subtitles_zh.srt",
  "reviewedSubtitlesSha256": "${hash}",
  "reviewedTimeline": "content/episode-001/production/timeline.json",
  "reviewedTimelineSha256": "${hash}",
  "metrics": {
    "captionWordBreaks": 0,
    "englishWordBreaks": 0,
    "microCueThresholdSeconds": 1,
    "microCueCount": 0,
    "microCueRatio": 0,
    "microCueRatioLimit": 0.1,
    "minimumCueSeconds": 1.2,
    "firstFrameZeroContextReadable": true,
    "speechClippingOrSwallowing": false
  },
  "blockers": [],
  "verdict": "PASS",
  "returnTo": "none"
}
-->`);

    expect(gate.verdict).toBe("PASS");
    expect(gate.metrics.firstFrameZeroContextReadable).toBe(true);
  });
});
