export type CaptionPart = {
  text: string;
  weight: number;
};

export type CaptionTiming = CaptionPart & {
  startSeconds: number;
  endSeconds: number;
};

export type TimestampPart = {
  text: string;
  startMs: number;
  endMs: number;
};

export type CaptionSemanticIssueKind =
  | "subject-predicate"
  | "modifier-object"
  | "dangling-transition"
  | "dangling-condition"
  | "english-proper-noun";

export type CaptionSemanticBoundaryIssue = {
  kind: CaptionSemanticIssueKind;
  boundaryAfterCue: number;
  leftCue: string;
  rightCue?: string;
};

const punctuationSplit = /(?<=[。！？；：，、,.!?;:])/u;
const trailingCaptionPunctuation = /[。！？；：，、,.!?;:]+$/u;
const whitespaceOnly = /^\s+$/u;
const hanOnly = /^\p{Script=Han}+$/u;
const chineseGroupLimit = 10;
const wordSegmenter = new Intl.Segmenter("zh-CN", {granularity: "word"});

export const visibleLength = (text: string): number => Array.from(text.replace(/\s/gu, "")).length;

const normalizeMergedChineseWhitespace = (text: string): string =>
  text.replace(/([\p{Script=Han}\d])\s+(?=[\p{Script=Han}\d])/gu, "$1");

export const captionTextsEquivalent = (left: string[], right: string[]): boolean =>
  left.length === right.length &&
  left.every(
    (text, index) =>
      normalizeMergedChineseWhitespace(text) ===
      normalizeMergedChineseWhitespace(right[index] ?? ""),
  );

export const stripTrailingCaptionPunctuation = (text: string): string =>
  text.replace(trailingCaptionPunctuation, "").trim();

const normalizeCaptionContent = (text: string): string =>
  text.normalize("NFKC").replace(/[\p{P}\p{S}\s]/gu, "");

const terminalSentencePunctuation = /[。！？；：.!?;:]/u;
const transitionConnector =
  /(?:不过|但是|但|可是|然而|所以|因此|于是|而且|并且|否则|虽然|尽管|因为|既然|反而)$/u;
const shortConditionLead = /(?:以后|之后|之前|的时候|时|后)$/u;
const predicateContinuation =
  /^(?:只是|也让|还在|才能|才会|才是|才有|才开始|仍在|仍会|仍是|也可以|也会|也能|会|能|可以|做的|开始处理|变成|成为|再由)/u;
const independentPredicate =
  /(?:待在|处在|位于|处理|看到|看见|披露|记录|表示|指出|宣布|写道|说起|说了|发了|发出|交给|提醒|查询|查到|查球赛|问天气|收起|放进|读邮件|改日历|草拟|核对|连接|确认|开放|进入|达到|到了|涨到|飞向|朝.+飞|提供|支持|计算|显示|画在|画出|改变|描述|做了|做的是|喜欢|催他|训练|购买|买一|得到|使用|用上|玩出|想让|需要|可以|能|会|是|有|让|把|没把|等待|变成|成为|送到|送信|来找|跟进)/u;
const danglingCopulaOrObjectVerb = /(?:只是|就是|是|由|包括|包含|叫作|叫做|成为|变成)$/u;
const danglingDeterminer = /(?:这|那|这些|那些|一个|一条|一只|一种|一套|一名|一位|每个|所有的)$/u;
const sourceVerb = /(?:披露|记录了|表示|指出|宣布|称|说|写道)$/u;
const likelySourceObject = /^(?:这|该|其|一篇|一份|帖子|数据|数字|消息|报告|用户)/u;
const englishSuffix = /([A-Za-z][A-Za-z0-9]*(?:[ .&'/-]+[A-Za-z][A-Za-z0-9]*)*)$/u;
const englishPrefix = /^([A-Za-z][A-Za-z0-9]*(?:[ .&'/-]+[A-Za-z][A-Za-z0-9]*)*)/u;

type CaptionNarrationSpan = {
  rawText: string;
  separatorAfter: string;
};

const captionNarrationSpans = (
  narration: string,
  cues: readonly string[],
): CaptionNarrationSpan[] => {
  const normalizedNarration = narration.normalize("NFKC");
  const narrationCharacters = Array.from(normalizedNarration);
  const contentPositions = narrationCharacters.flatMap((character, index) =>
    normalizeCaptionContent(character) ? [index] : [],
  );
  const cueLengths = cues.map((cue) => Array.from(normalizeCaptionContent(cue)).length);
  if (cueLengths.some((length) => length === 0)) {
    throw new Error("字幕语义检查不接受空 cue");
  }
  if (cueLengths.reduce((total, length) => total + length, 0) !== contentPositions.length) {
    throw new Error(`字幕规划与旁白不一致：${narration}`);
  }

  let contentCursor = 0;
  const rawRanges = cueLengths.map((length) => {
    const start = contentPositions[contentCursor];
    contentCursor += length;
    const end = contentPositions[contentCursor - 1];
    if (start === undefined || end === undefined) {
      throw new Error(`字幕规划与旁白不一致：${narration}`);
    }
    return {start, end};
  });

  return rawRanges.map((range, index) => {
    const nextStart = rawRanges[index + 1]?.start;
    return {
      rawText: narrationCharacters.slice(range.start, range.end + 1).join(""),
      separatorAfter:
        nextStart === undefined ? "" : narrationCharacters.slice(range.end + 1, nextStart).join(""),
    };
  });
};

const compactSemanticText = (text: string): string => normalizeCaptionContent(text);

const tailAfterLastSentence = (text: string): string | undefined => {
  const characters = Array.from(text);
  let lastBoundary = -1;
  for (const [index, character] of characters.entries()) {
    if (terminalSentencePunctuation.test(character)) lastBoundary = index;
  }
  if (lastBoundary < 0) return undefined;
  const tail = compactSemanticText(characters.slice(lastBoundary + 1).join(""));
  return tail || undefined;
};

const isShortConditionLead = (text: string): boolean =>
  visibleLength(text) <= 8 && shortConditionLead.test(text);

const hasSplitEnglishTerm = (left: string, right: string): boolean =>
  englishSuffix.test(left) && englishPrefix.test(right);

export const findCaptionSemanticBoundaryIssues = (
  narration: string,
  cues: readonly string[],
): CaptionSemanticBoundaryIssue[] => {
  const plannedContent = normalizeCaptionContent(cues.join(""));
  if (plannedContent !== normalizeCaptionContent(narration)) {
    throw new Error(`字幕规划与旁白不一致：${narration}`);
  }
  if (cues.length === 0) return [];

  const spans = captionNarrationSpans(narration, cues);
  const issues: CaptionSemanticBoundaryIssue[] = [];
  const issueKeys = new Set<string>();
  const addIssue = (
    kind: CaptionSemanticIssueKind,
    boundaryAfterCue: number,
    rightCue?: string,
  ): void => {
    const key = `${kind}:${boundaryAfterCue}`;
    if (issueKeys.has(key)) return;
    issueKeys.add(key);
    issues.push({
      kind,
      boundaryAfterCue,
      leftCue: cues[boundaryAfterCue - 1] ?? "",
      ...(rightCue === undefined ? {} : {rightCue}),
    });
  };

  for (const [index, cue] of cues.entries()) {
    const compactCue = compactSemanticText(cue);
    const sentenceTail = tailAfterLastSentence(spans[index]?.rawText ?? "");
    if (
      transitionConnector.test(compactCue) ||
      (sentenceTail && transitionConnector.test(sentenceTail))
    ) {
      addIssue("dangling-transition", index + 1, cues[index + 1]);
    }
    if (
      (sentenceTail && isShortConditionLead(sentenceTail)) ||
      (index < cues.length - 1 && isShortConditionLead(compactCue))
    ) {
      addIssue("dangling-condition", index + 1, cues[index + 1]);
    }
  }

  for (let index = 0; index < cues.length - 1; index += 1) {
    const leftCue = compactSemanticText(cues[index] ?? "");
    const rightCue = compactSemanticText(cues[index + 1] ?? "");
    const separator = spans[index]?.separatorAfter ?? "";
    const hasTerminalBoundary = terminalSentencePunctuation.test(separator);
    const hasPunctuationBoundary = /[\p{P}\p{S}]/u.test(separator);

    if (!hasPunctuationBoundary && hasSplitEnglishTerm(cues[index] ?? "", cues[index + 1] ?? "")) {
      addIssue("english-proper-noun", index + 1, cues[index + 1]);
    }
    if (hasTerminalBoundary) continue;

    if (predicateContinuation.test(rightCue) && !independentPredicate.test(leftCue)) {
      addIssue("subject-predicate", index + 1, cues[index + 1]);
    }
    if (
      leftCue.endsWith("的") ||
      rightCue.startsWith("的") ||
      danglingCopulaOrObjectVerb.test(leftCue) ||
      danglingDeterminer.test(leftCue) ||
      (sourceVerb.test(leftCue) && likelySourceObject.test(rightCue))
    ) {
      addIssue("modifier-object", index + 1, cues[index + 1]);
    }
  }

  return issues;
};

export const alignCaptionPartsToTimestamps = (
  parts: CaptionPart[],
  timestamps: TimestampPart[],
  audioDurationSeconds: number,
): CaptionTiming[] | undefined => {
  if (parts.length === 0 || timestamps.length === 0 || audioDurationSeconds <= 0) return undefined;
  const captionText = normalizeCaptionContent(parts.map((part) => part.text).join(""));
  const timestampText = normalizeCaptionContent(timestamps.map((part) => part.text).join(""));
  if (!captionText || captionText !== timestampText) return undefined;

  const timestampSpans: Array<TimestampPart & {startChar: number; endChar: number}> = [];
  let timestampCursor = 0;
  for (const timestamp of timestamps) {
    const length = Array.from(normalizeCaptionContent(timestamp.text)).length;
    if (length === 0 || timestamp.endMs <= timestamp.startMs) continue;
    timestampSpans.push({
      ...timestamp,
      startChar: timestampCursor,
      endChar: timestampCursor + length,
    });
    timestampCursor += length;
  }
  if (timestampCursor !== Array.from(captionText).length || timestampSpans.length === 0) {
    return undefined;
  }

  const timeAtBoundary = (charOffset: number): number => {
    if (charOffset <= 0) return Math.max(0, (timestampSpans[0]?.startMs ?? 0) / 1000);
    if (charOffset >= timestampCursor) {
      return Math.min(
        audioDurationSeconds,
        (timestampSpans.at(-1)?.endMs ?? audioDurationSeconds * 1000) / 1000,
      );
    }
    let low = 0;
    let high = timestampSpans.length - 1;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (timestampSpans[middle]!.endChar < charOffset) low = middle + 1;
      else high = middle;
    }
    const span = timestampSpans[low]!;
    const ratio = (charOffset - span.startChar) / (span.endChar - span.startChar);
    return Math.min(
      audioDurationSeconds,
      Math.max(0, (span.startMs + (span.endMs - span.startMs) * ratio) / 1000),
    );
  };

  let captionCursor = 0;
  return parts.map((part) => {
    const startChar = captionCursor;
    captionCursor += Array.from(normalizeCaptionContent(part.text)).length;
    const startSeconds = timeAtBoundary(startChar);
    const endSeconds = Math.max(startSeconds + 0.001, timeAtBoundary(captionCursor));
    return {...part, startSeconds, endSeconds: Math.min(audioDurationSeconds, endSeconds)};
  });
};

export const captionPartsFromPlan = (
  narration: string,
  cues: string[],
  maxLineChars = 16,
): CaptionPart[] => {
  if (cues.length === 0) throw new Error("字幕规划不能为空");

  for (const cue of cues) {
    const lines = cue.split("\n");
    if (lines.length > 2) throw new Error(`字幕最多两行：${cue}`);
    for (const line of lines) {
      if (!line.trim()) throw new Error(`字幕包含空行：${cue}`);
      if (visibleLength(line) > maxLineChars) {
        throw new Error(`字幕单行超过 ${maxLineChars} 字：${line}`);
      }
      if (trailingCaptionPunctuation.test(line)) {
        throw new Error(`字幕行末不应保留标点：${line}`);
      }
    }
  }

  const plannedContent = normalizeCaptionContent(cues.join(""));
  const narrationContent = normalizeCaptionContent(narration);
  if (plannedContent !== narrationContent) {
    throw new Error(`字幕规划与旁白不一致：${narration}`);
  }

  return cues.map((text) => ({
    text,
    weight: Math.max(1, visibleLength(text)),
  }));
};

const captionTokens = (phrase: string, maxChars: number): string[] => {
  const tokens: string[] = [];
  let pendingWhitespace = "";

  for (const item of wordSegmenter.segment(phrase)) {
    if (whitespaceOnly.test(item.segment)) {
      pendingWhitespace += item.segment;
      continue;
    }

    const token = `${pendingWhitespace}${item.segment}`;
    pendingWhitespace = "";
    const tokenText = token.trim();
    const previous = tokens.at(-1);
    const previousText = previous?.trim() ?? "";
    const hasWordBoundaryWhitespace = /^\s/u.test(token);
    const combinedChineseLength = visibleLength(previousText + tokenText);
    const canKeepChinesePhraseTogether =
      previous !== undefined &&
      !hasWordBoundaryWhitespace &&
      hanOnly.test(previousText) &&
      hanOnly.test(tokenText) &&
      (combinedChineseLength <= Math.min(maxChars, chineseGroupLimit) ||
        (previousText.endsWith("的") && combinedChineseLength <= maxChars));

    if (canKeepChinesePhraseTogether) {
      tokens[tokens.length - 1] = previous + token;
    } else {
      tokens.push(token);
    }
  }

  return tokens;
};

const splitTokens = (tokens: string[], maxChars: number): string[] => {
  const oversizedToken = tokens.find((token) => visibleLength(token) > maxChars);
  if (oversizedToken) {
    throw new Error(
      `字幕 token 超过 ${maxChars} 字，无法在不拆词的前提下合法分割：${oversizedToken.trim()}`,
    );
  }
  const count = tokens.length;
  const costs = Array<number>(count + 1).fill(Number.POSITIVE_INFINITY);
  const nextBreaks = Array<number>(count + 1).fill(count);
  costs[count] = 0;

  for (let start = count - 1; start >= 0; start -= 1) {
    let lineLength = 0;
    for (let end = start + 1; end <= count; end += 1) {
      lineLength += visibleLength(tokens[end - 1] ?? "");
      if (lineLength > maxChars) break;

      const unusedSpace = Math.max(0, maxChars - lineLength);
      const shortLinePenalty = lineLength < Math.ceil(maxChars * 0.45) ? maxChars * maxChars : 0;
      const linePenalty = unusedSpace * unusedSpace + shortLinePenalty + 12;
      const candidateCost = linePenalty + (costs[end] ?? Number.POSITIVE_INFINITY);
      if (candidateCost < (costs[start] ?? Number.POSITIVE_INFINITY)) {
        costs[start] = candidateCost;
        nextBreaks[start] = end;
      }
    }
  }

  const lines: string[] = [];
  for (let start = 0; start < count;) {
    const end = nextBreaks[start] ?? start + 1;
    const line = tokens.slice(start, end).join("").trim();
    if (line) lines.push(line);
    start = Math.max(start + 1, end);
  }
  return lines;
};

export const splitCaptionText = (text: string, maxChars = 15): CaptionPart[] => {
  const phrases = text.split(punctuationSplit).map(stripTrailingCaptionPunctuation).filter(Boolean);

  const output: CaptionPart[] = [];
  for (const phrase of phrases) {
    if (visibleLength(phrase) <= maxChars) {
      output.push({text: phrase, weight: Math.max(1, visibleLength(phrase))});
      continue;
    }

    for (const line of splitTokens(captionTokens(phrase, maxChars), maxChars)) {
      output.push({text: line, weight: Math.max(1, visibleLength(line))});
    }
  }
  return output;
};

export const fitCaptionPartsToDuration = (
  sourceParts: CaptionPart[],
  audioDurationSeconds: number,
  minimumCueSeconds = 1,
  maxChars = 16,
): CaptionPart[] => {
  const parts = sourceParts.map((part) => ({...part}));
  if (parts.length < 2 || audioDurationSeconds <= 0) return parts;

  while (parts.length > 1) {
    const totalWeight = parts.reduce((total, part) => total + part.weight, 0);
    const durations = parts.map((part) => (audioDurationSeconds * part.weight) / totalWeight);
    const shortIndex = durations.findIndex(
      (duration) => duration + Number.EPSILON < minimumCueSeconds,
    );
    if (shortIndex < 0) break;

    const candidates = [shortIndex - 1, shortIndex + 1]
      .filter((index) => index >= 0 && index < parts.length)
      .map((neighborIndex) => {
        const leftIndex = Math.min(shortIndex, neighborIndex);
        const rightIndex = Math.max(shortIndex, neighborIndex);
        const left = parts[leftIndex];
        const right = parts[rightIndex];
        if (!left || !right) return undefined;
        const needsWordBoundary =
          /[A-Za-z0-9]$/u.test(left.text) && /^[A-Za-z0-9]/u.test(right.text);
        const text = `${left.text}${needsWordBoundary ? " " : ""}${right.text}`;
        return {
          leftIndex,
          rightIndex,
          text,
          visible: visibleLength(text),
          weight: left.weight + right.weight,
        };
      })
      .filter(
        (
          candidate,
        ): candidate is {
          leftIndex: number;
          rightIndex: number;
          text: string;
          visible: number;
          weight: number;
        } => candidate !== undefined && candidate.visible <= maxChars,
      )
      .sort((a, b) => a.visible - b.visible);

    const selected = candidates[0];
    if (!selected) break;
    parts.splice(selected.leftIndex, 2, {
      text: selected.text,
      weight: selected.weight,
    });
  }

  return parts;
};

export const formatSrtTime = (seconds: number): string => {
  const safeSeconds = Math.max(0, seconds);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const wholeSeconds = Math.floor(safeSeconds % 60);
  const milliseconds = Math.round((safeSeconds - Math.floor(safeSeconds)) * 1000);
  return [hours, minutes, wholeSeconds]
    .map((value) => value.toString().padStart(2, "0"))
    .join(":")
    .concat(",", Math.min(milliseconds, 999).toString().padStart(3, "0"));
};
