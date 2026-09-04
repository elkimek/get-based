// @ts-check

// Small, identification-only marks for locally installed CLI agents.
// Sources and trademark constraints are recorded in brands/CLI_AGENTS.md.
const CLI_AGENT_BRAND_ASSETS = Object.freeze({
  codex: '/brands/cli-agent-codex.svg',
  claude: '/brands/cli-agent-claude.svg',
  opencode: '/brands/cli-agent-opencode.svg',
  hermes: '/brands/cli-agent-hermes.svg',
  grok: '/brands/cli-agent-grok.svg',
  openclaw: '/brands/cli-agent-openclaw.svg',
});

/** @param {string} agentId */
export function getCLIAgentBrandAsset(agentId) {
  return CLI_AGENT_BRAND_ASSETS[agentId] || '';
}

/** @param {string} agentId */
export function renderCLIAgentBrandIcon(agentId) {
  const asset = getCLIAgentBrandAsset(agentId);
  return asset ? `<img src="${asset}" alt="" draggable="false">` : '<span class="local-agent-icon-fallback">CLI</span>';
}

/** @param {{agentId?: unknown, provider?: unknown, modelId?: unknown, model?: unknown, modelDisplay?: unknown}} [identity] */
export function getAIOutputAttribution(identity = {}) {
  const agentId = String(identity.agentId || '').trim().toLowerCase();
  const provider = String(identity.provider || '').trim().toLowerCase();
  const grok = agentId === 'grok' || ['grok', 'xai', 'x-ai'].includes(provider)
    || [identity.modelId, identity.model, identity.modelDisplay]
    .some(value => /(^|[^a-z0-9])grok([^a-z0-9]|$)/i.test(String(value || '')));
  return grok ? 'Written with Grok' : '';
}
