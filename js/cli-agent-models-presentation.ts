import type { AgentModel } from './agent-model-catalog.js';
import type { AgentExecutionTarget } from './agent-chat-client.js';
import type { CliAgentModelsSnapshot, CliAgentPicker } from './cli-agent-models-contract.js';

export function selectedModelEntry(models: AgentModel[], selectedModel: string) {
  return models.find(model => model.id === selectedModel || model.model === selectedModel)
    || models.find(model => model.isDefault)
    || models[0]
    || null;
}

export function getCLIAgentModelProvider(agentId: string, model: Pick<Partial<AgentModel>, 'id' | 'model'> | null) {
  const id = String(model?.id || model?.model || '');
  if (agentId === 'opencode' || agentId === 'openclaw') return id.includes('/') ? id.slice(0, id.indexOf('/')) : '';
  if (agentId === 'hermes') {
    if (id.startsWith('custom:')) {
      const parts = id.split(':');
      return parts.length > 2 ? parts.slice(0, 2).join(':') : 'custom';
    }
    return id.includes(':') ? id.slice(0, id.indexOf(':')) : '';
  }
  return '';
}

function agentProviderLabel(provider: string) {
  const known: Record<string, string> = {
    opencode: 'OpenCode', openrouter: 'OpenRouter', anthropic: 'Anthropic',
    'openai-codex': 'OpenAI Codex', openai: 'OpenAI', 'custom:ollama': 'Ollama',
    openclaw: 'OpenClaw', 'opencode-free': 'OpenCode Free', 'opencode-zen': 'OpenCode Zen',
    ollama: 'Ollama', 'ollama-cloud': 'Ollama Cloud', venice: 'Venice', xai: 'xAI',
    'custom:openrouter': 'OpenRouter (custom)',
  };
  return known[provider] || provider.split(/[-_]/).filter(Boolean)
    .map(part => `${part.charAt(0).toUpperCase()}${part.slice(1)}`).join(' ');
}

function agentModelLabel(agentId: string, model: AgentModel) {
  const provider = getCLIAgentModelProvider(agentId, model);
  let label = model.displayName || model.id || model.model;
  // Remove a catalog-provider prefix, never punctuation within a model name.
  const prefixes = new Set([provider.toLowerCase(), agentProviderLabel(provider).toLowerCase()]);
  for (const separator of ['/', ' · ']) {
    const boundary = label.indexOf(separator);
    if (provider && boundary >= 0 && prefixes.has(label.slice(0,boundary).trim().toLowerCase())) {
      label = label.slice(boundary + separator.length).trim();
    }
  }
  const id = String(model.id || model.model || '').toLowerCase();
  const isFree = id === 'opencode/big-pickle' || id.endsWith(':free') || /(?:^|[-/])free(?:$|[-/])/.test(id);
  return `${label}${isFree && !label.toLowerCase().includes('free') ? ' · Free' : ''}`;
}

export function buildCliAgentModelsSnapshot(models: AgentModel[], agentTargets: AgentExecutionTarget[], selection: {
  agent: string; target: string; model: string; effort: string; providerFilter: string;
}): CliAgentModelsSnapshot {
  let providerFilter = selection.providerFilter;
  const agentId = selection.agent;
  const selectedTarget = selection.target;
  const selectedModel = selection.model;
  const selectedEffort = selection.effort;
  const current = selectedModelEntry(models, selectedModel);
  const defaultModel = models.find(model => model.isDefault) || models[0] || null;
  const providers = [...new Set(models.map(model => getCLIAgentModelProvider(agentId, model)).filter(Boolean))];
  const selectedProvider = getCLIAgentModelProvider(agentId, current || defaultModel);
  if (!providers.includes(providerFilter)) providerFilter = selectedProvider || providers[0] || '';
  const visibleModels = providerFilter
    ? models.filter(model => getCLIAgentModelProvider(agentId, model) === providerFilter)
    : models;
  const modelOptions = [
    ...(!providers.length || getCLIAgentModelProvider(agentId, defaultModel) === providerFilter
      ? [{ value: '', label: `CLI default${defaultModel ? ` · ${agentModelLabel(agentId, defaultModel)}` : ''}` }]
      : []),
    ...visibleModels.map(model => {
      const value = model.id || model.model;
      return { value, label: agentModelLabel(agentId, model) || value };
    }),
  ];
  if (selectedModel && !models.some(model => model.id === selectedModel || model.model === selectedModel)) {
    modelOptions.splice(1, 0, { value: selectedModel, label: `${selectedModel} · unavailable` });
  }
  const efforts = current?.supportedReasoningEfforts || [];
  const defaultEffort = current?.defaultReasoningEffort || '';
  const effortOptions = [
    { value: '', label: efforts.length ? `Default${defaultEffort ? ` · ${defaultEffort}` : ''}`
      : agentId === 'hermes' ? 'Uses Hermes setting' : 'Not offered by this model' },
    ...efforts.map(item => ({ value: item.reasoningEffort, label: item.reasoningEffort })),
  ];
  if (selectedEffort && !efforts.some(item => item.reasoningEffort === selectedEffort)) {
    effortOptions.push({ value: selectedEffort, label: `${selectedEffort} · unavailable` });
  }
  const agentName = ({ codex: 'Codex CLI', claude: 'Claude Agent', opencode: 'OpenCode', hermes: 'Hermes Agent', grok: 'Grok Build', openclaw: 'OpenClaw' } as Record<string, string>)[agentId] || 'the selected CLI';
  const reasoningNote = !efforts.length && agentId === 'hermes'
    ? ' Hermes ACP does not expose a separate reasoning control yet, so getbased uses your Hermes setting.' : '';
  const targetOptions = agentTargets.map(target => ({
    value: target.id,
    label: `${target.label}${target.status === 'unavailable' ? ' · offline' : ''}`,
  }));
  const selectedTargetEntry = agentTargets.find(target => target.id === selectedTarget);
  const personalTarget = selectedTargetEntry?.kind === 'gateway';
  const pickers: CliAgentPicker[] = [];
  if (targetOptions.length > 1) pickers.push({ id: 'cli-agent-target', label: 'Execution', value: selectedTarget, options: targetOptions, action: 'set-cli-agent-target' });
  if (providers.length > 1) pickers.push({ id: 'cli-agent-provider', label: 'Provider catalog', value: providerFilter, options: providers.map(provider => ({ value: provider, label: agentProviderLabel(provider) })), action: 'set-cli-agent-provider-filter' });
  pickers.push({ id: 'cli-agent-model', label: 'Model', value: selectedModel, options: modelOptions, action: 'set-cli-agent-model', searchable: modelOptions.length > 12, placeholder: providerFilter ? `Choose ${agentProviderLabel(providerFilter)} model` : 'Choose a model' });
  pickers.push({ id: 'cli-agent-effort', label: 'Reasoning effort', value: selectedEffort, options: effortOptions, action: 'set-cli-agent-effort', disabled: !efforts.length });
  return { context: `${agentId}:${selectedTarget}`, providerFilter, pickers, loading: '', error: '', note: personalTarget
    ? 'Personal gateway uses that profile’s identity, memory, sessions, and configured tools. getbased sends the approved chat context, but its local health-data tools and background feature jobs are not available on this route.'
    : `Catalog supplied by ${agentName}. Your choices apply only to getbased sessions and do not change the CLI’s own default settings.${reasoningNote}` };
}
