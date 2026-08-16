import {z} from "zod";
import mediaDiscoveryFile from "../../config/media-discovery.json";
import {mediaSourceTypeSchema} from "./schemas";

/**
 * Exact hostnames only: no scheme, no path, no port, no wildcard, lowercase.
 * The allowlist is matched against `URL.hostname`, so an entry like
 * `example.com` never matches `fooexample.com` or `example.com.evil.net`.
 */
const hostnamePattern =
  /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*$/u;

export const mediaDiscoveryConfigSchema = z
  .object({
    schemaVersion: z.literal("media-discovery-config-v1"),
    allowedHosts: z
      .array(z.string().min(1))
      .min(1, "allowedHosts must not be empty; an empty list never means allow-all")
      .superRefine((hosts, context) => {
        const seen = new Set<string>();
        hosts.forEach((host, index) => {
          const problems: string[] = [];
          if (host.includes("*")) problems.push("wildcards are forbidden");
          if (host.includes("://") || host.includes("/")) {
            problems.push("scheme and path are forbidden");
          }
          if (host !== host.toLowerCase()) problems.push("hostnames must be lowercase");
          if (!hostnamePattern.test(host)) problems.push("not a valid exact hostname");
          if (seen.has(host)) problems.push("duplicate hostname");
          seen.add(host);
          if (problems.length > 0) {
            context.addIssue({
              code: "custom",
              path: ["allowedHosts", index],
              message: problems.join("; "),
            });
          }
        });
      }),
    allowedSourceTypes: z
      .array(mediaSourceTypeSchema)
      .min(1, "allowedSourceTypes must not be empty")
      .superRefine((types, context) => {
        const seen = new Set<string>();
        types.forEach((type, index) => {
          if (seen.has(type)) {
            context.addIssue({
              code: "custom",
              path: ["allowedSourceTypes", index],
              message: "duplicate source type",
            });
          }
          seen.add(type);
        });
      }),
    maxCandidatesPerEpisode: z.number().int().positive(),
    requireHttps: z.literal(true),
  })
  .strict();

export type MediaDiscoveryConfig = z.infer<typeof mediaDiscoveryConfigSchema>;

export const parseMediaDiscoveryConfig = (value: unknown): MediaDiscoveryConfig =>
  mediaDiscoveryConfigSchema.parse(value);

/**
 * Parsed at module load. An invalid or missing file throws immediately instead
 * of silently falling back to an allow-all policy.
 */
export const mediaDiscoveryFileConfig = parseMediaDiscoveryConfig(mediaDiscoveryFile);
