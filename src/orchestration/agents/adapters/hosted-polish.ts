import fs from "node:fs";
import path from "node:path";
import {z} from "zod";
import {chatJson, type ChatClientConfig} from "../../../lib/llm";
import {buildArtifactRef} from "../../artifact-registry";
import type {AgentExecutionRequest} from "../../schemas/agent";
import {createAgentRunner, type AgentRunner} from "../run-agent";

const hostedOutputSchema = z.object({
  outputs: z.array(
    z.object({
      artifactId: z.string().min(1),
      path: z.string().min(1),
      schemaVersion: z.string().min(1),
      content: z.string(),
    }),
  ),
});

type HostedChat = <T>(
  config: ChatClientConfig,
  messages: Array<{role: "system" | "user"; content: string}>,
) => Promise<T>;

export type HostedPolishAdapterOptions = {
  repoRoot: string;
  enabled: boolean;
  endpoint: string;
  apiKey: string | undefined;
  model: string;
  temperature?: number;
  allowedOrigins?: readonly string[];
  chat?: HostedChat;
  createdAt?: () => string;
};

const readRepositoryFile = (repoRoot: string, repositoryPath: string): string => {
  const absolutePath = path.resolve(repoRoot, repositoryPath);
  const relative = path.relative(repoRoot, absolutePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`hosted-polish input escapes repository: ${repositoryPath}`);
  }
  return fs.readFileSync(absolutePath, "utf8");
};

const writeRepositoryFile = (repoRoot: string, repositoryPath: string, content: string): void => {
  const absolutePath = path.resolve(repoRoot, repositoryPath);
  const relative = path.relative(repoRoot, absolutePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`hosted-polish output escapes repository: ${repositoryPath}`);
  }
  fs.mkdirSync(path.dirname(absolutePath), {recursive: true});
  const temporaryPath = `${absolutePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, content);
  fs.renameSync(temporaryPath, absolutePath);
};

/** Optional, network-capable adapter for the one approved hosted content role. */
export const createHostedPolishAdapter = (options: HostedPolishAdapterOptions): AgentRunner => {
  if (!options.enabled) throw new Error("hosted-polish requires explicit opt-in");
  const endpoint = new URL(options.endpoint);
  if (endpoint.protocol !== "https:") {
    throw new Error("hosted-polish requires an HTTPS hosted endpoint");
  }
  const allowedOrigins = options.allowedOrigins ?? ["https://api.openai.com"];
  if (!allowedOrigins.includes(endpoint.origin)) {
    throw new Error(`hosted-polish endpoint is not approved: ${endpoint.origin}`);
  }
  if (!options.apiKey) throw new Error("hosted-polish requires an API key");

  const runChat = options.chat ?? chatJson;
  return createAgentRunner(async (request: AgentExecutionRequest) => {
    if (request.agentName !== "oral-rewriter") {
      throw new Error("hosted-polish is allowed only for oral-rewriter");
    }
    const expected = new Map(request.expectedOutputs.map((output) => [output.artifactId, output]));
    const response = hostedOutputSchema.parse(
      await runChat<unknown>(
        {
          endpoint: options.endpoint,
          apiKey: options.apiKey!,
          model: options.model,
          temperature: options.temperature ?? 0.4,
        },
        [
          {role: "system", content: readRepositoryFile(options.repoRoot, request.promptRef.path)},
          {
            role: "user",
            content: JSON.stringify({
              contractVersion: request.contractVersion,
              episodeId: request.episodeId,
              revisionRound: request.revisionRound,
              expectedOutputs: request.expectedOutputs,
              inputs: request.inputArtifacts.map((artifact) => ({
                artifact,
                content: readRepositoryFile(options.repoRoot, artifact.path),
              })),
            }),
          },
        ],
      ),
    );
    if (response.outputs.length !== expected.size) {
      throw new Error("hosted-polish returned an incomplete output set");
    }
    if (
      new Set(response.outputs.map((output) => output.artifactId)).size !== response.outputs.length
    ) {
      throw new Error("hosted-polish returned duplicate outputs");
    }
    for (const output of response.outputs) {
      const declaration = expected.get(output.artifactId);
      if (
        !declaration ||
        declaration.path !== output.path ||
        declaration.schemaVersion !== output.schemaVersion
      ) {
        throw new Error(`hosted-polish returned undeclared output: ${output.artifactId}`);
      }
    }
    for (const output of response.outputs) {
      writeRepositoryFile(options.repoRoot, output.path, output.content);
    }
    const outputArtifacts = response.outputs.map((output) =>
      buildArtifactRef({
        repoRoot: options.repoRoot,
        artifactId: output.artifactId,
        episodeId: request.episodeId,
        path: output.path,
        mediaType: output.path.endsWith(".json") ? "application/json" : "text/markdown",
        schemaVersion: output.schemaVersion,
        producer: "hosted-polish:oral-rewriter",
        createdAt: options.createdAt?.(),
      }),
    );
    return {
      contractVersion: "agent-execution-result-v1",
      executionId: request.executionId,
      status: "SUCCEEDED",
      outputArtifacts,
      decision: {code: "HOSTED_POLISH_SUCCEEDED", summary: "hosted polish outputs validated"},
    };
  });
};
