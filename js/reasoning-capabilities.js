// @ts-check
// Provider-neutral reasoning capability normalization for direct and local
// model catalogs. Prefer explicit endpoint metadata; use narrow fallbacks only
// where the serving contract itself documents an effort control.

const FULL_REASONING_EFFORTS = Object.freeze(['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']);
const BASIC_REASONING_EFFORTS = Object.freeze(['low', 'medium', 'high']);

/** @param {unknown} value */
export function normalizeReasoningEffort(value) {
  const effort = String(value || '').trim().toLowerCase();
  if (effort === 'off') return 'none';
  if (effort === 'extra_high' || effort === 'extra-high') return 'xhigh';
  return effort;
}

/** @param {unknown} value */
function effortList(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(item => normalizeReasoningEffort(
    typeof item === 'string' ? item : item?.reasoningEffort || item?.effort || item?.value,
  )).filter(Boolean))];
}

/**
 * Normalize reasoning metadata reported by OpenAI-compatible and native local
 * model catalogs. The returned names remain transport-neutral.
 * @param {any} model
 */
export function extractModelReasoningMetadata(model) {
  if (!model || typeof model !== 'object') return null;
  const capabilitiesReasoning = model.capabilities?.reasoning;
  const reasoning = model.reasoning && typeof model.reasoning === 'object'
    ? model.reasoning
    : capabilitiesReasoning && typeof capabilitiesReasoning === 'object'
      ? capabilitiesReasoning
      : null;
  const options = effortList(
    model.supportedReasoningEfforts
      || reasoning?.supported_efforts
      || reasoning?.supportedEfforts
      || reasoning?.allowed_options
      || reasoning?.allowedOptions
      || model.model_spec?.capabilities?.supportedReasoningEfforts,
  );
  const id = String(model.id || model.name || '').toLowerCase();
  const knownGptOss = /(?:^|[/_.:-])gpt[-_.]?oss(?:$|[/_.:-])/.test(id);
  if (!options.length && knownGptOss) options.push(...BASIC_REASONING_EFFORTS);
  if (!options.length && !reasoning) return null;
  return {
    allowedOptions: options,
    default: normalizeReasoningEffort(
      model.defaultReasoningEffort
        || reasoning?.default_effort
        || reasoning?.defaultEffort
        || reasoning?.default,
    ) || null,
    mandatory: reasoning?.mandatory === true,
  };
}

/**
 * Resolve the controls getbased can honestly expose for one direct/local
 * model. Empty efforts means that reasoning may exist but is not adjustable.
 * @param {string} provider
 * @param {any} model
 */
export function getModelReasoningCapabilities(provider, model) {
  if (!model || typeof model !== 'object') return { efforts: [], defaultEffort: '' };
  const metadata = extractModelReasoningMetadata(model);
  let efforts = metadata?.allowedOptions ? [...metadata.allowedOptions] : [];
  const reasoning = model.reasoning && typeof model.reasoning === 'object' ? model.reasoning : null;
  const supportedParameters = Array.isArray(model.supported_parameters)
    ? model.supported_parameters.map(value => String(value).toLowerCase()) : [];
  const modelSpecCapabilities = model.model_spec?.capabilities || {};
  const explicitlyNotConfigurable = modelSpecCapabilities.supportsReasoningEffort === false;

  // OpenRouter declares null supported_efforts when its gateway accepts every
  // normalized effort, and omits the reasoning object for non-reasoning models.
  if (!efforts.length && provider === 'openrouter' && reasoning
      && Object.prototype.hasOwnProperty.call(reasoning, 'supported_efforts')
      && reasoning.supported_efforts === null) {
    efforts = [...FULL_REASONING_EFFORTS];
  }

  if (!efforts.length && !explicitlyNotConfigurable) {
    const configurable = modelSpecCapabilities.supportsReasoningEffort === true
      || model.capabilities?.supportsReasoningEffort === true
      || model.capabilities?.supportsReasoning === true
      || model.capabilities?.reasoning === true
      || reasoning?.enabled === true
      || reasoning?.supported === true
      || supportedParameters.some(value => value === 'reasoning' || value === 'reasoning_effort');
    if (configurable) efforts = provider === 'openrouter'
      ? [...FULL_REASONING_EFFORTS]
      : [...BASIC_REASONING_EFFORTS];
  }

  if (metadata?.mandatory || reasoning?.mandatory === true) {
    efforts = efforts.filter(effort => effort !== 'none');
  }
  return {
    efforts,
    defaultEffort: metadata?.default || '',
  };
}

export const REASONING_EFFORTS_FULL = FULL_REASONING_EFFORTS;
export const REASONING_EFFORTS_BASIC = BASIC_REASONING_EFFORTS;
