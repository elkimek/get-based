export type AIOutputIdentity = Partial<Record<'agentId' | 'provider' | 'modelId' | 'model' | 'modelDisplay' | 'error' | 'stopped' | 'truncated', unknown>>;


// Small, identification-only marks for locally installed CLI agents.
// Sources and trademark constraints are recorded in brands/CLI_AGENTS.md.
const CLI_AGENT_BRAND_ASSETS: Readonly<Record<string, string>> = Object.freeze({
  codex: '/brands/cli-agent-codex.svg',
  claude: '/brands/cli-agent-claude.svg',
  opencode: '/brands/cli-agent-opencode.svg',
  hermes: '/brands/cli-agent-hermes.svg',
  grok: '/brands/cli-agent-grok.svg',
  openclaw: '/brands/cli-agent-openclaw.svg',
});

export function getCLIAgentBrandAsset(agentId: string): string {
  return CLI_AGENT_BRAND_ASSETS[agentId] || '';
}

export function renderCLIAgentBrandIcon(agentId: string): string {
  const asset = getCLIAgentBrandAsset(agentId);
  return asset ? `<img src="${asset}" alt="" draggable="false">` : '<span class="local-agent-icon-fallback">CLI</span>';
}

// Call only for known AI output. This visible attribution is not a watermark,
// provider attestation, or a claim that imported content has been verified.
export function getAIOutputAttribution(identity: AIOutputIdentity = {}): string {
  // Error records contain application/provider diagnostics, not model output.
  // Stopped or truncated responses remain normal output and retain attribution.
  if (identity.error) return '';
  const agentId = String(identity.agentId || '').trim().toLowerCase();
  const provider = String(identity.provider || '').trim().toLowerCase();
  const grok = agentId === 'grok' || ['grok', 'xai', 'x-ai'].includes(provider)
    || [identity.modelId, identity.model, identity.modelDisplay]
    .some(value => /(^|[^a-z0-9])grok([^a-z0-9]|$)/i.test(String(value || '')));
  return grok ? 'Written with Grok' : 'AI-generated';
}
