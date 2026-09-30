import type { ChildProcess, SpawnOptions } from 'node:child_process';

export type FileAgentSpawnOptions = Omit<SpawnOptions, 'stdio'> & { stdio: ['ignore', number, number] };
export type FileAgentSpawner = (command: string, args: readonly string[], options: FileAgentSpawnOptions) => ChildProcess;

export interface ProcessAdapterOptions<Spawner> {
  command: string;
  args?: string[];
  cwd: string;
  env?: NodeJS.ProcessEnv;
  spawnImpl?: Spawner;
}

export interface ProcessAdapterState<Child, Spawner> {
  command: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv | undefined;
  spawnImpl: Spawner;
  children: Set<Child>;
  cancellations: Map<Child, () => void>;
}

export interface AgentUsage extends Record<string, unknown> {
  input_tokens?: unknown;
  output_tokens?: unknown;
}
export type AgentTurnEvent =
  | { type: 'session'; sessionId: string; model: string }
  | { type: 'text_delta'; delta: string }
  | { type: 'usage'; inputTokens: number; outputTokens: number }
  | { type: 'error' | 'done'; message?: string; resultText?: string; finishReason?: string; sessionId?: string; usage?: AgentUsage | null };

export interface AgentPromptBlock extends Record<string, unknown> { type?: unknown; text?: unknown }
export interface AgentMcpConfig {
  mcpServers?: { getbased?: { type?: unknown; command?: unknown; args?: unknown; env?: unknown } | null } | null;
}
export interface AgentTurnOptions {
  sessionId?: string | undefined;
  prompt: AgentPromptBlock[];
  model?: string | undefined;
  effort?: string | undefined;
  instructions: string;
  outputSchema?: unknown;
  mcpConfig: AgentMcpConfig | null | undefined;
  allowedToolNames: string[];
  signal?: AbortSignal;
  onEvent(event: AgentTurnEvent): void;
}
