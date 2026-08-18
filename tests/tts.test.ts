import {describe, expect, it} from "vitest";
import {parseProviderTimestamps, splitSpeechSentences} from "../src/lib/delivery/tts-providers";

describe("TTS providers", () => {
  it("splits Chinese narration into sentence synthesis units", () => {
    expect(splitSpeechSentences("先打开邮件。再改日历？最后确认！")).toEqual([
      "先打开邮件。",
      "再改日历？",
      "最后确认！",
    ]);
  });

  it("parses nested provider timestamp JSON", () => {
    expect(
      parseProviderTimestamps({
        subtitles: [
          {text: "先打开邮件", time_begin: 120, time_end: 900},
          {text: "再改日历", time_begin: 980, time_end: 1700},
        ],
      }),
    ).toEqual([
      {text: "先打开邮件", startMs: 120, endMs: 900},
      {text: "再改日历", startMs: 980, endMs: 1700},
    ]);
  });
});
