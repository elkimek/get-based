// context-card-health-dots.js - AI health-dot scoring for dashboard context cards

import { state } from './state.js';
import { callClaudeAPI, getActiveModelId, getAIProvider, hasAIProvider } from './api.js';
import { CONTEXT_CARD_KEYS } from './context-card-summaries.js';
import { profileStorageKey } from './profile.js';
import { trackUsage } from './schema.js';
import { hashString, hasCardContent, showNotification } from './utils.js';

const DOT_COLORS = ['green', 'yellow', 'red', 'gray'];

export function applyDotColor(key, color) {
  const dot = document.getElementById('ctx-dot-' + key);
  if (!dot) return;
  dot.className = 'ctx-health-dot ctx-health-dot-' + color;
  const dotLabels = { green: 'Good', yellow: 'Caution', red: 'Concern', gray: 'Not rated' };
  dot.title = dotLabels[color] || '';
  dot.setAttribute('aria-label', dotLabels[color] || '');
}

export function applyAISummary(key, text, color) {
  const el = document.getElementById('ctx-ai-' + key);
  if (!el) return;
  el.classList.remove('ctx-ai-summary-green', 'ctx-ai-summary-yellow', 'ctx-ai-summary-red');
  if (text) {
    const prefixes = { green: '\u2713 ', yellow: '\u26A0 ', red: '\u25B2 ' };
    el.textContent = (prefixes[color] || '') + text;
    el.classList.add('ctx-ai-summary-visible');
    if (color && color !== 'gray') el.classList.add('ctx-ai-summary-' + color);
  } else {
    el.textContent = '';
    el.classList.remove('ctx-ai-summary-visible');
  }
  // Recommendations are shown in detail modal and chat, not on dashboard cards.
}

// Optional ctx allows callers to compute the fingerprint against an explicit
// data object rather than live state. The demo importer uses this before the
// imported data has been applied so cache fingerprints still match the render.
export function getCardFingerprint(key, ctx) {
  const data = ctx?.importedData || state.importedData;
  const sex = ctx?.profileSex !== undefined ? ctx.profileSex : state.profileSex;
  const dob = ctx?.profileDob !== undefined ? ctx.profileDob : state.profileDob;
  const labPart = (data.entries || []).map(e => {
    const m = e.markers || {};
    return e.date + ':' + hashString(JSON.stringify(m));
  }).join(',');
  const val = key === 'healthGoals'
    ? JSON.stringify(data.healthGoals || [])
    : JSON.stringify(data[key] || null);
  const shared = (data.contextNotes || '') + '|' + (data.interpretiveLens || '');
  return hashString(labPart + '|' + val + '|' + shared + '|' + (sex || '') + '|' + (dob || ''));
}

function readHealthCache(cacheKey) {
  let cached;
  try { cached = JSON.parse(localStorage.getItem(cacheKey) || 'null'); } catch(e) { cached = null; }
  if (!cached || !cached.dots) cached = { dots: {}, fingerprints: {} };
  if (!cached.summaries) cached.summaries = {};
  return cached;
}

function writeHealthCache(cacheKey, cached) {
  try { localStorage.setItem(cacheKey, JSON.stringify(cached)); } catch(e) {}
}

function findStaleKeys(keys, cached) {
  const staleKeys = [];
  for (const k of keys) {
    let fp;
    try { fp = getCardFingerprint(k); } catch(e) { staleKeys.push(k); continue; }
    if (cached.fingerprints && cached.fingerprints[k] === fp && cached.dots[k] && cached.summaries[k] !== undefined) {
      applyDotColor(k, cached.dots[k]);
      if (cached.summaries[k]) applyAISummary(k, cached.summaries[k], cached.dots[k]);
    } else {
      staleKeys.push(k);
    }
  }
  return staleKeys;
}

function showStaleCardsLoading(staleKeys) {
  for (const k of staleKeys) {
    const dot = document.getElementById('ctx-dot-' + k);
    if (dot) dot.classList.add('ctx-health-dot-shimmer');
    const aiEl = document.getElementById('ctx-ai-' + k);
    if (aiEl) {
      aiEl.textContent = '';
      aiEl.classList.remove('ctx-ai-summary-visible');
    }
  }
}

function staleCardsHaveAssessableData(staleKeys) {
  const staleHaveContent = staleKeys.some(k => {
    if (k === 'healthGoals') return (state.importedData.healthGoals || []).length > 0;
    return hasCardContent(state.importedData[k]);
  });
  if (staleHaveContent) return true;
  return (state.importedData.entries || []).length > 0;
}

function applyGrayDots(keys) {
  for (const k of keys) applyDotColor(k, 'gray');
}

function buildContextForStaleKeys(keys, staleKeys) {
  let ctx = window.buildLabContext();
  if (staleKeys.length >= keys.length) return ctx;

  const skipKeys = keys.filter(k => !staleKeys.includes(k));
  for (const sk of skipKeys) {
    const re = new RegExp(`\\[section:${sk}\\][\\s\\S]*?\\[/section:${sk}\\]\\n*`, 'g');
    ctx = ctx.replace(re, '');
  }
  return ctx;
}

function buildHealthDotsPrompt(staleKeys) {
  const exampleObj = {};
  for (const k of staleKeys) exampleObj[k] = { dot: '...', tip: '...' };
  const exampleJSON = JSON.stringify(exampleObj);
  return `Based on this person's lab data and profile context, assess each profile area. Return ONLY valid JSON with these keys, each having "dot" (green/yellow/red/gray) and "tip" (max 8 words - a brief, specific insight referencing their actual lab markers):
${exampleJSON}

Dot colors: green = supports health, yellow = needs attention, red = concerning, gray = not enough info.
Tips must be concise (8 words max, e.g. "Low D may link to limited sun" not "Consider improving this area"). Reference specific markers. If no data, use gray dot and empty tip.`;
}

function normalizeHealthDotEntry(entry) {
  if (typeof entry === 'string') {
    return {
      color: DOT_COLORS.includes(entry) ? entry : 'gray',
      tip: '',
    };
  }
  return {
    color: DOT_COLORS.includes(entry?.dot) ? entry.dot : 'gray',
    tip: entry?.tip || '',
  };
}

function parseHealthDotsResponse(text) {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try { return JSON.parse(jsonMatch[0]); } catch(e) { return null; }
}

export async function loadContextHealthDots() {
  if (!hasAIProvider()) return;

  const keys = CONTEXT_CARD_KEYS;
  const cacheKey = profileStorageKey(state.currentProfile, 'contextHealth');
  const cached = readHealthCache(cacheKey);
  const staleKeys = findStaleKeys(keys, cached);
  if (staleKeys.length === 0) return;

  showStaleCardsLoading(staleKeys);
  if (!staleCardsHaveAssessableData(staleKeys)) {
    applyGrayDots(staleKeys);
    return;
  }

  const ctx = buildContextForStaleKeys(keys, staleKeys);
  const prompt = buildHealthDotsPrompt(staleKeys);

  try {
    const result = await callClaudeAPI({ system: prompt, messages: [{ role: 'user', content: ctx }], maxTokens: 2048 });
    const text = (result && typeof result === 'object')
      ? (result.text || '')
      : (typeof result === 'string' ? result : '');
    if (result && typeof result === 'object' && result.usage) {
      trackUsage(getAIProvider(), getActiveModelId(), result.usage.inputTokens || 0, result.usage.outputTokens || 0);
    }

    const parsed = parseHealthDotsResponse(text);
    if (!parsed) {
      applyGrayDots(staleKeys);
      writeHealthCache(cacheKey, cached);
      return;
    }

    if (!cached.fingerprints) cached.fingerprints = {};
    for (const k of staleKeys) {
      const { color, tip } = normalizeHealthDotEntry(parsed[k] || {});
      applyDotColor(k, color);
      applyAISummary(k, tip, color);
      cached.dots[k] = color;
      cached.summaries[k] = tip;
      cached.fingerprints[k] = getCardFingerprint(k);
    }
    writeHealthCache(cacheKey, cached);
  } catch(e) {
    applyGrayDots(staleKeys);
  }
}

export function refreshAllHealthDots() {
  if (!hasAIProvider()) {
    showNotification('Set up an AI provider first', 'error');
    return;
  }
  const cacheKey = profileStorageKey(state.currentProfile, 'contextHealth');
  try { localStorage.removeItem(cacheKey); } catch(e) {}
  loadContextHealthDots();
  showNotification('Refreshing all insights...', 'info');
}
