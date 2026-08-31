export const EPISODE_VALIDATION_PROFILE_VALUES = ["fast", "production", "release"] as const;
export type EpisodeValidationProfile = (typeof EPISODE_VALIDATION_PROFILE_VALUES)[number];

export type CliArgs = {
  episode?: string;
  verifyOnly: boolean;
  positionals: string[];
};

/** Reads only --episode. Other flags belong to the calling command. */
export const parseEpisodeFlag = (argv: string[]): string | undefined => {
  let episode: string | undefined;
  for (let index = 2; index < argv.length; index += 1) {
    if (argv[index] !== "--episode") continue;
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error("参数 --episode 缺少值");
    }
    if (episode !== undefined) throw new Error("参数 --episode 不能重复");
    episode = value;
    index += 1;
  }
  return episode;
};

/** Reads only --profile. Other flags belong to the calling command. */
export const parseProfileFlag = (argv: string[]): EpisodeValidationProfile | undefined => {
  let profile: EpisodeValidationProfile | undefined;
  for (let index = 2; index < argv.length; index += 1) {
    if (argv[index] !== "--profile") continue;
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error("参数 --profile 缺少值");
    }
    if (profile !== undefined) throw new Error("参数 --profile 不能重复");
    if (!EPISODE_VALIDATION_PROFILE_VALUES.includes(value as EpisodeValidationProfile)) {
      throw new Error(
        `未知校验 profile：${value}。可用：${EPISODE_VALIDATION_PROFILE_VALUES.join("、")}`,
      );
    }
    profile = value as EpisodeValidationProfile;
    index += 1;
  }
  return profile;
};

/** Strict parser for render/restore CLIs. Unknown flags are errors. */
export const parseCliArgs = (argv: string[]): CliArgs => {
  const positionals: string[] = [];
  const episode = parseEpisodeFlag(argv);
  let verifyOnly = false;

  for (let index = 2; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--episode") {
      index += 1;
      continue;
    }
    if (argument === "--verify-only") {
      if (verifyOnly) throw new Error("参数 --verify-only 不能重复");
      verifyOnly = true;
      continue;
    }
    if (argument?.startsWith("--")) throw new Error(`未知参数：${argument}`);
    if (argument !== undefined) positionals.push(argument);
  }

  return {episode, verifyOnly, positionals};
};

export const parseRenderMode = (argv: string[]): "smoke" | "vertical" => {
  const {positionals} = parseCliArgs(argv);
  if (positionals.length > 1) {
    throw new Error(`渲染模式只能指定一个：${positionals.join(" ")}`);
  }
  const mode = positionals[0] ?? "vertical";
  if (mode !== "smoke" && mode !== "vertical") {
    throw new Error(`未知渲染模式：${mode}`);
  }
  return mode;
};
