import {describe, expect, it} from "vitest";
import {
  normalizeChineseSpeechText,
  parseProviderTimestamps,
  splitSpeechSentences,
} from "../src/lib/delivery/tts-providers";

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

  it("reads four-digit calendar years digit by digit without changing metrics", () => {
    expect(normalizeChineseSpeechText("团队在 2020 年成立，后来融资 6800 万美元。")).toBe(
      "团队在 二零二零年成立,后来融资 6800 万美元。",
    );
    expect(normalizeChineseSpeechText("公司 2025年公布了结果。")).toBe(
      "公司 二零二五年公布了结果。",
    );
  });
});
