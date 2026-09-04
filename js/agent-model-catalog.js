// @ts-check
// Cached, capability-bearing model catalog reported by a local CLI adapter.

export const AGENT_MODEL_CATALOG_KEY = 'labcharts-agent-model-catalog-v1';

/** @param {unknown} value */
function boundedString(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

/** @param {unknown} value */
function normalizeInputModalities(value) {
  // Codex App Server documents text + image as the backwards-compatible
  // default for older model catalogs that omit inputModalities.
  const source = Array.isArray(value) ? value : ['text', 'image'];
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

/** @param {unknown} models */
export function cacheAgentModelCatalog(models) {
  const normalized = Array.isArray(models) ? models.map(normalizeModel).filter(Boolean).slice(0, 500) : [];
  localStorage.setItem(AGENT_MODEL_CATALOG_KEY, JSON.stringify(normalized));
  if (typeof globalThis.dispatchEvent === 'function' && typeof CustomEvent !== 'undefined') {
    globalThis.dispatchEvent(new CustomEvent('getbased:agent-model-catalog-changed'));
  }
  return normalized;
}

export function getCachedAgentModelCatalog() {
  try {
    const parsed = JSON.parse(localStorage.getItem(AGENT_MODEL_CATALOG_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.map(normalizeModel).filter(Boolean).slice(0, 500) : [];
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

/** @param {string} modelId @param {string} modality */
export function agentModelSupports(modelId, modality) {
  const model = resolveAgentModel(modelId);
  return !!model && model.inputModalities.includes(modality);
}

/** @param {string} modelId */
export function getAgentModelDisplay(modelId) {
  const model = resolveAgentModel(modelId);
  return model?.displayName || modelId || 'Codex';
}
