import {describe, expect, it} from "vitest";
import {
  alignCaptionPartsToTimestamps,
  captionPartsFromPlan,
  captionTextsEquivalent,
  findCaptionSemanticBoundaryIssues,
  fitCaptionPartsToDuration,
  formatSrtTime,
  splitCaptionText,
  stripTrailingCaptionPunctuation,
  visibleLength,
} from "../src/lib/delivery/captions";

const rejectedSemanticBoundaryFixtures = [
  {
    name: "subject and predicate",
    narration: "可它一开始，只是邮件工作台。",
    cues: ["可它一开始", "只是邮件工作台"],
    expectedKinds: ["subject-predicate"],
  },
  {
    name: "subject and causative predicate",
    narration: "这些要求，也让 Poke 开始处理更多日常小事。",
    cues: ["这些要求", "也让 Poke 开始处理更多日常小事"],
    expectedKinds: ["subject-predicate"],
  },
  {
    name: "modifier, object and predicate",
    narration: "只有你选中的 close friends，才能看到精确位置。",
    cues: ["只有你选中的", "close friends", "才能看到精确位置"],
    expectedKinds: ["modifier-object", "subject-predicate"],
  },
  {
    name: "condition attached to the preceding sentence",
    narration: "它也能草拟回复。授权以后，它能读邮件、改日历。",
    cues: ["它也能草拟回复 授权以后", "它能读邮件、改日历"],
    expectedKinds: ["dangling-condition"],
  },
  {
    name: "transition attached to the preceding sentence",
    narration: "它也能草拟回复。不过，结果还得由你核对。",
    cues: ["它也能草拟回复 不过", "结果还得由你核对"],
    expectedKinds: ["dangling-transition"],
  },
  {
    name: "multi-word English proper noun",
    narration: "Poke 进入 Apple Messages for Business。",
    cues: ["Poke 进入 Apple Messages for", "Business"],
    expectedKinds: ["english-proper-noun"],
  },
  {
    name: "copula and object",
    narration: "Roost 最早是 Mendelsohn 和朋友做的业余项目。",
    cues: ["Roost 最早是", "Mendelsohn 和朋友", "做的业余项目"],
    expectedKinds: ["modifier-object"],
  },
  {
    name: "source verb and object",
    narration: "TechCrunch 记录了这篇帖子。",
    cues: ["TechCrunch 记录了", "这篇帖子"],
    expectedKinds: ["modifier-object"],
  },
] as const;

const acceptedSemanticBoundaryFixtures = [
  {
    name: "fixed Poke permission and transition cues",
    narration: "授权以后，它能读邮件、改日历，也能草拟回复。不过，结果还得由你自己核对。",
    cues: ["授权以后\n它能读邮件、改日历", "也能草拟回复", "不过结果还得\n由你自己核对"],
  },
  {
    name: "fixed Roost permission cue",
    narration: "默认情况下，朋友只能看到你所在的城市。只有你选中的亲密好友，才能看到精确位置。",
    cues: ["默认情况下", "朋友只能看到你所在的城市", "只有你选中的亲密好友\n才能看到精确位置"],
  },
  {
    name: "complete temporal clause",
    narration: "需要连接自己的账户时，再由他亲自确认授权。",
    cues: ["需要连接自己的账户时", "再由他亲自确认授权"],
  },
  {
    name: "separate sentences beginning with product names",
    narration: "Poke 能读邮件。Roost 会按距离送信。",
    cues: ["Poke 能读邮件", "Roost 会按距离送信"],
  },
  {
    name: "separate English names in a list",
    narration: "Poke、Roost 都放在联系人列表里。",
    cues: ["Poke", "Roost 都放在联系人列表里"],
  },
  {
    name: "complete English proper noun",
    narration: "Poke 进入 Apple Messages for Business。",
    cues: ["Poke 进入", "Apple Messages for Business"],
  },
] as const;

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

  it.each(rejectedSemanticBoundaryFixtures)(
    "detects rejected semantic boundary: $name",
    ({narration, cues, expectedKinds}) => {
      const issues = findCaptionSemanticBoundaryIssues(narration, cues);

      expect(issues.map((issue) => issue.kind)).toEqual(expect.arrayContaining([...expectedKinds]));
    },
  );

  it.each(acceptedSemanticBoundaryFixtures)(
    "accepts complete semantic boundary: $name",
    ({narration, cues}) => {
      expect(findCaptionSemanticBoundaryIssues(narration, cues)).toEqual([]);
    },
  );

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

  it("merges adjacent Chinese cues without inserting a visible space", () => {
    expect(
      fitCaptionPartsToDuration(
        [
          {text: "提醒", weight: 2},
          {text: "吃药", weight: 2},
        ],
        1.5,
      ),
    ).toEqual([{text: "提醒吃药", weight: 4}]);
    expect(captionTextsEquivalent(["提醒 吃药"], ["提醒吃药"])).toBe(true);
    expect(captionTextsEquivalent(["订阅 7 月"], ["订阅7 月"])).toBe(true);
    expect(captionTextsEquivalent(["two words"], ["twowords"])).toBe(false);
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

  it("uses provider word timestamps when their text matches the caption plan", () => {
    const parts = captionPartsFromPlan("Poke 会来找你。", ["Poke 会来", "找你"]);
    const aligned = alignCaptionPartsToTimestamps(
      parts,
      [
        {text: "Poke", startMs: 100, endMs: 500},
        {text: "会来", startMs: 600, endMs: 1000},
        {text: "找你", startMs: 1200, endMs: 1700},
      ],
      2,
    );

    expect(aligned?.map(({startSeconds, endSeconds}) => [startSeconds, endSeconds])).toEqual([
      [0.1, 1],
      [1, 1.7],
    ]);
    expect(
      alignCaptionPartsToTimestamps(parts, [{text: "别的文字", startMs: 0, endMs: 500}], 2),
    ).toBeUndefined();
  });

  it("keeps timestamp alignment correct across many ordered spans", () => {
    const timestamps = Array.from({length: 2_000}, (_, index) => ({
      text: "字",
      startMs: index * 10,
      endMs: (index + 1) * 10,
    }));
    const parts = Array.from({length: 200}, () => ({text: "字".repeat(10), weight: 10}));
    const aligned = alignCaptionPartsToTimestamps(parts, timestamps, 20);

    expect(aligned).toHaveLength(200);
    expect(aligned?.at(-1)).toMatchObject({startSeconds: 19.9, endSeconds: 20});
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
