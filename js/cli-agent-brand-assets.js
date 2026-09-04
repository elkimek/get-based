// @ts-check

// Small, identification-only marks for locally installed CLI agents.
// Sources and trademark constraints are recorded in brands/CLI_AGENTS.md.
const CLI_AGENT_BRAND_ASSETS = Object.freeze({
  codex: '/brands/cli-agent-codex.svg',
  claude: '/brands/cli-agent-claude.svg',
  opencode: '/brands/cli-agent-opencode.svg',
  hermes: '/brands/cli-agent-hermes.svg',
  grok: '/brands/cli-agent-grok.svg',
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
