// @ts-check
// Cached, capability-bearing model catalog reported by a local CLI adapter.

export const AGENT_MODEL_CATALOG_KEY = 'labcharts-agent-model-catalog-v1';
export const AGENT_MODEL_CATALOG_AGENT_KEY = 'labcharts-agent-model-catalog-agent-v1';

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
  })).filter(item => item.reasoningEffort);
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

/** @param {unknown} models @param {string} [agentId] */
export function cacheAgentModelCatalog(models, agentId = '') {
  const normalized = Array.isArray(models) ? models.map(normalizeModel).filter(isNormalizedModel).slice(0, 500) : [];
  localStorage.setItem(AGENT_MODEL_CATALOG_KEY, JSON.stringify(normalized));
  const owner = boundedString(agentId, 40);
  if (owner) localStorage.setItem(AGENT_MODEL_CATALOG_AGENT_KEY, owner);
  else localStorage.removeItem(AGENT_MODEL_CATALOG_AGENT_KEY);
  if (typeof globalThis.dispatchEvent === 'function' && typeof CustomEvent !== 'undefined') {
    globalThis.dispatchEvent(new CustomEvent('getbased:agent-model-catalog-changed'));
  }
  return normalized;
}

/** @param {string} [agentId] */
export function getCachedAgentModelCatalog(agentId = '') {
  const expectedOwner = boundedString(agentId, 40);
  if (expectedOwner && localStorage.getItem(AGENT_MODEL_CATALOG_AGENT_KEY) !== expectedOwner) return [];
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
