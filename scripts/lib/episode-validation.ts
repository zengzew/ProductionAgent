import type {EpisodeValidationProfile} from "../../src/lib/episode/cli";

export const EPISODE_VALIDATION_SCRIPTS = {
  fast: ["validate-research.ts", "validate-workflow.ts"],
  production: ["validate-research.ts", "validate-story.ts", "validate-content.ts"],
  release: [
    "validate-research.ts",
    "validate-story.ts",
    "validate-content.ts",
    "validate-delivery.ts",
  ],
} as const satisfies Record<EpisodeValidationProfile, readonly string[]>;

export const episodeValidationScripts = (profile: EpisodeValidationProfile): readonly string[] =>
  EPISODE_VALIDATION_SCRIPTS[profile];

export const stripProfileFlag = (argv: string[]): string[] => {
  const output: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--" || argument === "--profile") {
      if (argument === "--profile") index += 1;
      continue;
    }
    if (argument !== undefined) output.push(argument);
  }
  return output;
};
