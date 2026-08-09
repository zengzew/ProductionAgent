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
    const span =
      timestampSpans.find(
        (candidate) => charOffset >= candidate.startChar && charOffset <= candidate.endChar,
      ) ?? timestampSpans.at(-1)!;
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
