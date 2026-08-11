import {createHash} from "node:crypto";
import {z} from "zod";
import {artifactRefSchema, type ArtifactRef} from "./artifact";
import {stableJson} from "../stable-json";

export const CONTENT_MANIFEST_SCHEMA_VERSION = "content-manifest-v1" as const;

const episodeIdSchema = z.string().regex(/^episode-[a-z0-9-]+$/u);
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u, "sha256 must be lowercase hex");
const issueIdSchema = z.string().min(1);

const uniqueStrings = (values: string[]): boolean => new Set(values).size === values.length;

const canonicalArtifactRefs = (refs: readonly ArtifactRef[]): ArtifactRef[] =>
  refs
    .map((ref) => artifactRefSchema.parse(ref))
    .sort((left, right) => {
      const artifactIdOrder = left.artifactId.localeCompare(right.artifactId);
      if (artifactIdOrder !== 0) return artifactIdOrder;
      const revisionOrder = left.revision - right.revision;
      if (revisionOrder !== 0) return revisionOrder;
      const hashOrder = left.sha256.localeCompare(right.sha256);
      if (hashOrder !== 0) return hashOrder;
      return left.path.localeCompare(right.path);
    });

/**
 * Hashes the exact reference set captured by a content freeze.
 *
 * The manifest deliberately does not contain its own hash. Its file hash is carried by the
 * manifest ArtifactRef, while this selection hash binds the content refs inside the file.
 */
export const hashContentSelection = (refs: readonly ArtifactRef[]): string =>
  createHash("sha256")
    .update(stableJson(canonicalArtifactRefs(refs)))
    .digest("hex");

export const contentManifestGateSnapshotSchema = z
  .object({
    contentGate: z.literal("pass"),
    openIssueIds: z.array(issueIdSchema).refine(uniqueStrings, {
      message: "open issue IDs must be unique",
    }),
    blockerIssueIds: z.array(issueIdSchema).refine(uniqueStrings, {
      message: "blocker issue IDs must be unique",
    }),
    majorIssueIds: z.array(issueIdSchema).refine(uniqueStrings, {
      message: "major issue IDs must be unique",
    }),
    rubricVersions: z.array(z.string().min(1)).refine(uniqueStrings, {
      message: "rubric versions must be unique",
    }),
  })
  .strict()
  .superRefine((value, context) => {
    const openIssueIds = new Set(value.openIssueIds);
    for (const [field, issueIds] of [
      ["blockerIssueIds", value.blockerIssueIds],
      ["majorIssueIds", value.majorIssueIds],
    ] as const) {
      for (const [index, issueId] of issueIds.entries()) {
        if (!openIssueIds.has(issueId)) {
          context.addIssue({
            code: "custom",
            path: [field, index],
            message: "blocking issue must remain open",
          });
        }
      }
    }
  });

export const contentManifestSchema = z
  .object({
    schemaVersion: z.literal(CONTENT_MANIFEST_SCHEMA_VERSION),
    episodeId: episodeIdSchema,
    frozenAt: z.string().datetime({offset: true}),
    frozenBy: z.string().min(1),
    selectionHash: sha256Schema,
    artifacts: z.array(artifactRefSchema).min(1),
    gateSnapshot: contentManifestGateSnapshotSchema,
    runId: z.string().min(1).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const artifactIds = new Set<string>();
    for (const [index, ref] of value.artifacts.entries()) {
      if (ref.episodeId !== value.episodeId) {
        context.addIssue({
          code: "custom",
          path: ["artifacts", index, "episodeId"],
          message: "manifest artifact belongs to another episode",
        });
      }
      if (artifactIds.has(ref.artifactId)) {
        context.addIssue({
          code: "custom",
          path: ["artifacts", index, "artifactId"],
          message: "manifest artifact IDs must be unique",
        });
      }
      artifactIds.add(ref.artifactId);
    }

    if (hashContentSelection(value.artifacts) !== value.selectionHash) {
      context.addIssue({
        code: "custom",
        path: ["selectionHash"],
        message: "selectionHash does not bind the manifest artifacts",
      });
    }
  });

export type ContentManifestGateSnapshot = z.infer<typeof contentManifestGateSnapshotSchema>;
export type ContentManifest = z.infer<typeof contentManifestSchema>;
