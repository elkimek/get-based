import { publishContextCardStatus, contextCardStatus, emptyContextCardStatus } from './context-card-status.js';
import type { ContextCardStatus } from './context-card-status.js';
import { configureRuntimeFunctions } from './runtime-callbacks.js';
// context-card-health-dots.js - AI health-dot scoring for dashboard context cards

import { state } from './state.js';
import { isAIPaused } from './api.js';
import { callAssistantFeatureAI, getAssistantFeatureIdentity, hasAssistantFeatureProvider } from './ai-feature-routing.js';
import { CONTEXT_CARD_KEYS } from './context-card-summaries.js';
import { getLoadedLabContextBuilder, loadLabContextBuilder } from './lab-context-loader.js';
import type { LabContextBuilder } from './lab-context-loader.js';
import { isCloudModel } from './local-ai-provider-shared.js';
import { getProfiles, profileStorageKey } from './profile.js';
import { trackUsage } from './schema.js';
import { hashString, hasCardContent, showNotification } from './utils.js';


interface ContextHealthDotDependencies {
  buildLabContext: (...args: Parameters<LabContextBuilder>) => unknown;
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

function buildDefaultLabContext(...args: Parameters<LabContextBuilder>) {
  return getLoadedLabContextBuilder()?.(...args) ?? '';
}

const contextHealthDotDeps: ContextHealthDotDependencies = {
  buildLabContext: buildDefaultLabContext,
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
  contextHealthLoads.clear();
}

if (typeof globalThis.addEventListener === 'function') {
  globalThis.addEventListener('labcharts-ai-settings-local-changed', clearAllDemoLiveAIConsent);
  for (const event of ['labcharts-profile-switched', 'labcharts-ai-settings-synced',
    'getbased:chat-backend-changed', 'getbased:agent-host-settings-changed', 'getbased:chat-model-selection-changed']) {
    globalThis.addEventListener(event, () => contextHealthLoads.clear());
  }
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
  contextHealthLoads.delete(state.currentProfile);
  return getDemoContextAIMode();
}

// Domain services publish typed snapshots; authored slots own DOM and styling.
function assessmentIdentity(): string { return JSON.stringify([getAssistantFeatureIdentity(), isAIPaused()]); }
function assessmentFingerprint(key: string): string | null { try { return getCardFingerprint(key); } catch { return null; } }
function publishAssessment(key: string, update: Partial<ContextCardStatus>): void {
  publishContextCardStatus(key, { ...update, assessmentFingerprint: assessmentFingerprint(key), assessmentIdentity: assessmentIdentity() });
}
/** A rebuilt view must not revive an assessment of older facts or demographics. */
export function prepareContextHealthPresentation(): void {
  const identity = assessmentIdentity();
  for (const key of CONTEXT_CARD_KEYS) {
    const current = contextCardStatus(key);
    if (current.assessmentIdentity !== null && (current.assessmentFingerprint !== assessmentFingerprint(key) || current.assessmentIdentity !== identity)) {
      publishContextCardStatus(key, { ...emptyContextCardStatus(), tips: current.tips });
    }
  }
}
const DOT_LABELS: Record<string, unknown> = { green: 'Good', yellow: 'Caution', red: 'Concern', gray: 'Not rated' };
export function applyDotColor(key: string, color: unknown) {
  publishAssessment(key, { color: String(color), label: String(DOT_LABELS[color as string] || 'Not rated'), visible: true, loading: false });
}
export function applyAISummary(key: string, text: unknown, color: unknown, source: unknown = 'ai') {
  const insight = text ? String(text) : '', severity = String(DOT_LABELS[color as string] || 'Insight');
  const insightLabel = source === 'demo' ? 'Demo insight' : 'AI insight';
  publishAssessment(key, { insight, severity, insightLabel, insightColor: color && color !== 'gray' ? String(color) : '',
    insightAria: `${insightLabel}, ${severity}: ${insight}` });
}
export function applyAIProfileSummary(key: string, text: unknown, source: unknown = 'ai') {
  const normalized = typeof text === 'string' ? text.trim() : '';
  publishAssessment(key, { summary: normalized || null, summarySource: normalized ? String(source) : 'local' });
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
    publishAssessment(key, { severity: 'Not recalculated', insightAria: 'Demo insight, not recalculated after context changes' });
  }
}

function showStaleCardsLoading(staleKeys: string[]) {
  for (const key of staleKeys) publishAssessment(key, { visible: true, loading: true, label: 'Assessing',
    summary: null, summarySource: 'local', insight: '', insightAria: '', severity: '', insightLabel: '', insightColor: '' });
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

function buildContextForStaleKeys(keys: string[], staleKeys: string[], build = contextHealthDotDeps.buildLabContext) {
  let ctx = build();
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

interface HealthRequest {
  profileId: string;
  data: typeof state.importedData;
  sex: typeof state.profileSex;
  dob: typeof state.profileDob;
  identity: ReturnType<typeof getAssistantFeatureIdentity>;
  fingerprints: Record<string, string | null>;
  build: ContextHealthDotDependencies['buildLabContext'];
  isActiveDemoProfile: ContextHealthDotDependencies['isActiveDemoProfile'];
  context?: { keys: string[]; text: string; build: ContextHealthDotDependencies['buildLabContext'] };
}
interface HealthLoad { request: HealthRequest; pending?: Promise<void> }
const contextHealthLoads = new Map<string, HealthLoad>();

function safeFingerprint(key: string): string | null {
  try { return getCardFingerprint(key); } catch { return null; }
}
function captureHealthRequest(): HealthRequest {
  return {
    profileId: state.currentProfile, data: state.importedData, sex: state.profileSex, dob: state.profileDob,
    identity: getAssistantFeatureIdentity(),
    build: contextHealthDotDeps.buildLabContext,
    isActiveDemoProfile: contextHealthDotDeps.isActiveDemoProfile,
    fingerprints: Object.fromEntries(CONTEXT_CARD_KEYS.map(key => [key, safeFingerprint(key)])),
  };
}
// A request belongs to its inputs and profile session, not to whichever card
// happens to be in the DOM when the provider responds. Compare the projected
// context too: source settings and wearable/nutrition inputs exceed card fields.
function healthRequestOwnerCurrent(request: HealthRequest): boolean {
  return contextHealthLoads.get(request.profileId)?.request === request
    && state.currentProfile === request.profileId && state.importedData === request.data
    && state.profileSex === request.sex && state.profileDob === request.dob
    && contextHealthDotDeps.buildLabContext === request.build
    && contextHealthDotDeps.isActiveDemoProfile === request.isActiveDemoProfile
    && JSON.stringify(getAssistantFeatureIdentity()) === JSON.stringify(request.identity)
    && hasAssistantFeatureProvider();
}
function healthRequestInputsCurrent(request: HealthRequest): boolean {
  if (!healthRequestOwnerCurrent(request)) return false;
  const mode = getDemoContextAIMode();
  if (mode.demo && !mode.live) return false;
  if (CONTEXT_CARD_KEYS.some(key => request.fingerprints[key] === null || safeFingerprint(key) !== request.fingerprints[key])) return false;
  // Fingerprint getters can replace ownership or revoke live demo eligibility.
  const currentMode = getDemoContextAIMode();
  return (!currentMode.demo || currentMode.live) && healthRequestOwnerCurrent(request);
}
function isHealthRequestCurrent(request: HealthRequest): boolean {
  if (!healthRequestInputsCurrent(request)) return false;
  try {
    const sameContext = !request.context
      || buildContextForStaleKeys(CONTEXT_CARD_KEYS, request.context.keys, request.context.build) === request.context.text;
    return sameContext && healthRequestOwnerCurrent(request);
  } catch { return false; }
}

async function loadContextHealthDotsOnce(request: HealthRequest) {
  const keys = CONTEXT_CARD_KEYS;
  const cacheKey = profileStorageKey(request.profileId, 'contextHealth');
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

  let build = request.build;
  if (build === buildDefaultLabContext) {
    let loaded = getLoadedLabContextBuilder();
    if (!loaded) {
      try {
        loaded = await loadLabContextBuilder();
      } catch {
        if (isHealthRequestCurrent(request)) applyGrayDots(staleKeys);
        return;
      }
    }
    if (!isHealthRequestCurrent(request)) return;
    build = loaded;
  }

  const ctx = buildContextForStaleKeys(keys, staleKeys, build);
  // Builders/getters can change facts or consent without replacing the data.
  // Revalidate inputs before publishing a gray state or dispatching context.
  if (!healthRequestInputsCurrent(request)) return;
  if (typeof ctx !== 'string' || !ctx) {
    applyGrayDots(staleKeys);
    return;
  }
  const prompt = buildHealthDotsPrompt(staleKeys);
  request.context = { keys: staleKeys, text: ctx, build };

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
    if (result && typeof result === 'object' && result.usage && !request.identity.subscription) {
      const identity = request.identity;
      trackUsage(identity.provider, identity.modelId, (result.usage.inputTokens || 0) as Parameters<typeof trackUsage>[2], (result.usage.outputTokens || 0) as Parameters<typeof trackUsage>[3], request.profileId);
    }

    if (!isHealthRequestCurrent(request)) return;
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
      cached.fingerprints[k] = request.fingerprints[k];
      cached.sources[k] = 'ai';
    }
    writeHealthCache(cacheKey, cached);
  } catch(e) {
    if (isHealthRequestCurrent(request)) applyGrayDots(staleKeys);
  }
}

export function loadContextHealthDots() {
  const profileId = state.currentProfile;
  const inFlight = contextHealthLoads.get(profileId);
  if (inFlight?.pending && isHealthRequestCurrent(inFlight.request)) return inFlight.pending;
  const load: HealthLoad = { request: captureHealthRequest() };
  contextHealthLoads.set(profileId, load);
  const pending = loadContextHealthDotsOnce(load.request).finally(() => {
    if (contextHealthLoads.get(profileId) === load) contextHealthLoads.delete(profileId);
  });
  load.pending = pending;
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
  contextHealthLoads.delete(state.currentProfile);
  loadContextHealthDots();
  showNotification('Refreshing all insights...', 'info');
}
