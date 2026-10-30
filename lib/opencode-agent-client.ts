// OpenCode V2 ACP replaces configured MCP entries with Code Mode entries.
// Configure direct tools before starting a dedicated turn process so enabling
// getbased tools never requires granting its general JavaScript/fetch executor.
import { ACPAgentClient } from './acp-agent-client.js';
import type { HostMcpServer } from './agent-host-turn-state.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';

// ACP's MCP acknowledgement precedes V2's native tool-registry update. The
// first session can otherwise retain an empty provider tool list. Keep this
// bounded settling interval outside the user's conversation; no model runs.
const MCP_REGISTRY_SETTLE_MS = 1_000;

export function createOpenCodeTurnClientFactory(options: ConstructorParameters<typeof ACPAgentClient>[0]) {
  return (servers: HostMcpServer[]) => {
    const config = JSON.parse(options.env?.OPENCODE_CONFIG_CONTENT || '{}') as Record<string, unknown>;
    const cwd = mkdtempSync(join(options.cwd, 'opencode-turn-'));
    const client = new ACPAgentClient({
      ...options,
      cwd,
      env: { ...options.env, OPENCODE_CONFIG_CONTENT: JSON.stringify({
        ...config,
        mcp: { servers: Object.fromEntries(servers.map(server => [server.name, {
          type: 'local', command: [server.command, ...server.args],
          environment: Object.fromEntries(server.env.map(item => [item.name, item.value])),
          codemode: false,
        }])) },
      }) },
    });
    return {
      client,
      async afterCatalog(warmup: Awaited<ReturnType<ACPAgentClient['ensureSession']>>) {
        // The initial session can snapshot tools while MCP is connecting.
        // Start the user conversation only after that catalog is available.
        await new Promise(resolve => setTimeout(resolve, MCP_REGISTRY_SETTLE_MS));
        const session = await client.ensureSession({ mcpServers: [] });
        await client.request('session/delete', { sessionId: warmup.sessionId }).catch(() => {});
        return session;
      },
      async close() {
        try { await client.close(); }
        finally { rmSync(cwd, { recursive: true, force: true }); }
      },
    };
  };
}
