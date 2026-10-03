import { configureRuntimeFunctions } from './runtime-callbacks.js';
// context-card-health-dots.js - AI health-dot scoring for dashboard context cards

import { state } from './state.js';
import { isAIPaused } from './api.js';
import { callAssistantFeatureAI, getAssistantFeatureIdentity, hasAssistantFeatureProvider } from './ai-feature-routing.js';
import { CONTEXT_CARD_KEYS } from './context-card-summaries.js';
import { buildLabContext } from './lab-context.js';
import { isCloudModel } from './local-ai-provider-shared.js';
import { getProfiles, profileStorageKey } from './profile.js';
import { trackUsage } from './schema.js';
import { hashString, hasCardContent, showNotification } from './utils.js';


interface ContextHealthDotDependencies {
  buildLabContext: (...args: Parameters<typeof buildLabContext>) => unknown;
  isActiveDemoProfile: () => boolean;
}
export interface ContextFingerprintData {
  entries?: { date?: unknown; markers?: unknown }[] | undefined;
  healthGoals?: unknown;
  contextNotes?: unknown;
  interpretiveLens?: unknown;
  [key: string]: unknown;
}
export interface ContextFingerprintInput {
  importedData?: ContextFingerprintData | null | undefined;
  profileSex?: typeof state.profileSex | undefined;
  profileDob?: typeof state.profileDob | undefined;
}
type DemoContextMetadata = {
  provider: ReturnType<typeof getAssistantFeatureIdentity>['provider'];
  providerLabel: unknown;
  modelId: string;
  modelLabel: string;
};
export type DemoContextAIMode = { mode: 'standard'; live: true; demo: false }
  | (DemoContextMetadata & { mode: 'paused' | 'precomputed'; live: false; demo: true })
  | (DemoContextMetadata & { mode: 'local-live'; live: true; local: true; demo: true })
  | (DemoContextMetadata & { mode: 'paid-live'; live: true; local: false; demo: true })
  | (DemoContextMetadata & { mode: 'paid-off'; live: false; local: false; demo: true });
interface HealthCache {
  dots: Record<string, unknown>;
  summaries: Record<string, unknown>;
  cardSummaries: Record<string, unknown>;
  fingerprints?: Record<string, unknown>;
  sources?: Record<string, unknown>;
}
interface HealthDotResponseEntry { dot?: unknown; tip?: unknown; summary?: unknown }
interface HealthDotAIResponse {
  text?: unknown;
  usage?: { inputTokens?: unknown; outputTokens?: unknown } | null;
}

const DOT_COLORS = ['green', 'yellow', 'red', 'gray'];
const PROVIDER_LABELS: Record<string, unknown> = {
  ollama: 'Local AI',
  openrouter: 'OpenRouter',
  venice: 'Venice',
  routstr: 'Routstr',
  ppq: 'PPQ',
  custom: 'Custom provider',
  'codex-agent': 'Codex CLI',
};
const demoLiveAIConsents = new Map<string, { provider: string; modelId: string; enabledAt: number }>();

const contextHealthDotDeps: ContextHealthDotDependencies = {
  buildLabContext,
  isActiveDemoProfile: () => {
    const active = getProfiles().find(profile => profile.id === state.currentProfile);
    return Array.isArray(active?.tags) && active.tags.includes('demo');
  },
};

export function configureContextCardHealthDots(deps: Partial<ContextHealthDotDependencies> = {}) {
  return configureRuntimeFunctions(contextHealthDotDeps, deps, ["buildLabContext","isActiveDemoProfile"]);
}

export function isActiveDemoContextProfile() {
  return contextHealthDotDeps.isActiveDemoProfile();
}

function getDemoLiveAIConsentKey() {
  return String(state.currentProfile || '');
}

function readDemoLiveAIConsent() {
  return demoLiveAIConsents.get(getDemoLiveAIConsentKey()) || null;
}

function clearDemoLiveAIConsent() {
  demoLiveAIConsents.delete(getDemoLiveAIConsentKey());
}

function clearAllDemoLiveAIConsent() {
  demoLiveAIConsents.clear();
}

if (typeof globalThis.addEventListener === 'function') {
  globalThis.addEventListener('labcharts-ai-settings-local-changed', clearAllDemoLiveAIConsent);
}

export function getDemoContextAIMode(): DemoContextAIMode {
  if (!isActiveDemoContextProfile()) return { mode: 'standard', live: true, demo: false };

  const identity = getAssistantFeatureIdentity();
  const provider = identity.provider;
  const modelId = identity.modelId || '';
  const modelLabel = identity.modelDisplay || modelId || 'Selected model';
  const ollamaCloudModel = provider === 'ollama' && isCloudModel(modelId);
  const providerLabel = ollamaCloudModel
    ? 'Local AI cloud model'
    : PROVIDER_LABELS[provider] || provider || 'AI provider';
  const consent = readDemoLiveAIConsent();
  if (consent && (consent.provider !== provider || consent.modelId !== modelId)) {
    clearDemoLiveAIConsent();
  }
  if (isAIPaused()) {
    return { mode: 'paused', live: false, demo: true, provider, providerLabel, modelId, modelLabel };
  }
  if (!hasAssistantFeatureProvider()) {
    return { mode: 'precomputed', live: false, demo: true, provider, providerLabel, modelId, modelLabel };
  }

  if (provider === 'ollama' && !ollamaCloudModel) {
    // Moving from a paid provider to Local AI invalidates the old paid
    // consent. Switching back must require a fresh, explicit decision.
    clearDemoLiveAIConsent();
    return { mode: 'local-live', live: true, local: true, demo: true, provider, providerLabel, modelId, modelLabel };
  }

  const currentConsent = readDemoLiveAIConsent();
  if (currentConsent?.provider === provider && currentConsent?.modelId === modelId) {
    return { mode: 'paid-live', live: true, local: false, demo: true, provider, providerLabel, modelId, modelLabel };
  }
  if (currentConsent) clearDemoLiveAIConsent();
  return { mode: 'paid-off', live: false, local: false, demo: true, provider, providerLabel, modelId, modelLabel };
}

export function enableDemoContextLiveAI() {
  const mode = getDemoContextAIMode();
  if (mode.mode !== 'paid-off' || !mode.provider) return mode;
  demoLiveAIConsents.set(getDemoLiveAIConsentKey(), {
    provider: mode.provider,
    modelId: mode.modelId,
    enabledAt: Date.now(),
  });
  return getDemoContextAIMode();
}

export function disableDemoContextLiveAI() {
  clearDemoLiveAIConsent();
  return getDemoContextAIMode();
}

// DOM setters retain their original coercion of raw cache values, including inherited labels.
export function applyDotColor(key: string, color: unknown) {
  const dot = document.getElementById('ctx-dot-' + key);
  if (!dot) return;
  dot.className = 'ctx-health-dot ctx-health-dot-' + color;
  const dotLabels: Record<string, unknown> = { green: 'Good', yellow: 'Caution', red: 'Concern', gray: 'Not rated' };
  const label = dotLabels[color as string] || 'Not rated';
  dot.title = label as string;
  const indicator = document.getElementById('ctx-health-' + key);
  const text = document.getElementById('ctx-health-label-' + key);
  if (indicator) {
    indicator.hidden = false;
    indicator.setAttribute('aria-label', `AI assessment: ${label}`);
    dot.setAttribute('aria-hidden', 'true');
    dot.removeAttribute('aria-label');
  } else {
    dot.removeAttribute('aria-hidden');
    dot.setAttribute('aria-label', label as string);
  }
  if (text) text.textContent = label as string;
}

export function applyAISummary(key: string, text: unknown, color: unknown, source: unknown = 'ai') {
  const el = document.getElementById('ctx-ai-' + key);
  if (!el) return;
  el.classList.remove('ctx-ai-summary-green', 'ctx-ai-summary-yellow', 'ctx-ai-summary-red');
  if (text) {
    const severityLabels: Record<string, unknown> = { green: 'Good', yellow: 'Caution', red: 'Concern', gray: 'Not rated' };
    const severity = severityLabels[color as string] || 'Insight';
    el.textContent = text as string;
    el.dataset.severity = severity as string;
    el.dataset.insightLabel = source === 'demo' ? 'Demo insight' : 'AI insight';
    el.classList.add('ctx-ai-summary-visible');
    el.setAttribute('aria-label', `${source === 'demo' ? 'Demo insight' : 'AI insight'}, ${severity}: ${text}`);
    if (color && color !== 'gray') el.classList.add('ctx-ai-summary-' + color);
  } else {
    el.textContent = '';
    delete el.dataset.severity;
    delete el.dataset.insightLabel;
    el.classList.remove('ctx-ai-summary-visible');
    el.removeAttribute('aria-label');
  }
  // Recommendations are shown in detail modal and chat, not on dashboard cards.
}

export function applyAIProfileSummary(key: string, text: unknown, source: unknown = 'ai') {
  const el = document.getElementById('ctx-summary-' + key);
  if (!el) return;
  const normalized = typeof text === 'string' ? text.trim() : '';
  if (normalized) {
    el.textContent = normalized;
    el.dataset.summarySource = source as string;
    return;
  }
  if (el.dataset.localSummary !== undefined) {
    el.textContent = el.dataset.localSummary;
    el.dataset.summarySource = 'local';
  }
}

// Optional ctx allows callers to compute the fingerprint against an explicit
// data object rather than live state. The demo importer uses this before the
// imported data has been applied so cache fingerprints still match the render.
export function getCardFingerprint(key: string, ctx?: ContextFingerprintInput) {
  const data: ContextFingerprintData = ctx?.importedData || state.importedData;
  const sex = ctx?.profileSex !== undefined ? ctx.profileSex : state.profileSex;
  const dob = ctx?.profileDob !== undefined ? ctx.profileDob : state.profileDob;
  const labPart = (data.entries || []).map(e => {
    const m = e.markers || {};
    return (e.date as string) + ':' + hashString(JSON.stringify(m));
  }).join(',');
  const val = key === 'healthGoals'
    ? JSON.stringify(data.healthGoals || [])
    : JSON.stringify(data[key] || null);
  const shared = (data.contextNotes || '') + '|' + (data.interpretiveLens || '');
  return hashString(labPart + '|' + val + '|' + shared + '|' + (sex || '') + '|' + (dob || ''));
}

// Stored JSON is read through the fields this module consumes; malformed truthy fields
// retain the original property-access and assignment behavior.
function readHealthCache(cacheKey: string) {
  let cached: HealthCache | null;
  try { cached = JSON.parse(localStorage.getItem(cacheKey) || 'null') as HealthCache | null; } catch(e) { cached = null; }
  if (!cached || !cached.dots) cached = { dots: {}, fingerprints: {} } as HealthCache;
  if (!cached.summaries) cached.summaries = {};
  if (!cached.cardSummaries) cached.cardSummaries = {};
  if (!cached.sources) cached.sources = {};
  return cached;
}

function writeHealthCache(cacheKey: string, cached: HealthCache) {
  try { localStorage.setItem(cacheKey, JSON.stringify(cached)); } catch(e) {}
}

function findStaleKeys(keys: string[], cached: HealthCache, fallbackSource = 'ai') {
  const staleKeys: string[] = [];
  for (const k of keys) {
    let fp: string;
    try { fp = getCardFingerprint(k); } catch(e) { staleKeys.push(k); continue; }
    if (
      cached.fingerprints
      && cached.fingerprints[k] === fp
      && cached.dots[k]
      && cached.summaries[k] !== undefined
      && cached.cardSummaries[k] !== undefined
    ) {
      const source = cached.sources?.[k] || fallbackSource;
      applyDotColor(k, cached.dots[k]);
      if (cached.cardSummaries[k]) applyAIProfileSummary(k, cached.cardSummaries[k], source);
      if (cached.summaries[k]) applyAISummary(k, cached.summaries[k], cached.dots[k], source);
    } else {
      staleKeys.push(k);
    }
  }
  return staleKeys;
}

function markDemoCardsStale(keys: string[]) {
  for (const key of keys) {
    applyDotColor(key, 'gray');
    applyAIProfileSummary(key, '');
    applyAISummary(key, 'Demo insight not recalculated for current context', 'gray', 'demo');
    const el = document.getElementById('ctx-ai-' + key);
    if (el) {
      el.dataset.severity = 'Not recalculated';
      el.setAttribute('aria-label', 'Demo insight, not recalculated after context changes');
    }
  }
}

function showStaleCardsLoading(staleKeys: string[]) {
  for (const k of staleKeys) {
    const dot = document.getElementById('ctx-dot-' + k);
    if (dot) dot.classList.add('ctx-health-dot-shimmer');
    const indicator = document.getElementById('ctx-health-' + k);
    const label = document.getElementById('ctx-health-label-' + k);
    if (indicator) indicator.hidden = false;
    if (label) label.textContent = 'Assessing';
    applyAIProfileSummary(k, '');
    const aiEl = document.getElementById('ctx-ai-' + k);
    if (aiEl) {
      aiEl.textContent = '';
      aiEl.classList.remove('ctx-ai-summary-visible');
    }
  }
}

function staleCardsHaveAssessableData(staleKeys: string[]) {
  const staleHaveContent = staleKeys.some(k => {
    if (k === 'healthGoals') return (state.importedData.healthGoals || []).length > 0;
    return hasCardContent(state.importedData[k]);
  });
  if (staleHaveContent) return true;
  return (state.importedData.entries || []).some(entry => Object.keys(entry?.markers || {}).length > 0);
}

function applyGrayDots(keys: string[]) {
  for (const k of keys) applyDotColor(k, 'gray');
}

function buildContextForStaleKeys(keys: string[], staleKeys: string[]) {
  let ctx = contextHealthDotDeps.buildLabContext();
  if (typeof ctx !== 'string') return '';
  if (staleKeys.length >= keys.length) return ctx;

  const skipKeys = keys.filter(k => !staleKeys.includes(k));
  for (const sk of skipKeys) {
    const re = new RegExp(`\\[section:${sk}\\][\\s\\S]*?\\[/section:${sk}\\]\\n*`, 'g');
    ctx = (ctx as string).replace(re, '');
  }
  return ctx;
}

function buildHealthDotsPrompt(staleKeys: string[]) {
  const exampleObj: Record<string, {summary: string; dot: string; tip: string}> = {};
  for (const k of staleKeys) exampleObj[k] = { summary: '...', dot: '...', tip: '...' };
  const exampleJSON = JSON.stringify(exampleObj);
  return `Based on this person's lab data and profile context, summarize and assess each profile area. Return ONLY valid JSON with these keys, each having "summary", "dot", and "tip":
${exampleJSON}

Summary rules: summarize ONLY the person's explicitly reported information from that profile area. Use natural, readable language in 1-2 short sentences, maximum 24 words and 160 characters. Prioritize the 2-3 most meaningful facts. Do not use lab results, interpretation, advice, markdown, raw field names, or add facts. If that profile area has no user-entered data, use an empty summary.
Dot colors: green = supports health, yellow = needs attention, red = concerning, gray = not enough info.
Tips must be concise (8 words max, e.g. "Low D may link to limited sun" not "Consider improving this area"). Reference specific markers. If no data, use gray dot and empty tip.`;
}

function normalizeAIText(value: unknown, maxWords: number, maxChars: number) {
  if (typeof value !== 'string') return '';
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  let result = normalized.split(' ').slice(0, maxWords).join(' ');
  if (result.length > maxChars) {
    const clipped = result.slice(0, maxChars + 1);
    const wordBoundary = clipped.lastIndexOf(' ');
    result = clipped.slice(0, wordBoundary > 0 ? wordBoundary : maxChars);
  }
  if (result.length < normalized.length) {
    result = result.replace(/[\s,;:\-\u2013\u2014.]+$/g, '') + '\u2026';
  }
  return result;
}

function normalizeHealthDotEntry(entry: unknown) {
  if (typeof entry === 'string') {
    return {
      color: DOT_COLORS.includes(entry) ? entry : 'gray',
      tip: '',
      profileSummary: '',
    };
  }
  return {
    color: DOT_COLORS.includes((entry as HealthDotResponseEntry | null | undefined)?.dot as string) ? (entry as HealthDotResponseEntry).dot as string : 'gray',
    tip: normalizeAIText((entry as HealthDotResponseEntry | null | undefined)?.tip, 8, 96),
    profileSummary: normalizeAIText((entry as HealthDotResponseEntry | null | undefined)?.summary, 24, 160),
  };
}

function parseHealthDotsResponse(text: string): Record<string, unknown> | null {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try { return JSON.parse(jsonMatch[0]!) as Record<string, unknown> | null; } catch(e) { return null; }
}

async function loadContextHealthDotsOnce() {
  const keys = CONTEXT_CARD_KEYS;
  const cacheKey = profileStorageKey(state.currentProfile, 'contextHealth');
  const cached = readHealthCache(cacheKey);
  const demoMode = getDemoContextAIMode();
  const staleKeys = findStaleKeys(keys, cached, demoMode.demo ? 'demo' : 'ai');
  if (staleKeys.length === 0) return;

  // Demo browsing stays free by default. Local AI is live automatically;
  // cloud/paid providers need profile- and model-specific consent first.
  if (demoMode.demo && !demoMode.live) {
    markDemoCardsStale(staleKeys);
    return;
  }
  if (!hasAssistantFeatureProvider()) return;

  showStaleCardsLoading(staleKeys);
  if (!staleCardsHaveAssessableData(staleKeys)) {
    applyGrayDots(staleKeys);
    return;
  }

  const ctx = buildContextForStaleKeys(keys, staleKeys);
  if (!ctx) {
    applyGrayDots(staleKeys);
    return;
  }
  const prompt = buildHealthDotsPrompt(staleKeys);

  try {
    const result = await callAssistantFeatureAI({
      system: prompt,
      messages: [{ role: 'user', content: ctx }],
      maxTokens: 2048,
      consentKind: 'automatic-insight',
    }) as HealthDotAIResponse | string | null | undefined;
    const text = (result && typeof result === 'object')
      ? (result.text || '')
      : (typeof result === 'string' ? result : '');
    if (result && typeof result === 'object' && result.usage && !getAssistantFeatureIdentity().subscription) {
      const identity = getAssistantFeatureIdentity();
      trackUsage(identity.provider, identity.modelId, (result.usage.inputTokens || 0) as Parameters<typeof trackUsage>[2], (result.usage.outputTokens || 0) as Parameters<typeof trackUsage>[3]);
    }

    const parsed = parseHealthDotsResponse(text as string);
    if (!parsed) {
      applyGrayDots(staleKeys);
      writeHealthCache(cacheKey, cached);
      return;
    }

    if (!cached.fingerprints) cached.fingerprints = {};
    if (!cached.sources) cached.sources = {};
    for (const k of staleKeys) {
      const { color, tip, profileSummary } = normalizeHealthDotEntry(parsed[k] || {});
      applyDotColor(k, color);
      applyAIProfileSummary(k, profileSummary);
      applyAISummary(k, tip, color);
      cached.dots[k] = color;
      cached.summaries[k] = tip;
      cached.cardSummaries[k] = profileSummary;
      cached.fingerprints[k] = getCardFingerprint(k);
      cached.sources[k] = 'ai';
    }
    writeHealthCache(cacheKey, cached);
  } catch(e) {
    applyGrayDots(staleKeys);
  }
}

const contextHealthLoads = new Map<string, Promise<void>>();

export function loadContextHealthDots() {
  const profileId = state.currentProfile;
  const inFlight = contextHealthLoads.get(profileId);
  if (inFlight) return inFlight;
  const pending = loadContextHealthDotsOnce().finally(() => {
    if (contextHealthLoads.get(profileId) === pending) contextHealthLoads.delete(profileId);
  });
  contextHealthLoads.set(profileId, pending);
  return pending;
}

export function refreshAllHealthDots() {
  const cacheKey = profileStorageKey(state.currentProfile, 'contextHealth');
  const demoMode = getDemoContextAIMode();
  if (demoMode.demo && !demoMode.live) {
    showNotification('Live AI is off for this demo. Enable it before refreshing insights.', 'info');
    return;
  }
  if (!hasAssistantFeatureProvider()) {
    showNotification('Set up an AI provider first', 'error');
    return;
  }
  try { localStorage.removeItem(cacheKey); } catch(e) {}
  loadContextHealthDots();
  showNotification('Refreshing all insights...', 'info');
}
