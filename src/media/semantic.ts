import {z} from "zod";
import type {ArtifactRef} from "../orchestration/schemas/artifact";

/**
 * WP-M5.04 semantic understanding adapter.
 *
 * An injectable adapter turns a clip window (plus its observed transcript
 * text) into structured metadata. The adapter output is schema-validated by
 * the pipeline and can only describe content — it never grants rights, never
 * claims truth about the world, and is never allowed to rewrite transcript
 * text. Tests use deterministic stubs; no VLM is required for M5.04.
 */

export const semanticMetadataSchema = z
  .object({
    textSummary: z.string().max(2000),
    keywords: z.array(z.string().min(1).max(200)).max(64).default([]),
    entities: z.array(z.string().min(1).max(200)).max(64).default([]),
    speaker: z.string().min(1).max(200).nullable(),
    semanticTags: z.array(z.string().min(1).max(200)).max(64).default([]),
  })
  .strict();

export type SemanticMetadata = z.infer<typeof semanticMetadataSchema>;

export const semanticMetadataParse = (value: unknown): SemanticMetadata =>
  semanticMetadataSchema.parse(value);

export type SemanticDescribeInput = {
  episodeId: string;
  mediaId: string;
  mediaRef: ArtifactRef;
  startMs: number;
  endMs: number;
  /** Transcript text observed inside this window ("" when unavailable). */
  observedText: string;
};

/** Structured metadata producer. Throwing or returning invalid output fails closed. */
export type SemanticUnderstandingAdapter = {
  readonly id: string;
  readonly version: string;
  describe(input: SemanticDescribeInput): Promise<SemanticMetadata> | SemanticMetadata;
};

const tokenize = (text: string): string[] =>
  text
    .split(/[\s\p{P}\p{S}]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);

const topKeywords = (text: string, limit: number): string[] => {
  const counts = new Map<string, number>();
  for (const token of tokenize(text)) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([leftWord, leftCount], [rightWord, rightCount]) =>
      leftCount !== rightCount ? rightCount - leftCount : leftWord.localeCompare(rightWord),
    )
    .slice(0, limit)
    .map(([word]) => word);
};

/**
 * Offline default adapter: mirrors observed text verbatim (truncated) and
 * derives keyword tokens deterministically. It never invents entities, tags,
 * or speaker labels, and never rewrites the transcript.
 */
export const createDeterministicSemanticAdapter = (): SemanticUnderstandingAdapter => ({
  id: "deterministic-content",
  version: "semantic-adapter-v1",
  describe: ({observedText}) =>
    semanticMetadataSchema.parse({
      textSummary: observedText.slice(0, 1000),
      keywords: topKeywords(observedText, 12),
      entities: [],
      speaker: null,
      semanticTags: [],
    }),
});
