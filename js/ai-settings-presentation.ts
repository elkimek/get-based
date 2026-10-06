import type { AiProviderChoice, AiSettingsSnapshot } from './ai-settings-contract.js';
const choices: readonly AiProviderChoice[] = [
  { id: 'ppq', label: 'PPQ', asset: '/brands/ai-provider-ppq.svg' },
  { id: 'routstr', label: 'Routstr', asset: '/brands/ai-provider-routstr.svg' },
  { id: 'openrouter', label: 'OpenRouter', asset: '/brands/ai-provider-openrouter.svg' },
  { id: 'venice', label: 'Venice', asset: '/brands/ai-provider-venice.svg' },
  { id: 'custom', label: 'Custom', path: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z' },
  { id: 'ollama', label: 'Local models', path: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15h-2v-6h2v6zm4 0h-2v-6h2v6zm-3-8c-.55 0-1-.45-1-1V6c0-.55.45-1 1-1s1 .45 1 1v2c0 .55-.45 1-1 1z' },
  { id: 'cli', label: 'CLI agents' },
];
export function buildAiSettingsSnapshot(options: {
  enabled: boolean;
  hideProviders: boolean;
  provider: string;
  backend: string;
}): AiSettingsSnapshot {
  return {
    enabled: options.enabled,
    hideProviders: options.hideProviders,
    activeProvider: options.backend === 'codex' ? 'cli' : options.provider,
    choices,
  };
}
