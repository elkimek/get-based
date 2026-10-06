export const AGENT_ACCESS_CLIENTS = [
  { id: 'hermes', label: 'Hermes Agent', terminal: 'Hermes' },
  { id: 'openclaw', label: 'OpenClaw', terminal: 'OpenClaw' },
  { id: 'claude-code', label: 'Claude Agent', terminal: 'Claude' },
  { id: 'claude-desktop', label: 'Claude Desktop', terminal: 'Claude Desktop' },
  { id: 'cursor', label: 'Cursor', terminal: 'Cursor' },
  { id: 'cline', label: 'Cline', terminal: 'Cline' },
  { id: 'codex', label: 'Codex CLI', terminal: 'Codex' },
] as const;

export type AgentAccessSecret = 'token' | 'context-key';

/** Presentation receives readiness and preferences, never hidden credentials. */
export interface AgentAccessSnapshot {
  enabled: boolean;
  pending: boolean;
  hasToken: boolean;
  syncReady: boolean;
  ownerReady: boolean;
  seriesDays: number;
}

export interface AgentAccessView {
  refresh(next: AgentAccessSnapshot): void;
  toggleSecret(kind: AgentAccessSecret, value: string): void;
}
