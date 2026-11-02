// Catalog ordering and capabilities stay independent of DOM ownership.
import { getActiveModelDisplay, getActiveModelId, getAIProvider, getVeniceE2EE,
  getPpqPrivateMode, isRoutstrPrivateModeActive, isRecommendedModel,
  modelMetadataIsAvailable, modelMetadataSupportsVision, selectLatestModelFamilies, selectLatestRecommendedModels } from './api.js';
import { readStoredArray } from './api-provider-storage.js';
import { getCachedLocalAiModelDetails } from './provider-local-ai-runtime.js';
import { getAgentHostAgent, getAgentHostEffort, getAgentHostModel, getAgentHostTarget, getChatBackend } from './agent-chat-settings.js';
import { getAgentModelDisplay, getCachedAgentModelCatalog, resolveAgentModel, sortReasoningEffortValues, type AgentModel } from './agent-model-catalog.js';
import { getDirectChatReasoningEffort } from './chat-model-preferences.js';
import { getModelReasoningCapabilities } from './reasoning-capabilities.js';
import type { AssistantSelection } from '../shared/agent-control-contract.js';
import { getAppExtensionAIConnectionState } from './app-extension-runtime.js';
interface DirectModel extends Record<string,unknown> {id?:unknown;name?:unknown;displayName?:unknown}
interface ControlModel {id:unknown;name:unknown;search:unknown;group:string|undefined}
interface ControlCommon {provider:string;providerLabel:unknown;selectedId:unknown;selectedName:unknown;models:ControlModel[];efforts:string[];defaultEffort:string;selectedEffort:string}
export type ChatModelControlState = (ControlCommon & {cli:true;target:string;selectedId:string}) | (ControlCommon & {cli:false});
type ControlState = ChatModelControlState;
interface EffortOption {value:string;label:string}
const PROVIDER_LABELS = Object.freeze({
  ollama: 'Local AI',
  venice: 'Venice',
  openrouter: 'OpenRouter',
  routstr: 'Routstr',
  ppq: 'PPQ',
  custom: 'Custom API',
  codex: 'Codex CLI',
  claude: 'Claude Agent',
  opencode: 'OpenCode',
  hermes: 'Hermes Agent',
  grok: 'Grok Build',
  openclaw: 'OpenClaw',
});

function titleCase(value: unknown) {
  const raw = String(value || '');
  if (raw === 'xhigh') return 'Extra high';
  if (raw === 'none') return 'Off';
  return raw ? `${raw.charAt(0).toUpperCase()}${raw.slice(1)}` : 'Default';
}

function normalizedEfforts(value: unknown) {
  if (!Array.isArray(value)) return [];
  return sortReasoningEffortValues([...new Set(value.map(item => typeof item === 'string'
    ? item
    : (item as {reasoningEffort?:unknown;effort?:unknown;value?:unknown}|null|undefined)?.reasoningEffort || (item as {effort?:unknown}|null|undefined)?.effort || (item as {value?:unknown}|null|undefined)?.value || '').map(item => String(item).trim()).filter(Boolean))]);
}

export function isChatModelRow(model: DirectModel) {
  const kind = String(model.type || model.task || '').toLowerCase().trim();
  if (['embedding', 'embeddings', 'embedder', 'text-embedding', 'rerank', 'reranker', 'image', 'video', 'image-generation', 'image_generation', 'diffusion', 'tts', 'stt', 'transcription'].includes(kind)) return false;
  const capabilities = model.capabilities;
  return !(capabilities && typeof capabilities === 'object' && 'chat' in capabilities && capabilities.chat === false);
}

function readDirectModels(provider: string): DirectModel[] {
  const policy = getAppExtensionAIConnectionState(provider).policy;
  const allowed = (id: unknown) => !policy?.enforced || Array.isArray(policy.allowlist) && policy.allowlist.includes(String(id));
  if (provider === 'ollama') {
    return getCachedLocalAiModelDetails().modelDetails.map(model => ({
      ...model,
      id: model.name || model.id,
      name: model.name || model.id,
    })).filter(model => model.id && allowed(model.id) && isChatModelRow(model));
  }
  const keys = ({
    openrouter: ['labcharts-openrouter-models'],
    venice: [getVeniceE2EE() ? 'labcharts-venice-e2ee-models' : 'labcharts-venice-models'],
    routstr: [isRoutstrPrivateModeActive() ? 'labcharts-routstr-private-models' : 'labcharts-routstr-models'],
    ppq: [getPpqPrivateMode() ? 'labcharts-ppq-private-models' : 'labcharts-ppq-models'],
    custom: ['labcharts-custom-models'],
  } as Record<string,string[]>)[provider] || [];
  const models = keys.flatMap(readStoredArray<unknown>).filter(model => model && typeof model === 'object'
    && (model as DirectModel).id && allowed((model as DirectModel).id) && modelMetadataIsAvailable(model) && isChatModelRow(model as DirectModel)) as DirectModel[];
  return [...new Map(models.map(model => [model.id, model])).values()];
}

function providerGroupFromModel(agent: string, modelId: unknown) {
  const id = String(modelId || '');
  if (agent === 'opencode' || agent === 'openclaw') return id.includes('/') ? id.split('/')[0] : agent;
  if (agent === 'hermes') {
    if (id.startsWith('custom:')) return id.split(':').slice(0, 2).join(':');
    return id.includes(':') ? id.split(':')[0] : 'Hermes';
  }
  return '';
}

export function friendlyChatModelGroup(value: unknown) {
  const known = {
    recommended: 'Recommended',
    current: 'Current personal profile',
    other: 'Other models',
    openrouter: 'OpenRouter',
    anthropic: 'Anthropic',
    openai: 'OpenAI',
    'openai-codex': 'OpenAI Codex',
    opencode: 'OpenCode',
    openclaw: 'OpenClaw',
    'opencode-free': 'OpenCode Free',
    'opencode-zen': 'OpenCode Zen',
    ollama: 'Ollama',
    'ollama-cloud': 'Ollama Cloud',
    venice: 'Venice',
    xai: 'xAI',
    'custom:ollama': 'Ollama',
    'custom:openrouter': 'OpenRouter (custom)',
  };
  return (known as Record<PropertyKey,unknown>)[value as PropertyKey] || String(value || '').split(/[-_:]/).filter(Boolean)
    .map(part => `${part.charAt(0).toUpperCase()}${part.slice(1)}`).join(' ');
}

function cliModelIsRecommended(agent: string, modelId: unknown) {
  const id = String(modelId || '');
  if (agent === 'opencode' && id.startsWith('openrouter/')) {
    return isRecommendedModel('openrouter', id.slice('openrouter/'.length));
  }
  return isRecommendedModel('custom', id);
}

function orderCliModels(agent: string, target: string, catalog: AgentModel[]) {
  // A personal gateway is the authority for its own profile. Do not apply
  // getbased's cross-provider recommendations to that catalog: they can make
  // an unrelated model look endorsed even when the gateway merely reports it.
  const recommended = target === 'local'
    ? (selectLatestModelFamilies as (models:AgentModel[])=>AgentModel[])(catalog.filter(model => cliModelIsRecommended(agent, model.id)))
    : catalog.filter(model => model.isDefault);
  const recommendedIds = new Set(recommended.map(model => model.id));
  return {
    recommendedIds,
    models: [...recommended, ...catalog.filter(model => !recommendedIds.has(model.id))],
  };
}

function orderDirectModels(provider: string, catalog: DirectModel[]) {
  const recommended = (selectLatestRecommendedModels as (provider:Parameters<typeof selectLatestRecommendedModels>[0],models:DirectModel[])=>DirectModel[])(provider, catalog);
  const recommendedIds = new Set(recommended.map(model => model.id));
  return {
    recommendedIds,
    models: [...recommended, ...catalog.filter(model => !recommendedIds.has(model.id))],
  };
}

export function getChatModelControlState(): ControlState {
  const cli = getChatBackend() === 'codex';
  if (cli) {
    const agent = getAgentHostAgent();
    const target = getAgentHostTarget(agent);
    const catalog = getCachedAgentModelCatalog(agent, target);
    const selectedId = getAgentHostModel();
    const selected = resolveAgentModel(selectedId, catalog);
    const defaultModel = catalog.find(model => model.isDefault) || catalog[0] || null;
    const orderedCatalog = orderCliModels(agent, target, catalog);
    const models: ControlModel[] = [
      {
        id: '',
        name: defaultModel ? `Default · ${defaultModel.displayName}` : 'CLI default',
        search: `default ${defaultModel?.displayName || ''} ${defaultModel?.id || ''}`,
        group: '',
      },
      ...orderedCatalog.models.map(model => ({
        id: model.id,
        name: model.displayName || model.id,
        search: `${model.displayName || ''} ${model.id} ${model.model || ''}`,
        group: orderedCatalog.recommendedIds.has(model.id)
          ? (target === 'local' ? 'recommended' : 'current')
          : providerGroupFromModel(agent, model.id) || (orderedCatalog.recommendedIds.size ? 'other' : ''),
      })),
    ];
    if (selectedId && !catalog.some(model => model.id === selectedId || model.model === selectedId)) {
      models.splice(1, 0, { id: selectedId, name: `${selectedId} · unavailable`, search: selectedId, group: providerGroupFromModel(agent, selectedId) });
    }
    return {
      cli: true,
      provider: agent,
      target,
      providerLabel: (PROVIDER_LABELS as Record<string,unknown>)[agent] || 'CLI agent',
      selectedId,
      selectedName: selectedId ? getAgentModelDisplay(selectedId, catalog) : (defaultModel?.displayName || 'CLI default'),
      models,
      efforts: normalizedEfforts(selected?.supportedReasoningEfforts),
      defaultEffort: selected?.defaultReasoningEffort || '',
      selectedEffort: getAgentHostEffort(),
    };
  }
  const provider = getAIProvider();
  const selectedId = (getActiveModelId as (provider:Parameters<typeof getActiveModelId>[0])=>unknown)(provider);
  const cached = readDirectModels(provider);
  const selected = cached.find(model => model.id === selectedId) || null;
  const reasoningCapabilities = (getModelReasoningCapabilities as (provider:Parameters<typeof getModelReasoningCapabilities>[0],model:unknown)=>ReturnType<typeof getModelReasoningCapabilities>)(provider, selected);
  const orderedCatalog = orderDirectModels(provider, cached);
  const models: ControlModel[] = orderedCatalog.models.map(model => ({
    id: model.id,
    name: model.name || model.displayName || model.id,
    search: `${model.name || ''} ${model.displayName || ''} ${model.id}`,
    group: orderedCatalog.recommendedIds.has(model.id)
      ? 'recommended'
      : orderedCatalog.recommendedIds.size ? 'other' : '',
  }));
  if (selectedId && !models.some(model => model.id === selectedId)) {
    models.unshift({
      id: selectedId,
      name: getActiveModelDisplay(provider),
      search: selectedId,
      group: orderedCatalog.recommendedIds.size ? 'other' : '',
    });
  }
  return {
    cli: false,
    provider,
    providerLabel: (PROVIDER_LABELS as Record<string,unknown>)[provider] || provider,
    selectedId,
    selectedName: getActiveModelDisplay(provider),
    models,
    efforts: normalizedEfforts(reasoningCapabilities.efforts),
    defaultEffort: reasoningCapabilities.defaultEffort,
    selectedEffort: getDirectChatReasoningEffort(provider, selectedId),
  };
}

export function isChatModelCatalogEmpty() {
  return getChatBackend() === 'codex'
    ? getCachedAgentModelCatalog(getAgentHostAgent(), getAgentHostTarget()).length === 0
    : readDirectModels(getAIProvider()).length === 0;
}

/** Only advertised choices, never an injected unavailable/current placeholder. */
export function getConnectionModelChoices(connection: Pick<AssistantSelection, 'backend' | 'provider' | 'target'>, agentModels?: AgentModel[]) {
  if (connection.backend === 'cli') {
    const catalog = agentModels ?? getCachedAgentModelCatalog(connection.provider, connection.target), selectedDefault = catalog.find(model => model.isDefault) || catalog[0];
    return [...(selectedDefault ? [{ ...selectedDefault, id: '', displayName: `Default · ${selectedDefault.displayName}` }] : []), ...catalog].map(model => ({
      id: model.id, name: model.displayName, inputModalities: model.inputModalities,
      reasoningChoices: model.supportedReasoningEfforts.map(effort => effort.reasoningEffort), defaultEffort: model.defaultReasoningEffort, toolSupport: model.supportsTools ?? null,
    }));
  }
  return readDirectModels(connection.provider).flatMap(model => {
    if (typeof model.id !== 'string' || !model.id || model.id.length > 300) return [];
    const reasoning = getModelReasoningCapabilities(connection.provider, model);
    const tools = typeof model.supportsTools === 'boolean' ? model.supportsTools : Array.isArray(model.supported_parameters) && model.supported_parameters.includes('tools') ? true : null;
    return [{ id: model.id, name: String(model.displayName || model.name || model.id), inputModalities: modelMetadataSupportsVision({ ...model, id: model.id, name: typeof model.name === 'string' ? model.name : model.id }) ? ['text', 'image'] : ['text'], reasoningChoices: reasoning.efforts, defaultEffort: reasoning.defaultEffort, toolSupport: tools }];
  });
}
export function getNativeChatModelChoices() {
  const current = getChatModelControlState();
  return getConnectionModelChoices({ backend: current.cli ? 'cli' : 'direct', provider: current.provider, target: current.cli ? current.target : '' });
}

/** Bounded picker metadata only. Never return cached provider objects or configuration. */
export function readChatModelCatalogMetadata(options: { query?: string; offset?: number; limit?: number } = {}, connection?: AssistantSelection, agentModels?: AgentModel[]) {
  const current = getChatModelControlState();
  const selected: AssistantSelection = connection ?? { backend: current.cli ? 'cli' : 'direct', provider: current.provider, target: current.cli ? current.target : '', model: String(current.selectedId ?? ''), effort: current.selectedEffort };
  const query = String(options.query || '').trim().toLowerCase().slice(0, 160);
  const offset = Math.min(100000, Math.max(0, Math.trunc(options.offset || 0)));
  const limit = Math.min(25, Math.max(1, Math.trunc(options.limit || 10)));
  const clean = (input: unknown, length: number) => String(input ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, length);
  const capabilities = getConnectionModelChoices(selected, agentModels);
  const valid = (value: unknown, max: number): value is string => typeof value === 'string' && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value);
  const catalog = capabilities.filter(model => model.id && valid(model.id, 300));
  const matches = catalog.filter(model => `${String(model.id)} ${String(model.name)}`.toLowerCase().includes(query));
  const boundedList = (values: string[]) => [...new Set(values.filter(value => valid(value, 40)))].slice(0, 20);
  const project = (choice: typeof capabilities[number]) => ({ id: choice.id, name: clean(choice.name, 300), availability: 'listed in saved catalog',
    inputModalities: boundedList(choice.inputModalities), reasoningChoices: boundedList(choice.reasoningChoices), defaultEffort: clean(choice.defaultEffort, 40), toolSupport: choice.toolSupport });
  const selectedChoice = capabilities.find(choice => choice.id === selected.model);
  return { source: 'saved native model picker catalog', liveAvailabilityVerified: false,
    backend: selected.backend, provider: clean(selected.provider, 80), target: selected.backend === 'cli' ? clean(selected.target, 160) : 'saved direct connection',
    selectedModel: clean(selected.model, 300), selectedName: clean(selectedChoice?.name ?? selected.model, 300),
    reasoningEffort: clean(selected.effort, 40), reasoningChoices: boundedList(selectedChoice?.reasoningChoices ?? []),
    total: matches.length, offset, models: matches.slice(offset, offset + limit).map(project),
    ...(selected.backend === 'cli' ? { defaultSelection: capabilities.find(choice => choice.id === '') ? project(capabilities.find(choice => choice.id === '')!) : null } : {}),
    nextOffset: offset + limit < matches.length ? offset + limit : null,
    catalogEmpty: catalog.length === 0, nativePath: 'Chat header → model picker; Refresh models updates the catalog',
  };
}

export function isChatModelStateCurrent(snapshot: {cli:boolean;provider:string;target?:string}) {
  if ((getChatBackend() === 'codex') !== snapshot.cli) return false;
  if (snapshot.cli) {
    return getAgentHostAgent() === snapshot.provider
      && getAgentHostTarget(snapshot.provider) === snapshot.target;
  }
  return getAIProvider() === snapshot.provider;
}

export function chatModelEffortOptions(state: ControlState): EffortOption[] {
  return [
    { value: '', label: state.defaultEffort ? `Default · ${titleCase(state.defaultEffort)}` : 'Default' },
    ...state.efforts.map(value => ({ value, label: titleCase(value) })),
  ];
}
