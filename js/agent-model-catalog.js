// @ts-check
// Cached, capability-bearing model catalog reported by a local CLI adapter.

export const AGENT_MODEL_CATALOG_KEY = 'labcharts-agent-model-catalog-v1';
export const AGENT_MODEL_CATALOG_AGENT_KEY = 'labcharts-agent-model-catalog-agent-v1';
export const AGENT_MODEL_CATALOG_TARGET_KEY = 'labcharts-agent-model-catalog-target-v1';

const REASONING_EFFORT_RANK = new Map([
  ['none', 0],
  ['off', 0],
  ['minimal', 10],
  ['low', 20],
  ['medium', 30],
  ['high', 40],
  ['xhigh', 50],
  ['extra_high', 50],
  ['extra-high', 50],
  ['max', 60],
  ['ultra', 70],
  ['adaptive', 80],
]);

/** @param {unknown} value */
function boundedString(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

/** @param {unknown} value */
function normalizeInputModalities(value) {
  // Be conservative when an older or third-party adapter omits capabilities:
  // sending an image is allowed only when the companion declares support.
  const source = Array.isArray(value) ? value : ['text'];
  return [...new Set(source.map(item => boundedString(item, 24)).filter(Boolean))];
}

/** @param {unknown} value */
function normalizeEfforts(value) {
  if (!Array.isArray(value)) return [];
  return value.filter(item => item && typeof item === 'object').map(item => ({
    reasoningEffort: boundedString(/** @type {any} */ (item).reasoningEffort, 40),
    description: boundedString(/** @type {any} */ (item).description, 240),
  })).filter(item => item.reasoningEffort).sort((left, right) => (
    reasoningEffortRank(left.reasoningEffort) - reasoningEffortRank(right.reasoningEffort)
  ));
}

function reasoningEffortRank(value) {
  return REASONING_EFFORT_RANK.get(String(value || '').trim().toLowerCase()) ?? 1_000;
}

/** Keep every provider's effort scale consistent from least to most reasoning. */
export function sortReasoningEffortValues(values) {
  if (!Array.isArray(values)) return [];
  return values.map((value, index) => ({ value, index })).sort((left, right) => {
    const byRank = reasoningEffortRank(left.value) - reasoningEffortRank(right.value);
    return byRank || left.index - right.index;
  }).map(item => item.value);
}

/** @param {unknown} value */
function normalizeModel(value) {
  if (!value || typeof value !== 'object') return null;
  const row = /** @type {any} */ (value);
  const id = boundedString(row.id || row.model, 160);
  if (!id) return null;
  return {
    id,
    model: boundedString(row.model || row.id, 160) || id,
    displayName: boundedString(row.displayName || row.model || row.id, 180) || id,
    description: boundedString(row.description, 300),
    isDefault: row.isDefault === true,
    defaultReasoningEffort: boundedString(row.defaultReasoningEffort, 40),
    supportedReasoningEfforts: normalizeEfforts(row.supportedReasoningEfforts),
    inputModalities: normalizeInputModalities(row.inputModalities),
  };
}

/** @param {ReturnType<typeof normalizeModel>} model @returns {model is NonNullable<ReturnType<typeof normalizeModel>>} */
function isNormalizedModel(model) {
  return model !== null;
}

/** @param {unknown} models @param {string} [agentId] @param {string} [targetId] */
export function cacheAgentModelCatalog(models, agentId = '', targetId = 'local') {
  const normalized = Array.isArray(models) ? models.map(normalizeModel).filter(isNormalizedModel).slice(0, 500) : [];
  localStorage.setItem(AGENT_MODEL_CATALOG_KEY, JSON.stringify(normalized));
  const owner = boundedString(agentId, 40);
  if (owner) {
    localStorage.setItem(AGENT_MODEL_CATALOG_AGENT_KEY, owner);
    localStorage.setItem(AGENT_MODEL_CATALOG_TARGET_KEY, boundedString(targetId, 80) || 'local');
  } else {
    localStorage.removeItem(AGENT_MODEL_CATALOG_AGENT_KEY);
    localStorage.removeItem(AGENT_MODEL_CATALOG_TARGET_KEY);
  }
  if (typeof globalThis.dispatchEvent === 'function' && typeof CustomEvent !== 'undefined') {
    globalThis.dispatchEvent(new CustomEvent('getbased:agent-model-catalog-changed'));
  }
  return normalized;
}

/** @param {string} [agentId] @param {string} [targetId] */
export function getCachedAgentModelCatalog(agentId = '', targetId = 'local') {
  const expectedOwner = boundedString(agentId, 40);
  if (expectedOwner && localStorage.getItem(AGENT_MODEL_CATALOG_AGENT_KEY) !== expectedOwner) return [];
  const expectedTarget = boundedString(targetId, 80) || 'local';
  const storedTarget = localStorage.getItem(AGENT_MODEL_CATALOG_TARGET_KEY) || 'local';
  if (expectedOwner && storedTarget !== expectedTarget) return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(AGENT_MODEL_CATALOG_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.map(normalizeModel).filter(isNormalizedModel).slice(0, 500) : [];
  } catch {
    return [];
  }
}

/** @param {string} [modelId] @param {ReturnType<typeof getCachedAgentModelCatalog>} [models] */
export function resolveAgentModel(modelId = '', models = getCachedAgentModelCatalog()) {
  const requested = boundedString(modelId, 160);
  if (requested) return models.find(model => model.id === requested || model.model === requested) || null;
  return models.find(model => model.isDefault)
    || models[0]
    || null;
}

/** @param {string} modelId @param {string} modality @param {ReturnType<typeof getCachedAgentModelCatalog>} [models] */
export function agentModelSupports(modelId, modality, models = getCachedAgentModelCatalog()) {
  const model = resolveAgentModel(modelId, models);
  return !!model && model.inputModalities.includes(modality);
}

/** @param {string} modelId @param {ReturnType<typeof getCachedAgentModelCatalog>} [models] */
export function getAgentModelDisplay(modelId, models = getCachedAgentModelCatalog()) {
  const model = resolveAgentModel(modelId, models);
  return model?.displayName || modelId || 'CLI default';
}
