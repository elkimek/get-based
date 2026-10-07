// Catalog ordering and capabilities stay independent of DOM ownership.
import { getActiveModelDisplay, getActiveModelId, getAIProvider, getVeniceE2EE,
  getPpqPrivateMode, isRoutstrPrivateModeActive, isRecommendedModel,
  modelMetadataIsAvailable, selectLatestModelFamilies, selectLatestRecommendedModels } from './api.js';
import { readStoredArray } from './api-provider-storage.js';
import { getCachedLocalAiModelDetails } from './provider-local-ai-runtime.js';
import { getAgentHostAgent, getAgentHostEffort, getAgentHostModel, getAgentHostTarget, getChatBackend } from './agent-chat-settings.js';
import { getAgentModelDisplay, getCachedAgentModelCatalog, resolveAgentModel, sortReasoningEffortValues, type AgentModel } from './agent-model-catalog.js';
import { getDirectChatReasoningEffort } from './chat-model-preferences.js';
import { getModelReasoningCapabilities } from './reasoning-capabilities.js';
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

function readDirectModels(provider: string): DirectModel[] {
  if (provider === 'ollama') {
    return getCachedLocalAiModelDetails().modelDetails.map(model => ({
      ...model,
      id: model.name || model.id,
      name: model.name || model.id,
    })).filter(model => model.id);
  }
  const keys = ({
    openrouter: ['labcharts-openrouter-models'],
    venice: [getVeniceE2EE() ? 'labcharts-venice-e2ee-models' : 'labcharts-venice-models'],
    routstr: [isRoutstrPrivateModeActive() ? 'labcharts-routstr-private-models' : 'labcharts-routstr-models'],
    ppq: [getPpqPrivateMode() ? 'labcharts-ppq-private-models' : 'labcharts-ppq-models'],
    custom: ['labcharts-custom-models'],
  } as Record<string,string[]>)[provider] || [];
  const models = keys.flatMap(readStoredArray<unknown>).filter(model => model && typeof model === 'object'
    && (model as DirectModel).id && modelMetadataIsAvailable(model)) as DirectModel[];
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
