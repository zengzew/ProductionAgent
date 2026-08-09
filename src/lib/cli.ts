export type CliArgs = {
  episode?: string;
  positionals: string[];
};

export const parseCliArgs = (argv: string[]): CliArgs => {
  const positionals: string[] = [];
  let episode: string | undefined;

  for (let index = 2; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--episode") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("参数 --episode 缺少值");
      }
      if (episode !== undefined) throw new Error("参数 --episode 不能重复");
      episode = value;
      index += 1;
      continue;
    }
    if (argument?.startsWith("--")) throw new Error(`未知参数：${argument}`);
    if (argument !== undefined) positionals.push(argument);
  }

  return {episode, positionals};
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
