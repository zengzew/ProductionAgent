import {z} from "zod";

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u, "sha256 must be lowercase hex");
const repositoryPathSchema = z
  .string()
  .min(1)
  .refine((value) => !value.startsWith("/") && !value.includes("\\"), {
    message: "path must be repository-relative and use forward slashes",
  })
  .refine((value) => !value.split("/").includes(".."), {
    message: "path must not escape the repository",
  });

export const artifactRefSchema = z
  .object({
    artifactId: z.string().regex(/^episode-[a-z0-9-]+:[a-z0-9-]+:[a-z0-9-]+$/u),
    episodeId: z.string().regex(/^episode-[a-z0-9-]+$/u),
    path: repositoryPathSchema,
    mediaType: z.string().min(1),
    schemaVersion: z.string().min(1),
    revision: z.number().int().positive(),
    sha256: sha256Schema,
    sizeBytes: z.number().int().nonnegative(),
    producer: z.string().min(1),
    createdAt: z.string().datetime({offset: true}),
  })
  .superRefine((value, context) => {
    if (!value.artifactId.startsWith(`${value.episodeId}:`)) {
      context.addIssue({
        code: "custom",
        path: ["artifactId"],
        message: "artifactId must belong to episodeId",
      });
    }
  });

export const artifactDependencySchema = z.object({
  artifactId: z.string().min(1),
  path: repositoryPathSchema,
  sha256: sha256Schema,
  relation: z.enum(["reads", "reviews", "materializes", "renders"]),
});

export const artifactRecordSchema = z.object({
  ref: artifactRefSchema,
  state: z.enum(["candidate", "selected", "stale", "quarantined", "superseded"]),
  producedByExecutionId: z.string().min(1),
  dependencies: z.array(artifactDependencySchema),
  supersedes: z
    .object({
      artifactId: z.string().min(1),
      revision: z.number().int().positive(),
      sha256: sha256Schema,
    })
    .optional(),
});

export const artifactIndexSchema = z.object({
  schemaVersion: z.literal("artifact-index-v1"),
  episodeId: z.string().regex(/^episode-[a-z0-9-]+$/u),
  artifacts: z.array(artifactRecordSchema),
  selected: z.record(
    z.string(),
    z.object({
      revision: z.number().int().positive(),
      sha256: sha256Schema,
      path: repositoryPathSchema,
    }),
  ),
});

export type ArtifactRef = z.infer<typeof artifactRefSchema>;
export type ArtifactDependency = z.infer<typeof artifactDependencySchema>;
export type ArtifactRecord = z.infer<typeof artifactRecordSchema>;
export type ArtifactIndex = z.infer<typeof artifactIndexSchema>;
