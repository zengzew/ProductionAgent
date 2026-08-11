import crypto from "node:crypto";
import fs from "node:fs";
import {isDeepStrictEqual} from "node:util";
import {z} from "zod";
import {
  captionPlanSchema,
  scriptSchema,
  timelineSchema,
  type CaptionPlan,
  type Script,
  type Timeline,
} from "../../src/schemas/episode";
import {assertTimelineMatchesEpisode, type RenderContract} from "../../src/lib/render-contract";
import {assertTimelineMatchesProductionContract} from "../../src/lib/production-contract";

const generatedCaptionArtifactSchema = z.array(
  z.object({
    sceneId: z.string().min(1),
    text: z.string().min(1),
  }),
);

export type GeneratedCaptionArtifact = z.infer<typeof generatedCaptionArtifactSchema>[number];

export const sha256 = (value: string | Buffer): string =>
  crypto.createHash("sha256").update(value).digest("hex");

export const hashFile = (filePath: string): string => sha256(fs.readFileSync(filePath));

export const jsonValuesEqual = (left: unknown, right: unknown): boolean =>
  isDeepStrictEqual(left, right);

export const readJsonFile = <T>(filePath: string): T => {
  let source: string;
  try {
    source = fs.readFileSync(filePath, "utf8");
  } catch (error) {
    throw new Error(`无法读取 JSON 文件：${filePath}`, {cause: error});
  }
  try {
    return JSON.parse(source) as T;
  } catch (error) {
    throw new Error(`无法解析 JSON 文件：${filePath}`, {cause: error});
  }
};

export const parseJsonText = <T>(source: string, label: string): T => {
  try {
    return JSON.parse(source) as T;
  } catch (error) {
    throw new Error(`无法解析 JSON：${label}`, {cause: error});
  }
};

const parseArtifact = <T>(schema: z.ZodType<T>, filePath: string, label: string): T => {
  try {
    return schema.parse(readJsonFile<unknown>(filePath));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${label} 无效：${filePath}\n${detail}`, {cause: error});
  }
};

export const readScript = (filePath: string): Script =>
  parseArtifact(scriptSchema, filePath, "脚本 JSON");

export const readCaptionPlan = (filePath: string): CaptionPlan =>
  parseArtifact(captionPlanSchema, filePath, "字幕规划 JSON");

export const readGeneratedCaptions = (filePath: string): GeneratedCaptionArtifact[] =>
  parseArtifact(generatedCaptionArtifactSchema, filePath, "生成字幕 JSON");

export const readTimeline = (
  filePath: string,
  options: {
    episodeId?: string;
    productionContract?: boolean;
    renderContract?: Pick<RenderContract, "layoutVariant">;
  } = {},
): Timeline => {
  const timeline = parseArtifact(timelineSchema, filePath, "时间轴 JSON");
  if (options.episodeId) assertTimelineMatchesEpisode(timeline, options.episodeId);
  if (options.productionContract) assertTimelineMatchesProductionContract(timeline);
  if (options.renderContract && timeline.layoutVariant !== options.renderContract.layoutVariant) {
    throw new Error(
      `时间轴版式不匹配：期望 ${options.renderContract.layoutVariant}，实际 ${timeline.layoutVariant}`,
    );
  }
  return timeline;
};

export const groupCaptionTextsByScene = (
  captions: readonly GeneratedCaptionArtifact[],
): Map<string, string[]> => {
  const captionsByScene = new Map<string, string[]>();
  for (const caption of captions) {
    const sceneCaptions = captionsByScene.get(caption.sceneId) ?? [];
    sceneCaptions.push(caption.text);
    captionsByScene.set(caption.sceneId, sceneCaptions);
  }
  return captionsByScene;
};

export const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

let cliErrorHandlersInstalled = false;

export const installCliErrorHandlers = (): void => {
  if (cliErrorHandlersInstalled) return;
  cliErrorHandlersInstalled = true;
  const handle = (error: unknown): void => {
    console.error(errorMessage(error));
    process.exitCode = 1;
  };
  process.once("uncaughtException", handle);
  process.once("unhandledRejection", handle);
};

export class ValidationErrors {
  readonly messages: string[] = [];

  get length(): number {
    return this.messages.length;
  }

  push(...messages: string[]): number {
    return this.messages.push(...messages);
  }

  capture(operation: () => void): void {
    try {
      operation();
    } catch (error) {
      this.push(errorMessage(error));
    }
  }
}

const messagesFrom = (errors: ValidationErrors | readonly string[]): readonly string[] =>
  errors instanceof ValidationErrors ? errors.messages : errors;

export const fatal = (errors: ValidationErrors | readonly string[] | string): never => {
  const messages = typeof errors === "string" ? [errors] : messagesFrom(errors);
  process.exitCode = 1;
  throw new Error(messages.join("\n"));
};

export const finishValidation = (
  errors: ValidationErrors | readonly string[],
  successMessage: string,
): boolean => {
  const messages = messagesFrom(errors);
  if (messages.length > 0) {
    console.error(messages.join("\n"));
    process.exitCode = 1;
    return false;
  } else {
    console.log(successMessage);
    return true;
  }
};
