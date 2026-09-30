import type { ACPAgentClient } from './acp-agent-client.js';
import type { CodexAppServerClient } from './codex-app-server-client.js';
import type { ClaudeAgentClient } from './claude-agent-client.js';
import type { AgentToolDefinition } from '../shared/agent-tool-contract.js';

type CodexHostClient = Pick<CodexAppServerClient, 'initialize' | 'request' | 'respond' | 'on'>;
type ACPHostClient = Pick<ACPAgentClient, 'ensureSession' | 'configureSession' | 'prompt' | 'getModelCatalog'>;
type StreamHostClient = Pick<ClaudeAgentClient, 'prompt'> & { getModelCatalog(options?: { model?: string; refresh?: boolean }): Promise<unknown> };
type HostConnection = { protocol: 'codex'; client: CodexHostClient }
  | { protocol: 'acp'; client: ACPHostClient }
  | { protocol: 'claude' | 'openclaw'; client: StreamHostClient };
type HostProtocol = HostConnection['protocol'];
interface HostAgentMetadata {
  id: string;
  name: string;
  description: string;
  version?: string;
  status?: string;
  message?: string;
  compatible?: boolean;
  routes?: HostRoute[];
  routeProvider?: { listRoutes(): Promise<HostRoute[]>; resolve(id: string): Promise<HostRoute | null | undefined> };
}
export interface HostRoute {
  id: string;
  label?: unknown;
  description?: unknown;
  kind?: unknown;
  status?: unknown;
  message?: unknown;
  profile?: unknown;
  gatewayLabel?: unknown;
  supportsLocalTools?: unknown;
  supportsFeatureJobs?: unknown;
  supportsTextFeatureJobs?: unknown;
  protocol?: HostProtocol | null;
  client?: HostConnection['client'] | null;
}
export type HostAgent = HostAgentMetadata & HostConnection & { target?: HostRoute };
export type HostControlAction = 'install' | 'restart' | 'restart-companion' | 'update' | 'uninstall';
export interface AgentHostServiceOptions {
  appServer: CodexHostClient | null;
  token: string;
  workspaceRoot: string;
  toolTimeoutMs?: number;
  allowedOrigins?: string[];
  runtimeInfo?: () => { version?: string; runtimeMode?: string; platform?: string };
  controlHandler?: (action: HostControlAction, context: { origin: string }) => Promise<Record<string, unknown>>;
  agents?: (HostAgent | (HostAgentMetadata & { protocol: HostProtocol; client: null }))[];
  bundlePath?: string;
}
export interface HostUpload { path: string; mediaType: string; timer: ReturnType<typeof setTimeout> }
export interface ActiveHostTurn {
  agentId: string;
  threadId: string;
  turnId: string;
  send(event: unknown): void;
  cleanup(): void;
}
export interface PendingHostTool { threadId: string; timer: ReturnType<typeof setTimeout>; respond(result: unknown): void }
export interface McpSession { activeKey: string; tools: AgentToolDefinition[] }
export interface McpContext { token: string; session: McpSession }
export interface ExternalAgentTurnOptions {
  agent: Exclude<HostAgent, { protocol: 'codex' }>;
  agentId: string;
  targetId?: string;
  requestedThreadId: string;
  requestedActiveKey: string;
  dynamicTools: AgentToolDefinition[];
  sessionMcp: Map<string, McpContext>;
  mcpSessions: Map<string, McpSession>;
  maxMcpSessions: number;
  activeTurns: Map<string, ActiveHostTurn>;
  pendingTools: Map<string, PendingHostTool>;
  turnUploads: HostUpload[];
  cleanup(): void;
  origin: string;
  bridgePath: string | undefined;
  baseInstructions: string;
  requestedInstructions: string;
  history: { role: string; content: string }[];
  outputSchema: unknown;
  prompt: string;
  model: string | null;
  effort: string | null;
  send(event: unknown): void;
  close(): void;
  cleanError(error: unknown): string;
  createHandle(sessionId: string): string;
}
// Raw protocol fields are views for existing reads/coercions, not additional validation.
interface ACPUsageView { inputTokens?: unknown; input_tokens?: unknown; outputTokens?: unknown; output_tokens?: unknown }
interface ACPContentView { type?: unknown; text?: unknown }
export interface ACPUpdateEnvelope {
  params?: { update?: ACPUsageView & {
    sessionUpdate?: unknown; type?: unknown; content?: ACPContentView | null;
    message?: { content?: ACPContentView | null } | null;
    title?: unknown; usage?: ACPUsageView | null;
  } | null } | null;
}
export interface CodexHostMessage { id?: unknown; method?: unknown; params?: unknown }
export interface CodexNotificationParams extends Record<string, unknown> {
  turn?: { id?: unknown; status?: unknown } | null;
  tokenUsage?: { last?: unknown } | null;
}
export interface CodexThreadResult { thread?: { id?: unknown } | null; model?: unknown }
export interface CodexTurnResult { turn?: { id?: unknown } | null }

// Read the live map for deletion and the current thread key for every entry.
export function cancelPendingHostTools(
  getPending: () => Map<string, PendingHostTool>, getThreadId: () => string, result: () => unknown,
): void {
  for (const [responseId, pending] of getPending()) {
    if (pending.threadId !== getThreadId()) continue;
    clearTimeout(pending.timer);
    getPending().delete(responseId);
    try { pending.respond(result()); } catch { /* adapter already closed */ }
  }
}
