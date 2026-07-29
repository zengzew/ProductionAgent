import {describe, expect, it} from "vitest";
import {
  captionPartsFromPlan,
  fitCaptionPartsToDuration,
  formatSrtTime,
  splitCaptionText,
  stripTrailingCaptionPunctuation,
  visibleLength,
} from "../src/lib/captions";

describe("caption helpers", () => {
  it("keeps every Chinese caption line inside the configured limit", () => {
    const parts = splitCaptionText(
      "一个不用下载的人工智能助手，过去三个月交换了超过一亿条消息。",
      15,
    );
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every((part) => visibleLength(part.text) <= 15)).toBe(true);
  });

  it("never splits an English word across captions", () => {
    const parts = splitCaptionText("Poke 进入 Apple Messages for Business", 15);
    const displayed = parts.map((part) => part.text);
    const englishWords = displayed.flatMap((part) => part.match(/[A-Za-z]+/gu) ?? []);

    expect(englishWords).toEqual(["Poke", "Apple", "Messages", "for", "Business"]);
  });

  it("keeps short Chinese words and phrases intact at caption boundaries", () => {
    const parts = splitCaptionText(
      "人们和 Poke 交换了一亿多条消息。邮件客户端变成对话体验，一项服务越用越远，推理成本也跟着增加。",
      15,
    );
    const displayed = parts.map((part) => part.text);

    for (const term of [
      "一亿多条消息",
      "邮件客户端",
      "对话体验",
      "一项服务",
      "越用越远",
      "推理成本",
    ]) {
      expect(
        displayed.some((part) => part.includes(term)),
        `${term} should stay intact`,
      ).toBe(true);
    }
  });

  it("keeps modifiers attached to the Chinese noun phrases they describe", () => {
    const cases = [
      ["Poke 是个 AI 助手，但它的主要入口不在一个新 App 里。", "主要入口"],
      ["Poke 会在原来的消息窗口里来找你。", "原来的消息窗口"],
      ["第一句话和需要连接的服务装进一个链接。", "需要连接的服务"],
    ] as const;

    for (const [narration, term] of cases) {
      const displayed = splitCaptionText(narration, 15).map((part) => part.text);
      expect(
        displayed.some((part) => part.includes(term)),
        `${term} should stay intact`,
      ).toBe(true);
    }
  });

  it("merges sub-second fragments without exceeding the display limit", () => {
    const parts = fitCaptionPartsToDuration(
      splitCaptionText("提醒吃药，问球赛结果，出门前看天气。", 15),
      3.6,
    );
    const totalWeight = parts.reduce((total, part) => total + part.weight, 0);
    const durations = parts.map((part) => (3.6 * part.weight) / totalWeight);

    expect(parts.every((part) => visibleLength(part.text) <= 16)).toBe(true);
    expect(durations.every((duration) => duration >= 1)).toBe(true);
    expect(parts.flatMap((part) => part.text.match(/提醒吃药|问球赛结果|出门前看天气/gu))).toEqual([
      "提醒吃药",
      "问球赛结果",
      "出门前看天气",
    ]);
  });

  it("validates a two-line editorial caption plan against its narration", () => {
    const parts = captionPartsFromPlan("Poke 会在原来的消息窗口里来找你。", [
      "Poke 会在原来的\n消息窗口里来找你",
    ]);

    expect(parts).toEqual([
      {
        text: "Poke 会在原来的\n消息窗口里来找你",
        weight: 17,
      },
    ]);
    expect(() => captionPartsFromPlan("Poke 会来找你。", ["Poke 不会来找你"])).toThrowError(
      "字幕规划与旁白不一致",
    );
  });

  it("formats SRT timestamps", () => {
    expect(formatSrtTime(65.432)).toBe("00:01:05,432");
  });

  it("removes punctuation at the end of every displayed caption", () => {
    expect(stripTrailingCaptionPunctuation("收件箱方案于是被收回去，")).toBe(
      "收件箱方案于是被收回去",
    );
    const parts = splitCaptionText("先打开邮件，再去日历。为什么？", 15);
    expect(parts.map((part) => part.text)).toEqual(["先打开邮件", "再去日历", "为什么"]);
    expect(parts.every((part) => !/[。！？；：，、,.!?;:]$/u.test(part.text))).toBe(true);
  });
});
