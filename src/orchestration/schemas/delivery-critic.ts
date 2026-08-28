import fs from "node:fs";
import path from "node:path";
import {z} from "zod";
import {deliveryGateSchema} from "../../lib/delivery/delivery";
import {hashArtifactInputs} from "../observability";
import {stableJson} from "../stable-json";
import {buildArtifactRef, assertArtifactRefBytes} from "../artifact-registry";
import {artifactRefSchema, type ArtifactRef} from "./artifact";
import {artifactLocatorSchema, issueCategorySchema} from "./critic-output";

export const DELIVERY_CRITIC_REVIEW_PACKAGE_SCHEMA_VERSION =
  "delivery-critic-review-package-v1" as const;
export const DELIVERY_CRITIC_RESULT_SCHEMA_VERSION = "delivery-critic-result-v1" as const;

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const returnToSchema = z.enum([
  "none",
  "media-discovery",
  "media-retrieve",
  "media-verify",
  "media-select",
  "media-render-plan",
  "timeline",
  "captions",
  "tts",
  "render",
  "content",
]);

export const deliveryCriticReviewIssueSchema = z
  .object({
    issueId: z.string().min(1),
    owner: z.string().min(1),
    category: issueCategorySchema,
    severity: z.enum(["low", "medium", "high", "blocker"]),
    locator: artifactLocatorSchema,
    returnTo: returnToSchema,
    summary: z
      .string()
      .min(1)
      .refine((value) => Buffer.byteLength(value, "utf8") <= 500, {
        message: "delivery critic issue summary must not exceed 500 UTF-8 bytes",
      }),
  })
  .strict();

export const deliveryCriticReviewPackageSchema = z
  .object({
    schemaVersion: z.literal(DELIVERY_CRITIC_REVIEW_PACKAGE_SCHEMA_VERSION),
    packageId: z.string().min(1),
    episodeId: z.string().regex(/^episode-[a-z0-9-]+$/u),
    runId: z.string().min(1),
    boundedMediaOnly: z.literal(true),
    inputSetHash: sha256Schema,
    inputArtifacts: z.array(artifactRefSchema).min(1),
    reviewedVideo: artifactRefSchema,
    reviewedSubtitles: artifactRefSchema,
    reviewedTimeline: artifactRefSchema,
    inspection: artifactRefSchema,
    ttsMetadata: artifactRefSchema.nullable(),
    renderPlan: artifactRefSchema.nullable(),
    preRenderGate: artifactRefSchema.nullable(),
    reviewedKeyframes: z.array(artifactRefSchema),
    reviewedClips: z.array(artifactRefSchema),
    createdAt: z.string().datetime({offset: true}),
  })
  .strict()
  .superRefine((value, context) => {
    for (const [key, ref] of Object.entries(value)) {
      if (key === "createdAt" || key === "packageId" || key === "episodeId" || key === "runId") {
        continue;
      }
      if (Array.isArray(ref)) {
        for (const [index, item] of ref.entries()) {
          if (item.episodeId !== value.episodeId) {
            context.addIssue({
              code: "custom",
              path: [key, index, "episodeId"],
              message: "review package artifact belongs to another episode",
            });
          }
        }
      } else if (ref && typeof ref === "object" && "episodeId" in ref) {
        if ((ref as ArtifactRef).episodeId !== value.episodeId) {
          context.addIssue({
            code: "custom",
            path: [key, "episodeId"],
            message: "review package artifact belongs to another episode",
          });
        }
      }
    }
  });

export const deliveryCriticResultSchema = z
  .object({
    schemaVersion: z.literal(DELIVERY_CRITIC_RESULT_SCHEMA_VERSION),
    episodeId: z.string().regex(/^episode-[a-z0-9-]+$/u),
    runId: z.string().min(1),
    threadId: z.string().min(1),
    packageRef: artifactRefSchema,
    inputSetHash: sha256Schema,
    reviewedVideo: artifactRefSchema,
    reviewedSubtitles: artifactRefSchema,
    reviewedTimeline: artifactRefSchema,
    reviewedKeyframes: z.array(artifactRefSchema),
    reviewedClips: z.array(artifactRefSchema),
    verdict: z.enum(["PASS", "REJECT"]),
    issues: z.array(deliveryCriticReviewIssueSchema),
    deliveryGate: deliveryGateSchema,
    completedAt: z.string().datetime({offset: true}),
  })
  .strict()
  .superRefine((value, context) => {
    const refs = [
      value.packageRef,
      value.reviewedVideo,
      value.reviewedSubtitles,
      value.reviewedTimeline,
      ...value.reviewedKeyframes,
      ...value.reviewedClips,
    ];
    refs.forEach((ref, index) => {
      if (ref.episodeId !== value.episodeId) {
        context.addIssue({
          code: "custom",
          path: ["reviewedArtifacts", index, "episodeId"],
          message: "delivery critic result artifact belongs to another episode",
        });
      }
    });
    if (value.packageRef.episodeId !== value.episodeId) {
      context.addIssue({
        code: "custom",
        path: ["packageRef", "episodeId"],
        message: "package ref belongs to another episode",
      });
    }
    if (value.deliveryGate.verdict !== value.verdict) {
      context.addIssue({
        code: "custom",
        path: ["deliveryGate", "verdict"],
        message: "delivery gate verdict must equal result verdict",
      });
    }
  });

export type DeliveryCriticReviewPackage = z.infer<typeof deliveryCriticReviewPackageSchema>;
export type DeliveryCriticReviewIssue = z.infer<typeof deliveryCriticReviewIssueSchema>;
export type DeliveryCriticResult = z.infer<typeof deliveryCriticResultSchema>;

const runToken = (runId: string): string => encodeURIComponent(runId);

export const deliveryCriticReviewPackagePath = (episodeId: string, runId: string): string =>
  `.orchestration/handoffs/${episodeId}/${runToken(runId)}.delivery-critic-review-package.json`;

export const deliveryCriticResultPath = (episodeId: string, runId: string, attempt = 1): string =>
  `.orchestration/handoffs/${episodeId}/${runToken(runId)}.delivery-critic-result${
    attempt > 1 ? `.attempt-${attempt}` : ""
  }.json`;

const repositoryPath = (repoRoot: string, value: string): string => {
  const root = path.resolve(repoRoot);
  const absolute = path.resolve(root, value);
  const relative = path.relative(root, absolute);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`DELIVERY_CRITIC_PATH_ESCAPES_REPOSITORY:${value}`);
  }
  return absolute;
};

const writeJson = (filePath: string, value: unknown): void => {
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  const temporary = `${filePath}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporary, `${stableJson(value)}\n`, "utf8");
    fs.renameSync(temporary, filePath);
  } finally {
    if (fs.existsSync(temporary)) fs.rmSync(temporary, {force: true});
  }
};

export const writeDeliveryCriticReviewPackage = (input: {
  repoRoot: string;
  episodeId: string;
  runId: string;
  package: DeliveryCriticReviewPackage;
  previous?: ArtifactRef;
}): ArtifactRef => {
  const parsed = deliveryCriticReviewPackageSchema.parse(input.package);
  if (parsed.episodeId !== input.episodeId || parsed.runId !== input.runId) {
    throw new Error("DELIVERY_CRITIC_PACKAGE_IDENTITY_MISMATCH");
  }
  const packagePath = deliveryCriticReviewPackagePath(input.episodeId, input.runId);
  writeJson(repositoryPath(input.repoRoot, packagePath), parsed);
  return buildArtifactRef({
    repoRoot: input.repoRoot,
    artifactId: `${input.episodeId}:delivery:critic-review-package`,
    episodeId: input.episodeId,
    path: packagePath,
    mediaType: "application/json",
    schemaVersion: DELIVERY_CRITIC_REVIEW_PACKAGE_SCHEMA_VERSION,
    producer: "orchestrator:media-delivery-critic",
    ...(input.previous ? {previous: input.previous} : {}),
    createdAt: parsed.createdAt,
  });
};

export const readDeliveryCriticReviewPackage = (
  repoRoot: string,
  episodeId: string,
  runId: string,
): DeliveryCriticReviewPackage => {
  const filePath = repositoryPath(repoRoot, deliveryCriticReviewPackagePath(episodeId, runId));
  if (!fs.existsSync(filePath)) throw new Error("DELIVERY_CRITIC_REVIEW_PACKAGE_MISSING");
  return deliveryCriticReviewPackageSchema.parse(
    JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown,
  );
};

export const readDeliveryCriticResult = (
  repoRoot: string,
  episodeId: string,
  runId: string,
  attempt = 1,
): DeliveryCriticResult => {
  const filePath = repositoryPath(repoRoot, deliveryCriticResultPath(episodeId, runId, attempt));
  if (!fs.existsSync(filePath)) throw new Error("DELIVERY_CRITIC_RESULT_MISSING");
  return deliveryCriticResultSchema.parse(JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown);
};

const sameRef = (left: ArtifactRef, right: ArtifactRef): boolean =>
  left.artifactId === right.artifactId &&
  left.episodeId === right.episodeId &&
  left.path === right.path &&
  left.revision === right.revision &&
  left.sha256 === right.sha256 &&
  left.sizeBytes === right.sizeBytes;

const includesRef = (refs: readonly ArtifactRef[], target: ArtifactRef): boolean =>
  refs.some((ref) => sameRef(ref, target));

/** Strict package/result and current-byte gate used before canonical report creation. */
export const validateDeliveryCriticResult = (input: {
  repoRoot: string;
  episodeId: string;
  runId: string;
  threadId: string;
  packageRef: ArtifactRef;
  package: DeliveryCriticReviewPackage;
  result: DeliveryCriticResult;
}): DeliveryCriticResult => {
  const reviewPackage = deliveryCriticReviewPackageSchema.parse(input.package);
  const result = deliveryCriticResultSchema.parse(input.result);
  if (reviewPackage.episodeId !== input.episodeId || reviewPackage.runId !== input.runId) {
    throw new Error("DELIVERY_CRITIC_PACKAGE_IDENTITY_MISMATCH");
  }
  if (
    result.episodeId !== input.episodeId ||
    result.runId !== input.runId ||
    result.threadId !== input.threadId
  ) {
    throw new Error("DELIVERY_CRITIC_RESULT_IDENTITY_MISMATCH");
  }
  if (hashArtifactInputs(reviewPackage.inputArtifacts) !== reviewPackage.inputSetHash) {
    throw new Error("DELIVERY_CRITIC_PACKAGE_INPUT_SET_HASH_MISMATCH");
  }
  for (const ref of reviewPackage.inputArtifacts) assertArtifactRefBytes(input.repoRoot, ref);
  if (!sameRef(result.packageRef, input.packageRef)) {
    throw new Error("DELIVERY_CRITIC_RESULT_PACKAGE_REF_MISMATCH");
  }
  if (result.inputSetHash !== reviewPackage.inputSetHash) {
    throw new Error("DELIVERY_CRITIC_RESULT_INPUT_SET_MISMATCH");
  }
  if (result.packageRef.artifactId !== `${input.episodeId}:delivery:critic-review-package`) {
    throw new Error("DELIVERY_CRITIC_RESULT_PACKAGE_ID_MISMATCH");
  }
  assertArtifactRefBytes(input.repoRoot, result.packageRef);
  const packageRefs = [
    reviewPackage.reviewedVideo,
    reviewPackage.reviewedSubtitles,
    reviewPackage.reviewedTimeline,
    ...reviewPackage.reviewedKeyframes,
    ...reviewPackage.reviewedClips,
  ];
  for (const ref of packageRefs) {
    if (!includesRef(reviewPackage.inputArtifacts, ref)) {
      throw new Error(`DELIVERY_CRITIC_PACKAGE_REVIEW_REF_NOT_IN_INPUTS:${ref.artifactId}`);
    }
  }
  if (
    !sameRef(result.reviewedVideo, reviewPackage.reviewedVideo) ||
    !sameRef(result.reviewedSubtitles, reviewPackage.reviewedSubtitles) ||
    !sameRef(result.reviewedTimeline, reviewPackage.reviewedTimeline)
  ) {
    throw new Error("DELIVERY_CRITIC_PRIMARY_REVIEW_REF_MISMATCH");
  }
  for (const ref of [result.reviewedVideo, result.reviewedSubtitles, result.reviewedTimeline]) {
    if (!includesRef(packageRefs, ref))
      throw new Error(`DELIVERY_CRITIC_REVIEW_REF_NOT_IN_PACKAGE:${ref.artifactId}`);
    assertArtifactRefBytes(input.repoRoot, ref);
  }
  for (const ref of [...result.reviewedKeyframes, ...result.reviewedClips]) {
    if (!includesRef(packageRefs, ref))
      throw new Error(`DELIVERY_CRITIC_REVIEW_REF_NOT_IN_PACKAGE:${ref.artifactId}`);
    assertArtifactRefBytes(input.repoRoot, ref);
  }
  const gate = result.deliveryGate;
  if (
    gate.reviewedVideo !== result.reviewedVideo.path ||
    gate.reviewedVideoSha256 !== result.reviewedVideo.sha256 ||
    gate.reviewedSubtitles !== result.reviewedSubtitles.path ||
    gate.reviewedSubtitlesSha256 !== result.reviewedSubtitles.sha256 ||
    gate.reviewedTimeline !== result.reviewedTimeline.path ||
    gate.reviewedTimelineSha256 !== result.reviewedTimeline.sha256
  ) {
    throw new Error("DELIVERY_CRITIC_GATE_REVIEW_HASH_MISMATCH");
  }
  if (result.verdict === "PASS" && result.issues.length > 0) {
    throw new Error("DELIVERY_CRITIC_PASS_CANNOT_HAVE_ISSUES");
  }
  if (result.verdict === "REJECT" && gate.returnTo === "none") {
    throw new Error("DELIVERY_CRITIC_REJECT_REQUIRES_RETURN_TO");
  }
  return result;
};

export const deliveryCriticReportMarkdown = (gate: z.infer<typeof deliveryGateSchema>): string =>
  [
    "# Delivery Critic Report",
    "",
    "<!-- delivery-gate",
    JSON.stringify(gate, null, 2),
    "-->",
    "",
  ].join("\n");
