type ProcessOutput = string | Buffer | null | undefined;

export type SpawnOutcome = {
  error?: Error;
  status: number | null;
  stdout?: ProcessOutput;
  stderr?: ProcessOutput;
};

const outputText = (value: ProcessOutput): string =>
  typeof value === "string" ? value.trim() : Buffer.isBuffer(value) ? value.toString().trim() : "";

export const assertSpawnSucceeded = (
  command: string,
  args: string[],
  result: SpawnOutcome,
): void => {
  const invocation = [command, ...args].join(" ");
  if (result.error) {
    throw new Error(`无法启动命令：${invocation}`, {cause: result.error});
  }
  if (result.status !== 0) {
    const detail =
      outputText(result.stderr) || outputText(result.stdout) || `exit ${String(result.status)}`;
    throw new Error(`命令失败：${invocation}\n${detail}`);
  }
};

export const parseFiniteNumber = (value: string, label: string): number => {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} 不是有效数字：${value}`);
  return parsed;
};
