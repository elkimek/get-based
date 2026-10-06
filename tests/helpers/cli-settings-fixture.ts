import { mountCliAgentSettings } from '../../js/cli-agent-settings-component.js';
import { buildCliAgentSettingsSnapshot } from '../../js/cli-agent-settings-presentation.js';
import { normalizeDiscoveredAgent } from '../../js/agent-host-discovery.js';
import type { CliAgentSettingsActions } from '../../js/cli-agent-settings-contract.js';
export function cliSettingsFixture(agents: Record<string,unknown>[] = [], backend = 'direct', actions?: CliAgentSettingsActions) {
  document.body.innerHTML = '<main id="ai-provider-panel"><div data-cli-agent-settings-host></div></main>';
  return mountCliAgentSettings(document.querySelector<HTMLElement>('[data-cli-agent-settings-host]')!,buildCliAgentSettingsSnapshot(agents.map(normalizeDiscoveredAgent),{
    selectedAgent:'codex',backend,collapsed:new Set(),platform:'linux',origin:globalThis.location.origin,theme:'dark',
  }),actions || { scan:() => {},platform:() => {},copy:() => {},login:() => {},test:() => {},toggle:() => {},disclose:() => {},control:() => {} });
}
