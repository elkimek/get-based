// context-cards.js — 9 context card editors, summaries, health dots, interpretive lens

import { state } from './state.js';
import { DIET_TYPES, DIET_RESTRICTIONS, DIET_PATTERNS, BOWEL_FREQUENCY, STOOL_CONSISTENCY, BLOATING_SEVERITY, GAS_SEVERITY, ACID_REFLUX, BURPING, NAUSEA, APPETITE, ABDOMINAL_PAIN, FOOD_SENSITIVITIES, EXERCISE_FREQ, EXERCISE_TYPES, EXERCISE_INTENSITY, DAILY_MOVEMENT, SLEEP_DURATIONS, SLEEP_QUALITY, SLEEP_SCHEDULE, SLEEP_ROOM_TEMP, SLEEP_ISSUES, SLEEP_ENVIRONMENT, SLEEP_PRACTICES, LIGHT_AM, LIGHT_DAYTIME, LIGHT_UV, LIGHT_EVENING, LIGHT_COLD, LIGHT_GROUNDING, LIGHT_SCREEN_TIME, LIGHT_TECH_ENV, LIGHT_MEAL_TIMING, STRESS_LEVELS, STRESS_SOURCES, STRESS_MGMT, LOVE_STATUS, LOVE_SATISFACTION, LOVE_LIBIDO, LOVE_FREQUENCY, LOVE_ORGASM, LOVE_RELATIONSHIP, LOVE_CONCERNS, ENV_SETTING, ENV_CLIMATE, ENV_WATER, ENV_WATER_CONCERNS, ENV_EMF, ENV_EMF_MITIGATION, ENV_HOME_LIGHT, ENV_AIR, ENV_TOXINS, ENV_BUILDING } from './constants.js';
import { escapeHTML, hashString, showNotification, hasCardContent } from './utils.js';
import { formatTime, getTimeFormat, parseTimeInput } from './theme.js';
import { saveImportedData, getActiveData } from './data.js';
import { getLatitudeFromLocation, profileStorageKey } from './profile.js';
import { callClaudeAPI, hasAIProvider, getAIProvider, getActiveModelId } from './api.js';
import { getLensSummary } from './lens.js';
import { getEncryptionEnabled } from './crypto.js';
import { isSyncEnabled } from './sync.js';
import { getFolderBackupState } from './backup.js';
// showEnableEncryptionModal + pickFolderForBackup are intentionally NOT
// imported — they're invoked via window.* from inline onclick strings
// and the picker click handler (both registered globally by their owning
// modules). Static imports here would be dead.
import { trackUsage } from './schema.js';
import { scanDietForContaminants } from './food-contaminants.js';
import {
  CONTEXT_CARD_KEYS,
  getConditionsSummary,
  getDietSummary,
  getExerciseSummary,
  getSleepSummary,
  getLightCircadianSummary,
  getStressSummary,
  getLoveLifeSummary,
  getEnvironmentSummary,
  getGoalsSummary,
  isContextFilled,
  getContextCardDefs,
  getEMFAssessments,
  renderEMFAssessmentLauncher,
} from './context-card-summaries.js';
import {
  renderContextEditorModal,
  renderSelectField,
  selectCtxOption,
  getSelectedOption,
  renderTagsField,
  toggleCtxTag,
  getSelectedTags,
  renderNoteField,
  contextEditorActions,
} from './context-card-editor-ui.js';
import {
  configureMedicalHistoryEditor,
  openDiagnosesEditor,
  renderDiagnosesModal,
  filterConditionSuggestions,
  selectConditionSuggestion,
  closeSuggestionsOnClickOutside,
  syncDiagnosesNote,
  addCondition,
  editCondition,
  cancelConditionEdit,
  deleteCondition,
  addFamilyHistoryEntry,
  editFamilyHistoryEntry,
  cancelFamilyHistoryEdit,
  deleteFamilyHistoryEntry,
  filterFamilyConditionSuggestions,
  selectFamilyConditionSuggestion,
  saveDiagnoses,
  closeDiagnoses,
  clearDiagnoses,
} from './context-card-medical-history-editor.js';

export {
  getConditionsSummary,
  getDietSummary,
  getExerciseSummary,
  getSleepSummary,
  getLightCircadianSummary,
  getStressSummary,
  getLoveLifeSummary,
  getEnvironmentSummary,
  getGoalsSummary,
  isContextFilled,
  renderEMFAssessmentLauncher,
} from './context-card-summaries.js';
export {
  renderSelectField,
  selectCtxOption,
  getSelectedOption,
  renderTagsField,
  toggleCtxTag,
  getSelectedTags,
  renderNoteField,
  contextEditorActions,
} from './context-card-editor-ui.js';
export {
  openDiagnosesEditor,
  renderDiagnosesModal,
  filterConditionSuggestions,
  selectConditionSuggestion,
  closeSuggestionsOnClickOutside,
  syncDiagnosesNote,
  addCondition,
  editCondition,
  cancelConditionEdit,
  deleteCondition,
  addFamilyHistoryEntry,
  editFamilyHistoryEntry,
  cancelFamilyHistoryEdit,
  deleteFamilyHistoryEntry,
  filterFamilyConditionSuggestions,
  selectFamilyConditionSuggestion,
  saveDiagnoses,
  closeDiagnoses,
  clearDiagnoses,
} from './context-card-medical-history-editor.js';

function _renderDietContaminants() {
  const warnings = scanDietForContaminants(state.importedData.diet);
  if (warnings.length === 0) return '';
  const flagged = warnings.filter(w => w.type !== 'clean').length;
  if (flagged === 0) return '';
  return `<div class="diet-contaminants" role="button" tabindex="0" onclick="event.stopPropagation(); showDietContaminantsModal()" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();this.click()}">\u26A0\uFE0F ${flagged} food contaminant signal${flagged > 1 ? 's' : ''} detected</div>`;
}

export function renderProfileContextCards() {
  const cardDefs = getContextCardDefs();
  const filledCount = cardDefs.filter(c => isContextFilled(c.key)).length;
  const _ccData = getActiveData();
  const _ccHasLabs = _ccData.dates.length > 0 || Object.values(_ccData.categories).some(c => c.singleDate);
  const _ccMissingDemo = (!state.profileSex || !state.profileDob);
  const _ccDemoHint = _ccMissingDemo ? ' Set your sex and date of birth in Settings too \u2014 they shape which panels matter most.' : '';
  let _ccSubtitle = '';
  if (!_ccHasLabs && filledCount === 0) {
    _ccSubtitle = `<div class="context-section-subtitle">Fill all 9 cards and the AI can recommend exactly which labs to get \u2014 and why.${_ccDemoHint}</div>`;
  } else if (!_ccHasLabs && filledCount < cardDefs.length) {
    _ccSubtitle = `<div class="context-section-subtitle">The more you fill in, the better the recommendations \u2014 try to complete all 9, then open the chat.${_ccDemoHint}</div>`;
  } else if (!_ccHasLabs) {
    _ccSubtitle = `<div class="context-section-subtitle">${_ccMissingDemo ? 'Set your sex and date of birth in Settings, then open' : 'All filled \u2014 open'} the chat to get personalized test recommendations based on your profile.</div>`;
  }
  const _refreshBtn = hasAIProvider() ? `<button class="ctx-refresh-all-btn" onclick="event.stopPropagation();refreshAllHealthDots()" title="Refresh all AI insights">&#x21bb;</button>` : '';
  let html = `<div style="margin-top:16px"><span class="context-section-title">What your GP won't ask you (${filledCount}/${cardDefs.length} filled)</span>${_refreshBtn}${_ccSubtitle}</div>`;
  html += `<div class="profile-context-cards">`;
  for (const c of cardDefs) {
    const filled = isContextFilled(c.key);
    const summary = c.summaryFn();
    // axe nested-interactive: the card body is mouse-clickable but
    // KEYBOARD interactivity now lives only on the Edit button below.
    // Both fire the same editor — keyboard users tab to Edit, mouse
    // users still get the whole-card click affordance.
    html += `<div class="context-card" onclick="${c.editor}()" style="cursor:pointer">
      <div class="context-card-header">
        <span class="ctx-health-dot ctx-health-dot-gray" id="ctx-dot-${c.key}"></span>
        <span class="context-card-label">${c.emoji} ${c.label}</span>
        <span class="context-info-icon">i<span class="context-tooltip">${c.tooltip}</span></span>
        <span id="ctx-tips-${c.key}"></span><button class="diagnoses-edit-btn" aria-label="${filled ? 'Edit' : 'Add'} ${escapeHTML(c.label)}" onclick="event.stopPropagation();${c.editor}()">${filled ? 'Edit' : '+ Add'}</button>
      </div>
      ${summary
        ? `<div class="context-card-body">${escapeHTML(summary)}</div>`
        : `<div class="context-card-placeholder">${c.placeholder}</div>`}
      ${c.key === 'diet' ? _renderDietContaminants() : ''}
      <div class="ctx-ai-summary" id="ctx-ai-${c.key}"></div>
    </div>`;
  }
  html += `</div>`;
  // Additional Notes textarea
  const notes = state.importedData.contextNotes || '';
  html += `<div class="ctx-notes-section">
    <textarea class="ctx-notes-textarea" id="ctx-notes-textarea" placeholder="Additional notes for AI context (anything else that might affect your labs...)" oninput="debounceContextNotes()">${escapeHTML(notes)}</textarea>
  </div>`;
  return html;
}

let _ctxNotesTimer = null;
export function debounceContextNotes() {
  clearTimeout(_ctxNotesTimer);
  _ctxNotesTimer = setTimeout(() => {
    const ta = document.getElementById('ctx-notes-textarea');
    if (ta) {
      state.importedData.contextNotes = ta.value;
      recordChange('contextNotes');
      saveImportedData();
    }
  }, 500);
}

// ── AI Health Status Dots ──

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
  // Recommendations are shown in detail modal and chat, not on dashboard cards
}

// Optional ctx allows callers to compute the fingerprint against an
// explicit data object rather than the live `state` — used by the demo
// loader to seed the contextHealth cache BEFORE importDataJSON runs, so
// the dashboard render that fires inside importDataJSON's onload finds
// matching fingerprints and skips AI calls. Default (no ctx) reads the
// live state, which is what every render-time caller wants.
export function getCardFingerprint(key, ctx) {
  const data = ctx?.importedData || state.importedData;
  const sex = ctx?.profileSex !== undefined ? ctx.profileSex : state.profileSex;
  const dob = ctx?.profileDob !== undefined ? ctx.profileDob : state.profileDob;
  const labPart = (data.entries || []).map(e => {
    const m = e.markers || {};
    return e.date + ':' + hashString(JSON.stringify(m));
  }).join(',');
  const val = key === 'healthGoals' ? JSON.stringify(data.healthGoals || []) : JSON.stringify(data[key] || null);
  const shared = (data.contextNotes || '') + '|' + (data.interpretiveLens || '');
  return hashString(labPart + '|' + val + '|' + shared + '|' + (sex || '') + '|' + (dob || ''));
}

export async function loadContextHealthDots() {
  if (!hasAIProvider()) return;
  const keys = CONTEXT_CARD_KEYS;
  const cacheKey = profileStorageKey(state.currentProfile, 'contextHealth');
  let cached;
  try { cached = JSON.parse(localStorage.getItem(cacheKey) || 'null'); } catch(e) { cached = null; }
  if (!cached || !cached.dots) cached = { dots: {}, fingerprints: {} };

  if (!cached.summaries) cached.summaries = {};

  // Determine which cards need re-fetching
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
  if (staleKeys.length === 0) return;

  // Show shimmer only on stale cards
  for (const k of staleKeys) {
    const dot = document.getElementById('ctx-dot-' + k);
    if (dot) dot.classList.add('ctx-health-dot-shimmer');
    const aiEl = document.getElementById('ctx-ai-' + k);
    if (aiEl) { aiEl.textContent = ''; aiEl.classList.remove('ctx-ai-summary-visible'); }
  }
  // If none of the stale cards have actual content, keep dots gray (nothing to assess)
  const _staleHaveContent = staleKeys.some(k => {
    if (k === 'healthGoals') return (state.importedData.healthGoals || []).length > 0;
    return hasCardContent(state.importedData[k]);
  });
  if (!_staleHaveContent) {
    // Also check if there's lab data — if there is, the AI can still rate cards
    const _dotHasLabs = (state.importedData.entries || []).length > 0;
    if (!_dotHasLabs) {
      for (const k of staleKeys) applyDotColor(k, 'gray');
      return;
    }
  }
  let ctx = window.buildLabContext();
  // Trim context: remove card sections not being assessed (saves tokens)
  if (staleKeys.length < keys.length) {
    const skipKeys = keys.filter(k => !staleKeys.includes(k));
    for (const sk of skipKeys) {
      const re = new RegExp(`\\[section:${sk}\\][\\s\\S]*?\\[/section:${sk}\\]\\n*`, 'g');
      ctx = ctx.replace(re, '');
    }
  }
  const exampleObj = {};
  for (const k of staleKeys) exampleObj[k] = {"dot":"...","tip":"..."};
  const exampleJSON = JSON.stringify(exampleObj);
  const prompt = `Based on this person's lab data and profile context, assess each profile area. Return ONLY valid JSON with these keys, each having "dot" (green/yellow/red/gray) and "tip" (max 8 words — a brief, specific insight referencing their actual lab markers):
${exampleJSON}

Dot colors: green = supports health, yellow = needs attention, red = concerning, gray = not enough info.
Tips must be concise (8 words max, e.g. "Low D may link to limited sun" not "Consider improving this area"). Reference specific markers. If no data, use gray dot and empty tip.`;
  try {
    const result = await callClaudeAPI({ system: prompt, messages: [{ role: 'user', content: ctx }], maxTokens: 2048 });
    const text = (result && typeof result === 'object') ? (result.text || '') : (typeof result === 'string' ? result : '');
    if (result && typeof result === 'object' && result.usage) {
      trackUsage(getAIProvider(), getActiveModelId(), result.usage.inputTokens || 0, result.usage.outputTokens || 0);
    }
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      let parsed;
      try { parsed = JSON.parse(jsonMatch[0]); } catch(e) {
        // JSON parse failed — apply gray dots only to stale keys, preserve cached good keys
        for (const k of staleKeys) applyDotColor(k, 'gray');
        try { localStorage.setItem(cacheKey, JSON.stringify(cached)); } catch(e2) {}
        return;
      }
      if (!cached.fingerprints) cached.fingerprints = {};
      for (const k of staleKeys) {
        const entry = parsed[k] || {};
        const color = (typeof entry === 'string')
          ? (['green', 'yellow', 'red', 'gray'].includes(entry) ? entry : 'gray')
          : (['green', 'yellow', 'red', 'gray'].includes(entry.dot) ? entry.dot : 'gray');
        const tip = (typeof entry === 'object' && entry.tip) ? entry.tip : '';
        applyDotColor(k, color);
        applyAISummary(k, tip, color);
        cached.dots[k] = color;
        cached.summaries[k] = tip;
        cached.fingerprints[k] = getCardFingerprint(k);
      }
      try { localStorage.setItem(cacheKey, JSON.stringify(cached)); } catch(e) {}
    } else {
      // No JSON in response — apply gray dots so shimmer doesn't stay forever
      for (const k of staleKeys) applyDotColor(k, 'gray');
    }
  } catch(e) {
    for (const k of staleKeys) applyDotColor(k, 'gray');
  }
}

export function refreshAllHealthDots() {
  if (!hasAIProvider()) { showNotification('Set up an AI provider first', 'error'); return; }
  const cacheKey = profileStorageKey(state.currentProfile, 'contextHealth');
  try { localStorage.removeItem(cacheKey); } catch(e) {}
  loadContextHealthDots();
  showNotification('Refreshing all insights...', 'info');
}

// ── Change History ──

export function recordChange(field) {
  const today = new Date().toISOString().slice(0, 10);
  const current = state.importedData[field];
  const snapshot = current != null ? JSON.parse(JSON.stringify(current)) : null;
  const snapshotStr = JSON.stringify(snapshot);
  if (!state.importedData.changeHistory) state.importedData.changeHistory = [];
  const history = state.importedData.changeHistory;
  // Skip if identical to last snapshot for this field
  const lastIdx = history.findLastIndex(e => e.field === field);
  if (lastIdx >= 0 && JSON.stringify(history[lastIdx].snapshot) === snapshotStr) return;
  // Same field + same day → overwrite. Stamp updatedAt so cross-device
  // tie-break prefers the newer write (composite-keyed merge in data-merge.js
  // falls back to Date.parse(date) without this — same-day = tie = local-wins,
  // silently dropping the remote's newer snapshot).
  const now = Date.now();
  const todayIdx = history.findIndex(e => e.field === field && e.date === today);
  if (todayIdx >= 0) {
    history[todayIdx].snapshot = snapshot;
    history[todayIdx].updatedAt = now;
  } else {
    history.push({ field, date: today, snapshot, updatedAt: now });
  }
  // Cap at 200
  while (history.length > 200) history.shift();
}

export function saveAndRefresh(msg, field) {
  if (field) recordChange(field);
  saveImportedData();
  // Preserve details open state across the re-render below
  const details = document.querySelector('.welcome-context-details');
  if (details?.open) sessionStorage.setItem('welcome-details-open', '1');
  window.closeModal();
  showNotification(msg, 'success');
  if (window.onContextCardSaved) window.onContextCardSaved();
  // Re-render the current view so the saved values appear on the card
  // immediately. BroadcastChannel notifies other tabs but never delivers
  // back to the sender, so a single-tab user would otherwise see no UI
  // update until a reload or navigation. Mirrors the BroadcastChannel
  // handler in crypto.js:initBroadcastChannel. See #123.
  const activeNav = document.querySelector('.nav-item.active');
  if (window.navigate) window.navigate(activeNav ? activeNav.dataset.category : 'dashboard');
  // Refresh health dots for the saved card (fingerprint will have changed).
  // Must run after navigate() so the ctx-dot-* elements exist in the new DOM.
  loadContextHealthDots();
}

configureMedicalHistoryEditor({ recordChange, saveAndRefresh });

function getTimePlaceholder() {
  return getTimeFormat() === '24h' ? 'HH:MM' : 'H:MM AM';
}

// ═══════════════════════════════════════════════
// DIET
// ═══════════════════════════════════════════════

export function openDietEditor() {
  const modal = document.getElementById("detail-modal");
  const overlay = document.getElementById("modal-overlay");
  const current = state.importedData.diet || { type: null, restrictions: [], pattern: null, breakfast: '', lunch: '', dinner: '', snacks: '', note: '', bowelFrequency: null, stoolConsistency: null, bloating: null, gas: null, acidReflux: null, burping: null, nausea: null, appetite: null, abdominalPain: null, foodSensitivities: [] };
  renderContextEditorModal(modal, 'Diet & Digestion', 'Describe your typical diet and digestive health. The AI will factor this in when interpreting your labs.', `
    ${renderSelectField('Diet type', 'diet-type', DIET_TYPES, current.type)}
    ${renderSelectField('Eating pattern', 'diet-pattern', DIET_PATTERNS, current.pattern)}
    ${renderTagsField('Restrictions', 'diet-restrictions', DIET_RESTRICTIONS, current.restrictions)}
    <div class="ctx-editor-divider"></div>
    <div class="ctx-field-group"><label class="ctx-field-label">Typical meals</label>
      <div class="ctx-meal-row"><input type="text" class="ctx-meal-time" id="diet-breakfast-time" placeholder="${getTimePlaceholder()}" value="${escapeHTML(formatTime(current.breakfastTime || ''))}"><input class="ctx-note-input ctx-meal-input" id="diet-breakfast" placeholder="Breakfast — e.g. eggs, avocado, coffee" value="${escapeHTML(current.breakfast || '')}"></div>
      <div class="ctx-meal-row"><input type="text" class="ctx-meal-time" id="diet-lunch-time" placeholder="${getTimePlaceholder()}" value="${escapeHTML(formatTime(current.lunchTime || ''))}"><input class="ctx-note-input ctx-meal-input" id="diet-lunch" placeholder="Lunch — e.g. salad with grilled chicken" value="${escapeHTML(current.lunch || '')}"></div>
      <div class="ctx-meal-row"><input type="text" class="ctx-meal-time" id="diet-dinner-time" placeholder="${getTimePlaceholder()}" value="${escapeHTML(formatTime(current.dinnerTime || ''))}"><input class="ctx-note-input ctx-meal-input" id="diet-dinner" placeholder="Dinner — e.g. salmon, rice, vegetables" value="${escapeHTML(current.dinner || '')}"></div>
      <div class="ctx-meal-row"><input type="text" class="ctx-meal-time" id="diet-snacks-time" placeholder="${getTimePlaceholder()}" value="${escapeHTML(formatTime(current.snacksTime || ''))}"><input class="ctx-note-input ctx-meal-input" id="diet-snacks" placeholder="Snacks — e.g. nuts, fruit, dark chocolate" value="${escapeHTML(current.snacks || '')}"></div>
    </div>
    <div class="ctx-editor-divider"></div>
    <div class="ctx-field-group"><label class="ctx-field-label">Digestion</label></div>
    ${renderSelectField('Bowel frequency', 'diet-bowel', BOWEL_FREQUENCY, current.bowelFrequency || null)}
    ${renderSelectField('Stool consistency', 'diet-stool', STOOL_CONSISTENCY, current.stoolConsistency || null)}
    ${renderSelectField('Bloating', 'diet-bloating', BLOATING_SEVERITY, current.bloating || null)}
    ${renderSelectField('Gas', 'diet-gas', GAS_SEVERITY, current.gas || null)}
    ${renderSelectField('Acid reflux', 'diet-reflux', ACID_REFLUX, current.acidReflux || null)}
    ${renderSelectField('Burping', 'diet-burping', BURPING, current.burping || null)}
    ${renderSelectField('Nausea', 'diet-nausea', NAUSEA, current.nausea || null)}
    ${renderSelectField('Appetite', 'diet-appetite', APPETITE, current.appetite || null)}
    ${renderSelectField('Abdominal pain', 'diet-abdpain', ABDOMINAL_PAIN, current.abdominalPain || null)}
    ${renderTagsField('Food sensitivities', 'diet-sensitivities', FOOD_SENSITIVITIES, current.foodSensitivities || [])}
    ${renderNoteField(current.note)}
    ${contextEditorActions(state.importedData.diet != null, 'saveDiet', 'clearDiet')}`);
  overlay.classList.add("show");
}

export function saveDiet() {
  const type = getSelectedOption('diet-type');
  const pattern = getSelectedOption('diet-pattern');
  const restrictions = getSelectedTags('diet-restrictions');
  const breakfast = (document.getElementById('diet-breakfast') || {}).value || '';
  const breakfastTime = parseTimeInput((document.getElementById('diet-breakfast-time') || {}).value || '');
  const lunch = (document.getElementById('diet-lunch') || {}).value || '';
  const lunchTime = parseTimeInput((document.getElementById('diet-lunch-time') || {}).value || '');
  const dinner = (document.getElementById('diet-dinner') || {}).value || '';
  const dinnerTime = parseTimeInput((document.getElementById('diet-dinner-time') || {}).value || '');
  const snacks = (document.getElementById('diet-snacks') || {}).value || '';
  const snacksTime = parseTimeInput((document.getElementById('diet-snacks-time') || {}).value || '');
  const bowelFrequency = getSelectedOption('diet-bowel');
  const stoolConsistency = getSelectedOption('diet-stool');
  const bloating = getSelectedOption('diet-bloating');
  const gas = getSelectedOption('diet-gas');
  const acidReflux = getSelectedOption('diet-reflux');
  const burping = getSelectedOption('diet-burping');
  const nausea = getSelectedOption('diet-nausea');
  const appetite = getSelectedOption('diet-appetite');
  const abdominalPain = getSelectedOption('diet-abdpain');
  const foodSensitivities = getSelectedTags('diet-sensitivities');
  const note = (document.getElementById('ctx-note-input') || {}).value || '';
  if (!type && !pattern && restrictions.length === 0 && !breakfast.trim() && !lunch.trim() && !dinner.trim() && !snacks.trim() && !bowelFrequency && !stoolConsistency && !bloating && !gas && !acidReflux && !burping && !nausea && !appetite && !abdominalPain && foodSensitivities.length === 0 && !note.trim()) {
    state.importedData.diet = null;
  } else {
    state.importedData.diet = { type, restrictions, pattern, breakfast: breakfast.trim(), breakfastTime, lunch: lunch.trim(), lunchTime, dinner: dinner.trim(), dinnerTime, snacks: snacks.trim(), snacksTime, bowelFrequency, stoolConsistency, bloating, gas, acidReflux, burping, nausea, appetite, abdominalPain, foodSensitivities, note: note.trim() };
  }
  saveAndRefresh('Diet & Digestion saved', 'diet');
}

export function clearDiet() {
  state.importedData.diet = null;
  saveAndRefresh('Diet & Digestion cleared', 'diet');
}

// ═══════════════════════════════════════════════
// SLEEP & REST
// ═══════════════════════════════════════════════

export function openSleepRestEditor() {
  const modal = document.getElementById("detail-modal");
  const overlay = document.getElementById("modal-overlay");
  const current = state.importedData.sleepRest || { duration: null, quality: null, schedule: null, roomTemp: null, issues: [], environment: [], practices: [], note: '' };
  renderContextEditorModal(modal, 'Sleep & Rest', 'Sleep is when the body repairs. Duration, temperature, darkness, and EMF exposure all affect hormones, inflammation, and recovery.', `
    ${renderSelectField('Duration', 'sleep-duration', SLEEP_DURATIONS, current.duration)}
    ${renderSelectField('Quality', 'sleep-quality', SLEEP_QUALITY, current.quality)}
    ${renderSelectField('Schedule', 'sleep-schedule', SLEEP_SCHEDULE, current.schedule)}
    ${renderSelectField('Room temperature', 'sleep-temp', SLEEP_ROOM_TEMP, current.roomTemp)}
    ${renderTagsField('Sleep issues', 'sleep-issues', SLEEP_ISSUES, current.issues)}
    <div class="ctx-editor-divider"></div>
    ${renderTagsField('Sleep environment', 'sleep-env', SLEEP_ENVIRONMENT, current.environment)}
    ${renderTagsField('Sleep practices', 'sleep-practices', SLEEP_PRACTICES, current.practices)}
    ${renderNoteField(current.note)}
    ${contextEditorActions(state.importedData.sleepRest != null, 'saveSleepRest', 'clearSleepRest')}`);
  overlay.classList.add("show");
}

export function saveSleepRest() {
  const duration = getSelectedOption('sleep-duration');
  const quality = getSelectedOption('sleep-quality');
  const schedule = getSelectedOption('sleep-schedule');
  const roomTemp = getSelectedOption('sleep-temp');
  const issues = getSelectedTags('sleep-issues');
  const environment = getSelectedTags('sleep-env');
  const practices = getSelectedTags('sleep-practices');
  const note = (document.getElementById('ctx-note-input') || {}).value || '';
  if (!duration && !quality && !schedule && !roomTemp && issues.length === 0 && environment.length === 0 && practices.length === 0 && !note.trim()) {
    state.importedData.sleepRest = null;
  } else {
    state.importedData.sleepRest = { duration, quality, schedule, roomTemp, issues, environment, practices, note: note.trim() };
  }
  saveAndRefresh('Sleep saved', 'sleepRest');
}

export function clearSleepRest() {
  state.importedData.sleepRest = null;
  saveAndRefresh('Sleep cleared', 'sleepRest');
}

// ═══════════════════════════════════════════════
// LIGHT & CIRCADIAN
// ═══════════════════════════════════════════════

export function openLightCircadianEditor() {
  const modal = document.getElementById("detail-modal");
  const overlay = document.getElementById("modal-overlay");
  const current = state.importedData.lightCircadian || { amLight: null, daytime: null, uvExposure: null, skinType: null, evening: [], screenTime: null, techEnv: [], cold: null, grounding: null, mealTiming: [], note: '' };
  const lat = getLatitudeFromLocation();
  renderContextEditorModal(modal, 'Light & Circadian', 'Light is the #1 circadian signal. Morning light sets cortisol, UV drives vitamin D and hormones, cold and grounding affect mitochondrial function.', `
    ${renderSelectField('Morning light', 'light-am', LIGHT_AM, current.amLight)}
    ${renderSelectField('Daytime outdoor exposure', 'light-daytime', LIGHT_DAYTIME, current.daytime)}
    ${renderSelectField('UV / sun exposure', 'light-uv', LIGHT_UV, current.uvExposure)}
    ${renderLightSetupMirror(current)}
    ${renderTagsField('Evening light discipline', 'light-evening', LIGHT_EVENING, current.evening)}
    <div class="ctx-editor-divider"></div>
    ${renderSelectField('Daily screen time', 'light-screen', LIGHT_SCREEN_TIME, current.screenTime)}
    ${renderTagsField('Technology environment', 'light-tech', LIGHT_TECH_ENV, current.techEnv)}
    <div class="ctx-editor-divider"></div>
    ${renderSelectField('Cold exposure', 'light-cold', LIGHT_COLD, current.cold)}
    ${renderSelectField('Grounding / earthing', 'light-grounding', LIGHT_GROUNDING, current.grounding)}
    ${renderTagsField('Meal timing signals', 'light-meal', LIGHT_MEAL_TIMING, current.mealTiming)}
    ${lat ? `<div style="font-size:12px;color:var(--text-muted);margin-top:8px">📍 Latitude: <strong style="color:var(--text-primary)">${escapeHTML(lat)}</strong> <span style="font-size:11px">(from Settings → Location)</span></div>` : `<div style="font-size:12px;color:var(--text-muted);margin-top:8px">💡 Set your country in Settings → Profile for automatic latitude detection</div>`}
    ${renderNoteField(current.note)}
    ${contextEditorActions(state.importedData.lightCircadian != null, 'saveLightCircadian', 'clearLightCircadian')}`);
  overlay.classList.add("show");
}

// Render a compact read-only summary of the user's Light lens setup —
// skin type, home lighting, eyewear, and indoor/outdoor lifestyle. The
// Light setup card is the single source of truth; this just surfaces what
// the AI already knows about light from those answers and links over for
// edits. Matches the design pattern of Settings → linked external editors.
function renderLightSetupMirror(current) {
  const sd = state.importedData?.sunDefaults || null;
  const skin = current.skinType || (sd?.fitzpatrick ? `${sd.fitzpatrick}` : null);

  // Resolve the human-readable home-lighting + eyewear labels by reading
  // window-exposed metadata so we don't pull in the sun-defaults import
  // (would create a circular dep with this file's many other consumers).
  const homeLightOptions = (typeof window !== 'undefined' && window._sunHomeLightOptions) || [];
  const eyewearOptions = (typeof window !== 'undefined' && window._sunEyewearOptions) || [];
  const homeMeta = homeLightOptions.find(o => o.key === sd?.homeLight);
  const eyewearMeta = eyewearOptions.find(o => o.key === sd?.eyewear);

  let ottBadge = '';
  if (sd && typeof sd.ottScore === 'number' && typeof window.ottScoreToLabel === 'function') {
    const { label, tier } = window.ottScoreToLabel(sd.ottScore);
    ottBadge = `<span class="light-ott-badge light-ott-tier-${tier}">${escapeHTML(label)}</span>`;
  } else if (sd?.skipped) {
    ottBadge = `<span class="light-ott-badge">skipped</span>`;
  }

  const hasAny = !!(skin || sd?.homeLight || sd?.eyewear || ottBadge);

  if (!hasAny) {
    return `<div class="ctx-field-group ctx-lightsetup-mirror">
      <label class="ctx-field-label">Light lens setup</label>
      <div class="ctx-lightsetup-empty">
        <span>Not set yet — covers skin type, home lighting, eyewear, and indoor/outdoor lifestyle.</span>
        <button type="button" class="ctx-lightsetup-edit" onclick="closeModal();window.navigate&&window.navigate('light');setTimeout(()=>window.reopenSunSetup&&window.reopenSunSetup(),200);">Set up Light lens →</button>
      </div>
    </div>`;
  }

  return `<div class="ctx-field-group ctx-lightsetup-mirror">
    <div class="ctx-lightsetup-head">
      <label class="ctx-field-label" style="margin:0">Light lens setup</label>
      <button type="button" class="ctx-lightsetup-edit" onclick="closeModal();window.navigate&&window.navigate('light');setTimeout(()=>window.reopenSunSetup&&window.reopenSunSetup(),200);">Edit →</button>
    </div>
    <div class="ctx-lightsetup-grid">
      <div class="ctx-lightsetup-row"><span class="ctx-lightsetup-label">Skin type</span><span class="ctx-lightsetup-value">${skin ? escapeHTML(skin) : '—'}</span></div>
      <div class="ctx-lightsetup-row"><span class="ctx-lightsetup-label">Home lighting</span><span class="ctx-lightsetup-value">${escapeHTML(homeMeta?.label || sd?.homeLight || '—')}</span></div>
      <div class="ctx-lightsetup-row"><span class="ctx-lightsetup-label">Eyewear outside</span><span class="ctx-lightsetup-value">${escapeHTML(eyewearMeta?.label || sd?.eyewear || '—')}</span></div>
      <div class="ctx-lightsetup-row"><span class="ctx-lightsetup-label">Light lifestyle</span><span class="ctx-lightsetup-value">${ottBadge || '—'}</span></div>
    </div>
    <div class="ctx-lightsetup-hint">Skin type drives UV tolerance and vitamin D math. Home lighting + eyewear shape your indoor light dose. Lifestyle frames the AI's interpretation everywhere.</div>
  </div>`;
}

export function saveLightCircadian() {
  const amLight = getSelectedOption('light-am');
  const daytime = getSelectedOption('light-daytime');
  const uvExposure = getSelectedOption('light-uv');
  // Skin type is no longer editable here — it's owned by the Light setup card
  // and mirrored to lightCircadian.skinType by sun-defaults.js. Preserve
  // whatever value is currently saved so this editor doesn't overwrite it.
  const skinType = state.importedData.lightCircadian?.skinType || null;
  const evening = getSelectedTags('light-evening');
  const screenTime = getSelectedOption('light-screen');
  const techEnv = getSelectedTags('light-tech');
  const cold = getSelectedOption('light-cold');
  const grounding = getSelectedOption('light-grounding');
  const mealTiming = getSelectedTags('light-meal');
  const note = (document.getElementById('ctx-note-input') || {}).value || '';
  if (!amLight && !daytime && !uvExposure && !skinType && evening.length === 0 && !screenTime && techEnv.length === 0 && !cold && !grounding && mealTiming.length === 0 && !note.trim()) {
    state.importedData.lightCircadian = null;
  } else {
    state.importedData.lightCircadian = { amLight, daytime, uvExposure, skinType, evening, screenTime, techEnv, cold, grounding, mealTiming, note: note.trim() };
  }
  saveAndRefresh('Light & circadian saved', 'lightCircadian');
}

export function clearLightCircadian() {
  state.importedData.lightCircadian = null;
  saveAndRefresh('Light & circadian cleared', 'lightCircadian');
}

// ═══════════════════════════════════════════════
// EXERCISE
// ═══════════════════════════════════════════════

export function openExerciseEditor() {
  const modal = document.getElementById("detail-modal");
  const overlay = document.getElementById("modal-overlay");
  const current = state.importedData.exercise || { frequency: null, types: [], intensity: null, dailyMovement: null, note: '' };
  renderContextEditorModal(modal, 'Exercise & Movement', 'Describe your exercise routine. The AI considers this when interpreting your labs.', `
    ${renderSelectField('Frequency', 'exercise-freq', EXERCISE_FREQ, current.frequency)}
    ${renderTagsField('Types', 'exercise-types', EXERCISE_TYPES, current.types)}
    ${renderSelectField('Intensity', 'exercise-intensity', EXERCISE_INTENSITY, current.intensity)}
    ${renderSelectField('Daily movement', 'exercise-movement', DAILY_MOVEMENT, current.dailyMovement)}
    ${renderNoteField(current.note)}
    ${contextEditorActions(state.importedData.exercise != null, 'saveExercise', 'clearExercise')}`);
  overlay.classList.add("show");
}

export function saveExercise() {
  const frequency = getSelectedOption('exercise-freq');
  const types = getSelectedTags('exercise-types');
  const intensity = getSelectedOption('exercise-intensity');
  const dailyMovement = getSelectedOption('exercise-movement');
  const note = (document.getElementById('ctx-note-input') || {}).value || '';
  if (!frequency && types.length === 0 && !intensity && !dailyMovement && !note.trim()) {
    state.importedData.exercise = null;
  } else {
    state.importedData.exercise = { frequency, types, intensity, dailyMovement, note: note.trim() };
  }
  saveAndRefresh('Exercise saved', 'exercise');
}

export function clearExercise() {
  state.importedData.exercise = null;
  saveAndRefresh('Exercise cleared', 'exercise');
}

// ═══════════════════════════════════════════════
// STRESS
// ═══════════════════════════════════════════════

export function openStressEditor() {
  const modal = document.getElementById("detail-modal");
  const overlay = document.getElementById("modal-overlay");
  const current = state.importedData.stress || { level: null, sources: [], management: [], note: '' };
  renderContextEditorModal(modal, 'Stress', 'Chronic stress elevates cortisol, disrupts thyroid, raises inflammation, and impairs immunity.', `
    ${renderSelectField('Stress level', 'stress-level', STRESS_LEVELS, current.level)}
    ${renderTagsField('Sources', 'stress-sources', STRESS_SOURCES, current.sources)}
    ${renderTagsField('Management', 'stress-mgmt', STRESS_MGMT, current.management)}
    ${renderNoteField(current.note)}
    ${contextEditorActions(state.importedData.stress != null, 'saveStress', 'clearStress')}`);
  overlay.classList.add("show");
}

export function saveStress() {
  const level = getSelectedOption('stress-level');
  const sources = getSelectedTags('stress-sources');
  const management = getSelectedTags('stress-mgmt');
  const note = (document.getElementById('ctx-note-input') || {}).value || '';
  if (!level && sources.length === 0 && management.length === 0 && !note.trim()) {
    state.importedData.stress = null;
  } else {
    state.importedData.stress = { level, sources, management, note: note.trim() };
  }
  saveAndRefresh('Stress profile saved', 'stress');
}

export function clearStress() {
  state.importedData.stress = null;
  saveAndRefresh('Stress profile cleared', 'stress');
}

// ═══════════════════════════════════════════════
// LOVE LIFE
// ═══════════════════════════════════════════════

export function openLoveLifeEditor() {
  const modal = document.getElementById("detail-modal");
  const overlay = document.getElementById("modal-overlay");
  const current = state.importedData.loveLife || { status: null, satisfaction: null, relationship: null, libido: null, frequency: null, orgasm: null, concerns: [], note: '' };
  renderContextEditorModal(modal, 'Love Life', 'Sexual health and relationships directly affect hormones (testosterone, estrogen, oxytocin, cortisol), immune function, and cardiovascular markers.', `
    ${renderSelectField('Relationship status', 'love-status', LOVE_STATUS, current.status)}
    ${renderSelectField('Relationship quality', 'love-relationship', LOVE_RELATIONSHIP, current.relationship)}
    ${renderSelectField('Overall satisfaction', 'love-satisfaction', LOVE_SATISFACTION, current.satisfaction)}
    <div class="ctx-editor-divider"></div>
    ${renderSelectField('Libido', 'love-libido', LOVE_LIBIDO, current.libido)}
    ${renderSelectField('Sexual frequency', 'love-frequency', LOVE_FREQUENCY, current.frequency)}
    ${renderSelectField('Orgasm', 'love-orgasm', LOVE_ORGASM, current.orgasm)}
    <div class="ctx-editor-divider"></div>
    ${renderTagsField('Concerns', 'love-concerns', LOVE_CONCERNS.filter(c => {
      if (state.profileSex === 'female' && c === 'erectile issues') return false;
      if (state.profileSex === 'male' && c === 'vaginal dryness') return false;
      return true;
    }), current.concerns)}
    ${renderNoteField(current.note)}
    ${contextEditorActions(state.importedData.loveLife != null, 'saveLoveLife', 'clearLoveLife')}`);
  overlay.classList.add("show");
}

export function saveLoveLife() {
  const status = getSelectedOption('love-status');
  const relationship = getSelectedOption('love-relationship');
  const satisfaction = getSelectedOption('love-satisfaction');
  const libido = getSelectedOption('love-libido');
  const frequency = getSelectedOption('love-frequency');
  const orgasm = getSelectedOption('love-orgasm');
  const concerns = getSelectedTags('love-concerns');
  const note = (document.getElementById('ctx-note-input') || {}).value || '';
  if (!status && !relationship && !satisfaction && !libido && !frequency && !orgasm && concerns.length === 0 && !note.trim()) {
    state.importedData.loveLife = null;
  } else {
    state.importedData.loveLife = { status, relationship, satisfaction, libido, frequency, orgasm, concerns, note: note.trim() };
  }
  saveAndRefresh('Love life saved', 'loveLife');
}

export function clearLoveLife() {
  state.importedData.loveLife = null;
  saveAndRefresh('Love life cleared', 'loveLife');
}

// ═══════════════════════════════════════════════
// ENVIRONMENT
// ═══════════════════════════════════════════════

export function openEnvironmentEditor() {
  const modal = document.getElementById("detail-modal");
  const overlay = document.getElementById("modal-overlay");
  const current = state.importedData.environment || { setting: null, climate: null, water: null, waterConcerns: [], emf: [], emfMitigation: [], homeLight: null, air: [], toxins: [], building: null, note: '' };
  const hasEMFAssessment = getEMFAssessments().length > 0;
  renderContextEditorModal(modal, 'Environment', 'Your environment shapes your biology — water quality, EMF, light, air, and toxin exposure directly impact mitochondria, inflammation, and hormone function.', `
    ${renderSelectField('Living setting', 'env-setting', ENV_SETTING, current.setting)}
    ${renderSelectField('Climate', 'env-climate', ENV_CLIMATE, current.climate)}
    <div class="ctx-editor-divider"></div>
    ${renderSelectField('Primary water source', 'env-water', ENV_WATER, current.water)}
    ${renderTagsField('Water concerns', 'env-water-concerns', ENV_WATER_CONCERNS, current.waterConcerns)}
    <div class="ctx-editor-divider"></div>
    <div class="ctx-field-group">
      <label class="ctx-field-label">EMF</label>
      ${renderEMFAssessmentLauncher({ inModal: true, surface: 'environment-editor' })}
    </div>
    ${hasEMFAssessment ? '' : `${renderTagsField('EMF exposure', 'env-emf', ENV_EMF, current.emf)}
    ${renderTagsField('EMF mitigation', 'env-emf-mit', ENV_EMF_MITIGATION, current.emfMitigation)}`}
    <div class="ctx-editor-divider"></div>
    ${renderSelectField('Home/work lighting', 'env-light', ENV_HOME_LIGHT, current.homeLight)}
    ${renderTagsField('Air quality', 'env-air', ENV_AIR, current.air)}
    <div class="ctx-editor-divider"></div>
    ${renderTagsField('Toxin exposure', 'env-toxins', ENV_TOXINS, current.toxins)}
    ${renderSelectField('Building', 'env-building', ENV_BUILDING, current.building)}
    ${renderNoteField(current.note)}
    ${contextEditorActions(state.importedData.environment != null, 'saveEnvironment', 'clearEnvironment')}`);
  overlay.classList.add("show");
}

export function saveEnvironment() {
  const setting = getSelectedOption('env-setting');
  const climate = getSelectedOption('env-climate');
  const water = getSelectedOption('env-water');
  const waterConcerns = getSelectedTags('env-water-concerns');
  const hasEMFAssessment = state.importedData.emfAssessment?.assessments?.length > 0;
  const emf = hasEMFAssessment ? (state.importedData.environment?.emf || []) : getSelectedTags('env-emf');
  const emfMitigation = hasEMFAssessment ? (state.importedData.environment?.emfMitigation || []) : getSelectedTags('env-emf-mit');
  const homeLight = getSelectedOption('env-light');
  const air = getSelectedTags('env-air');
  const toxins = getSelectedTags('env-toxins');
  const building = getSelectedOption('env-building');
  const note = (document.getElementById('ctx-note-input') || {}).value || '';
  if (!setting && !climate && !water && waterConcerns.length === 0 && emf.length === 0 && emfMitigation.length === 0 && !homeLight && air.length === 0 && toxins.length === 0 && !building && !note.trim()) {
    state.importedData.environment = null;
  } else {
    state.importedData.environment = { setting, climate, water, waterConcerns, emf, emfMitigation, homeLight, air, toxins, building, note: note.trim() };
  }
  saveAndRefresh('Environment saved', 'environment');
}

export function clearEnvironment() {
  state.importedData.environment = null;
  saveAndRefresh('Environment cleared', 'environment');
}

// ═══════════════════════════════════════════════
// HEALTH GOALS
// ═══════════════════════════════════════════════

export function openHealthGoalsEditor() {
  const modal = document.getElementById("detail-modal");
  const overlay = document.getElementById("modal-overlay");
  renderHealthGoalsModal(modal);
  overlay.classList.add("show");
}

export function renderHealthGoalsModal(modal) {
  const goals = state.importedData.healthGoals || [];
  let html = '';
  if (goals.length > 0) {
    html += `<div class="goals-list">`;
    for (let i = 0; i < goals.length; i++) {
      const g = goals[i];
      html += `<div class="goals-list-item">
        <span class="goals-severity-badge severity-${g.severity}">${g.severity}</span>
        <span class="goals-text">${escapeHTML(g.text)}</span>
        <button class="goals-delete-btn" onclick="deleteHealthGoal(${i})" title="Remove">&times;</button>
      </div>`;
    }
    html += `</div>`;
  }
  html += `<div class="ctx-field-group"><label class="ctx-field-label">Add goal</label>
    <div class="goals-add-row">
      <input type="text" class="ctx-note-input" id="goal-text-input" placeholder="e.g. Improve insulin sensitivity, Optimize thyroid function" style="flex:1">
      <button class="import-btn import-btn-primary" onclick="addHealthGoal()">Add</button>
    </div>
    <div class="ctx-btn-group" id="goal-severity-select" style="margin-top:8px">
      <button type="button" class="ctx-btn-option active" onclick="selectCtxOption(this,'goal-severity-select')">major</button>
      <button type="button" class="ctx-btn-option" onclick="selectCtxOption(this,'goal-severity-select')">mild</button>
      <button type="button" class="ctx-btn-option" onclick="selectCtxOption(this,'goal-severity-select')">minor</button>
    </div>
  </div>
  <div class="ctx-editor-actions">
    <button class="import-btn import-btn-secondary" onclick="closeHealthGoals()">Done</button>
    ${goals.length > 0 ? `<button class="import-btn import-btn-secondary" style="color:var(--red);border-color:var(--red);margin-left:auto" onclick="clearHealthGoals()">Clear All</button>` : ''}
  </div>`;
  renderContextEditorModal(modal, 'Health Goals', 'List things you want to solve or improve. The AI will prioritize analysis around your stated goals.', html);
  setTimeout(() => {
    const input = document.getElementById('goal-text-input');
    if (input) {
      input.focus();
      input.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); addHealthGoal(); } };
    }
  }, 50);
}

export function addHealthGoal() {
  const input = document.getElementById('goal-text-input');
  const severity = getSelectedOption('goal-severity-select') || 'major';
  const text = input ? input.value.trim() : '';
  if (!text) return;
  if (!state.importedData.healthGoals) state.importedData.healthGoals = [];
  state.importedData.healthGoals.push({ text, severity });
  recordChange('healthGoals');
  saveImportedData();
  renderHealthGoalsModal(document.getElementById("detail-modal"));
}

export function deleteHealthGoal(idx) {
  if (!state.importedData.healthGoals) return;
  state.importedData.healthGoals.splice(idx, 1);
  recordChange('healthGoals');
  saveImportedData();
  renderHealthGoalsModal(document.getElementById("detail-modal"));
}

export function closeHealthGoals() {
  window.closeModal();
  const activeNav = document.querySelector(".nav-item.active");
  window.navigate(activeNav ? activeNav.dataset.category : "dashboard");
  if ((state.importedData.healthGoals || []).length > 0) showNotification('Health goals saved', 'success');
}

export function clearHealthGoals() {
  state.importedData.healthGoals = [];
  recordChange('healthGoals');
  saveImportedData();
  window.closeModal();
  const activeNav = document.querySelector(".nav-item.active");
  window.navigate(activeNav ? activeNav.dataset.category : "dashboard");
  showNotification('Health goals cleared', 'info');
}

// ═══════════════════════════════════════════════
// INTERPRETIVE LENS
// ═══════════════════════════════════════════════

export function openInterpretiveLensEditor() {
  const modal = document.getElementById("detail-modal");
  const overlay = document.getElementById("modal-overlay");
  const current = state.importedData.interpretiveLens || '';
  renderContextEditorModal(modal, 'Interpretive Lens', 'List researchers, clinicians, or scientific paradigms whose frameworks you follow. The AI will consider their perspectives when interpreting your results.', `
    <textarea class="note-editor" id="interpretive-lens-textarea" placeholder="e.g. Longevity medicine, quantum biology, functional endocrinology framework...">${escapeHTML(current)}</textarea>
    <div class="ctx-editor-actions">
      <button class="import-btn import-btn-primary" onclick="saveInterpretiveLens()">Save</button>
      <button class="import-btn import-btn-secondary" onclick="closeModal()">Cancel</button>
      ${current ? `<button class="import-btn import-btn-secondary" style="color:var(--red);border-color:var(--red);margin-left:auto" onclick="clearInterpretiveLens()">Clear</button>` : ''}
    </div>`);
  overlay.classList.add("show");
  setTimeout(() => {
    const ta = document.getElementById('interpretive-lens-textarea');
    if (ta) ta.focus();
  }, 50);
}

export function saveInterpretiveLens() {
  const ta = document.getElementById('interpretive-lens-textarea');
  const text = ta ? ta.value.trim() : '';
  state.importedData.interpretiveLens = text || '';
  recordChange('interpretiveLens');
  saveImportedData();
  window.closeModal();
  const activeNav = document.querySelector(".nav-item.active");
  window.navigate(activeNav ? activeNav.dataset.category : "dashboard");
  showNotification(text ? 'Interpretive lens saved' : 'Interpretive lens cleared', 'success');
}

export function clearInterpretiveLens() {
  state.importedData.interpretiveLens = '';
  recordChange('interpretiveLens');
  saveImportedData();
  window.closeModal();
  const activeNav = document.querySelector(".nav-item.active");
  window.navigate(activeNav ? activeNav.dataset.category : "dashboard");
  showNotification('Interpretive lens cleared', 'info');
}

// Dashboard "AI personalization" zone:
//   - Full-width row for the Interpretive Lens, ONLY if it's set
//   - Full-width row for the Knowledge Base, ONLY if a library is set
//   - Inline pill CTA when {Lens, KB} is unset
//
// DNA was briefly bundled here in v1.3.27 because all three influence AI
// interpretations, but that's a *secondary* effect — DNA is biological
// *data* about the user, not a personalization preference. It belongs
// alongside lab data and weight, not alongside style/voice/sources.
// Empty-state DNA discovery is handled in renderGeneticsSection().
export function renderInterpretiveLensSection() {
  const lens = (state.importedData.interpretiveLens || '').trim();
  let summary; try { summary = getLensSummary(); } catch { summary = null; }
  const kbConfigured = !!(summary && summary.configured);

  const lensRow = lens
    ? `<div class="lens-section" role="button" tabindex="0" aria-label="Edit Interpretive Lens" onclick="openInterpretiveLensEditor()" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();this.click()}" title="Interpretive Lens — click to edit"><span class="lens-section-icon">&#129694;</span><span class="lens-section-body"><span class="lens-section-label">Interpretive Lens</span><span class="lens-section-text">${escapeHTML(lens)}</span></span><span class="lens-section-edit">&#9998;</span></div>`
    : '';
  const kbRow = kbConfigured ? renderKnowledgeBaseRow(summary) : '';
  const aiCta = renderPersonalizeAICta(!!lens, kbConfigured);
  const dataCta = renderDataProtectionCta();
  return lensRow + kbRow + aiCta + dataCta;
}

// Programmatic DNA file picker — mirrors the chat onboarding's hidden
// file input pattern so the same handleDNAFile parser runs. Used by the
// genetics-section empty-state CTA; intentionally only offers autosomal
// raw data (Ancestry/23andMe/etc) since mtDNA-only adds are best managed
// from the genetics section once any DNA lands.
export function triggerDNAFilePicker() {
  let input = document.getElementById('dna-dashboard-input');
  if (!input) {
    input = document.createElement('input');
    input.type = 'file';
    input.id = 'dna-dashboard-input';
    input.accept = '.txt,.csv';
    input.style.display = 'none';
    input.addEventListener('change', () => {
      const f = input.files && input.files[0];
      if (f && typeof window.handleDNAFile === 'function') {
        window.handleDNAFile(f);
      }
      input.value = '';
    });
    document.body.appendChild(input);
  }
  input.click();
}

// The full-width Knowledge Base status row. Only emitted when a library
// is configured. Shows library name, document count when cached, and
// query-rewriting status — surfaces the v1.3.23 default behavior on
// every dashboard load without a toast.
export function renderKnowledgeBaseSection() {
  let s; try { s = getLensSummary(); } catch { return ''; }
  if (!s || !s.configured) return '';
  return renderKnowledgeBaseRow(s);
}

function renderKnowledgeBaseRow(s) {
  const docFragment = (s.docCount != null && s.docCount > 0)
    ? ` &middot; ${s.docCount} document${s.docCount !== 1 ? 's' : ''}`
    : '';
  const rewriteFragment = s.aiAvailable
    ? ` &middot; query rewriting ${s.multiQueryOn ? 'on' : 'off'}`
    : '';
  const detail = `${escapeHTML(s.displayName)}${docFragment}${rewriteFragment}`;
  return `<div class="lens-section" role="button" tabindex="0" aria-label="Manage Knowledge Base" onclick="openKnowledgeBaseModal()" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();this.click()}" title="Knowledge Base — click to manage"><span class="lens-section-icon">&#128218;</span><span class="lens-section-body"><span class="lens-section-label">Knowledge Base</span><span class="lens-section-text">${detail}</span></span><span class="lens-section-edit">&#9998;</span></div>`;
}

// Inline CTA pill that adapts to which feature is missing. Both missing
// → generic pill opens the picker. Exactly one missing → direct CTA
// opens that feature's setup. Hidden once both are configured.
function renderPersonalizeAICta(lensSet, kbSet) {
  if (lensSet && kbSet) return '';
  let icon, label, action;
  if (!lensSet && !kbSet) {
    icon = '&#10024;'; // ✨ — both options
    label = 'Personalize how AI answers';
    action = 'openPersonalizeAIPicker()';
  } else if (!kbSet) {
    icon = '&#128218;'; // 📚 — books
    label = 'Connect a knowledge base';
    action = 'openKnowledgeBaseModal()';
  } else {
    icon = '&#129694;'; // 🪞 — mirror
    label = 'Set an interpretive lens';
    action = 'openInterpretiveLensEditor()';
  }
  return `<button type="button" class="dashboard-cta" onclick="${action}" aria-label="${escapeHTML(label)}">
    <span class="dashboard-cta-icon" aria-hidden="true">${icon}</span>
    <span class="dashboard-cta-plus" aria-hidden="true">+</span>
    <span>${escapeHTML(label)}</span>
  </button>`;
}

// ── Data protection (Encryption / Sync / Backup) ────────────
//
// These three live in Settings → Data and were each invisible from
// the dashboard until now. Pattern mirrors the AI personalize CTA:
// inline pill that adapts to which of the three is missing, picker
// modal when more than one is missing, direct setup when only one.
//
// We intentionally use Settings → Data for ongoing management; the
// dashboard surfaces are first-time-discovery hooks only. When all
// three are configured, the pill disappears.

function getDataProtectionStatus() {
  let backupConfigured = false;
  let backupSupported = true;
  try {
    const s = getFolderBackupState();
    backupSupported = !!s?.supported;
    backupConfigured = !!s?.folderName;
  } catch { /* backup not initialised yet */ }
  return {
    encryption: !!getEncryptionEnabled(),
    sync: !!isSyncEnabled(),
    backup: backupConfigured,
    backupSupported,
  };
}

// Pure render — accepts an explicit state object so it's directly
// testable without stubbing module-level state-checkers (ES module
// exports can't be reassigned). Production caller passes
// getDataProtectionStatus(); tests pass synthetic state.
export function renderDataProtectionCta(stateOverride) {
  const s = stateOverride || getDataProtectionStatus();
  // Treat unsupported backup (Safari, old browsers) as configured so we
  // don't nag users on platforms where the feature is impossible.
  const backupOk = s.backup || !s.backupSupported;
  const missing = [
    !s.encryption ? 'encryption' : null,
    !s.sync ? 'sync' : null,
    !backupOk ? 'backup' : null,
  ].filter(Boolean);
  if (missing.length === 0) return '';
  // Single-feature missing → direct CTA. Multiple missing → picker.
  if (missing.length === 1) {
    const only = missing[0];
    if (only === 'encryption') {
      return `<button type="button" class="dashboard-cta" onclick="showEnableEncryptionModal()" aria-label="Enable encryption">
        <span class="dashboard-cta-icon" aria-hidden="true">&#128274;</span>
        <span class="dashboard-cta-plus" aria-hidden="true">+</span>
        <span>Enable encryption</span>
      </button>`;
    }
    if (only === 'sync') {
      return `<button type="button" class="dashboard-cta" onclick="showSyncSetupModal()" aria-label="Set up cross-device sync">
        <span class="dashboard-cta-icon" aria-hidden="true">&#128225;</span>
        <span class="dashboard-cta-plus" aria-hidden="true">+</span>
        <span>Sync to other devices</span>
      </button>`;
    }
    // backup
    return `<button type="button" class="dashboard-cta" onclick="pickFolderForBackup()" aria-label="Set up auto-backup">
      <span class="dashboard-cta-icon" aria-hidden="true">&#128190;</span>
      <span class="dashboard-cta-plus" aria-hidden="true">+</span>
      <span>Set up auto-backup</span>
    </button>`;
  }
  // 2 or 3 missing → picker
  return `<button type="button" class="dashboard-cta" onclick="openDataProtectionPicker()" aria-label="Protect your data">
    <span class="dashboard-cta-icon" aria-hidden="true">&#128737;</span>
    <span class="dashboard-cta-plus" aria-hidden="true">+</span>
    <span>Protect your data</span>
  </button>`;
}

export function openDataProtectionPicker() {
  let overlay = document.getElementById('data-protection-picker-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'data-protection-picker-overlay';
    overlay.className = 'confirm-overlay';
    document.body.appendChild(overlay);
  }
  const close = () => {
    overlay.classList.remove('show');
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const s = getDataProtectionStatus();
  // Each card shows its current status: green check when configured,
  // muted "Set up" affordance when not. Configured cards stay
  // clickable and just close — clicking already-configured items
  // doesn't open Settings to avoid surprising the user.
  const card = (key, icon, title, sub, configured, onSetup) => `
    <button type="button" class="dashboard-picker-card" data-pick="${key}" ${configured ? 'data-configured="true"' : ''}>
      <span class="dashboard-picker-icon" aria-hidden="true">${icon}</span>
      <span class="dashboard-picker-title">${title} ${configured ? '<span class="dashboard-picker-check" aria-hidden="true">&#10003;</span>' : ''}</span>
      <span class="dashboard-picker-sub">${sub}</span>
      <span class="dashboard-picker-action">${configured ? 'Configured' : 'Set up &rarr;'}</span>
    </button>`;
  overlay.innerHTML = `<div class="confirm-dialog" role="dialog" aria-modal="true" aria-label="Protect your data" style="max-width:560px">
    <p class="confirm-message" style="margin-bottom:14px">Protect your data</p>
    <div class="dashboard-picker-grid">
      ${card('encryption', '&#128274;', 'Encryption', 'Encrypt your data at rest with a passphrase. Browser extensions and anyone with disk access can’t read it without the passphrase.', s.encryption)}
      ${card('sync', '&#128225;', 'Cross-device Sync', 'End-to-end encrypted sync to your other devices. A 24-word mnemonic is your only key — the relay sees ciphertext.', s.sync)}
      ${s.backupSupported
        ? card('backup', '&#128190;', 'Auto-backup', 'Save daily snapshots to a local folder (Proton Drive, Dropbox, NAS, USB drive). Survives browser crashes and reinstalls.', s.backup)
        : ''}
    </div>
    <div class="confirm-actions" style="margin-top:6px">
      <button class="confirm-btn confirm-btn-cancel" id="data-protection-picker-cancel">Close</button>
    </div>
  </div>`;
  overlay.classList.add('show');
  document.addEventListener('keydown', onKey);
  overlay.onclick = (e) => { if (e.target === overlay) close(); };
  overlay.querySelector('#data-protection-picker-cancel').onclick = close;
  // Move focus into the picker so keyboard users start on the first card.
  setTimeout(() => overlay.querySelector('.dashboard-picker-card:not([data-configured="true"]),.dashboard-picker-card,#data-protection-picker-cancel')?.focus(), 50);
  overlay.querySelectorAll('.dashboard-picker-card').forEach(btn => {
    btn.onclick = () => {
      const pick = btn.getAttribute('data-pick');
      const isConfigured = btn.getAttribute('data-configured') === 'true';
      if (isConfigured) { close(); return; }
      close();
      if (pick === 'encryption' && typeof window.showEnableEncryptionModal === 'function') window.showEnableEncryptionModal();
      else if (pick === 'sync' && typeof window.showSyncSetupModal === 'function') window.showSyncSetupModal();
      else if (pick === 'backup' && typeof window.pickFolderForBackup === 'function') window.pickFolderForBackup();
    };
  });
}

// Two-card picker shown when neither feature is configured. Lets the user
// pick which one they want to set up; clicking either card forwards to
// the right editor and dismisses the picker.
export function openPersonalizeAIPicker() {
  let overlay = document.getElementById('ai-personalize-picker-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'ai-personalize-picker-overlay';
    overlay.className = 'confirm-overlay';
    document.body.appendChild(overlay);
  }
  const close = () => {
    overlay.classList.remove('show');
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  overlay.innerHTML = `<div class="confirm-dialog" role="dialog" aria-modal="true" aria-label="Personalize how AI answers" style="max-width:520px">
    <p class="confirm-message" style="margin-bottom:14px">Personalize how AI answers</p>
    <div class="ai-picker-grid">
      <button type="button" class="ai-picker-card" data-pick="lens">
        <span class="ai-picker-icon" aria-hidden="true">&#129694;</span>
        <span class="ai-picker-title">Interpretive Lens</span>
        <span class="ai-picker-sub">Frame answers around researchers, paradigms, or schools of thought.</span>
      </button>
      <button type="button" class="ai-picker-card" data-pick="kb">
        <span class="ai-picker-icon" aria-hidden="true">&#128218;</span>
        <span class="ai-picker-title">Knowledge Base</span>
        <span class="ai-picker-sub">Ground answers in your own documents — research papers, notes, references.</span>
      </button>
    </div>
    <div class="confirm-actions" style="margin-top:6px">
      <button class="confirm-btn confirm-btn-cancel" id="ai-personalize-picker-cancel">Cancel</button>
    </div>
  </div>`;
  overlay.classList.add('show');
  document.addEventListener('keydown', onKey);
  overlay.onclick = (e) => { if (e.target === overlay) close(); };
  overlay.querySelector('#ai-personalize-picker-cancel').onclick = close;
  setTimeout(() => overlay.querySelector('.ai-picker-card,#ai-personalize-picker-cancel')?.focus(), 50);
  overlay.querySelectorAll('.ai-picker-card').forEach(btn => {
    btn.onclick = () => {
      const pick = btn.getAttribute('data-pick');
      close();
      if (pick === 'lens') openInterpretiveLensEditor();
      else if (pick === 'kb' && typeof window.openKnowledgeBaseModal === 'function') {
        window.openKnowledgeBaseModal();
      }
    };
  });
}

// ── Diet contaminant detail modal ──
export function showDietContaminantsModal() {
  const warnings = scanDietForContaminants(state.importedData.diet);
  if (warnings.length === 0) return;
  const modal = document.getElementById('detail-modal');
  const overlay = document.getElementById('modal-overlay');
  const pesticide = warnings.filter(w => w.type === 'pesticide');
  const plastic = warnings.filter(w => w.type === 'plastic');
  const clean = warnings.filter(w => w.type === 'clean');
  let html = `<button class="modal-close" onclick="closeModal()">&times;</button>
    <h3>Food Contaminant Signals</h3>
    <div class="modal-unit">Based on foods mentioned in your diet card, cross-referenced against public contaminant databases.</div>`;
  if (pesticide.length > 0) {
    html += `<div class="contaminant-section"><div class="contaminant-section-title">\uD83E\uDD6C Pesticide Residues</div>`;
    for (const w of pesticide) {
      html += `<div class="contaminant-detail-item">\u26A0\uFE0F ${escapeHTML(w.warning)} <a href="${escapeHTML(w.url)}" target="_blank" rel="noopener">${escapeHTML(w.source)}</a></div>`;
    }
    html += `</div>`;
  }
  if (plastic.length > 0) {
    html += `<div class="contaminant-section"><div class="contaminant-section-title">\uD83E\uDDF4 Plastic Chemicals</div>`;
    for (const w of plastic) {
      html += `<div class="contaminant-detail-item">\u26A0\uFE0F ${escapeHTML(w.warning)} <a href="${escapeHTML(w.url)}" target="_blank" rel="noopener">${escapeHTML(w.source)}</a></div>`;
    }
    html += `</div>`;
  }
  if (clean.length > 0) {
    html += `<div class="contaminant-section"><div class="contaminant-section-title">\u2705 Low Contamination</div>`;
    for (const w of clean) {
      html += `<div class="contaminant-detail-item">${escapeHTML(w.warning)} <a href="${escapeHTML(w.url)}" target="_blank" rel="noopener">${escapeHTML(w.source)}</a></div>`;
    }
    html += `</div>`;
  }
  html += `<div class="contaminant-actions">
    <button class="import-btn import-btn-primary" onclick="closeModal(); window.openChatPanel(); setTimeout(() => window.useChatPrompt('What food contaminants should I be concerned about based on my diet?'), 300)">Discuss with AI</button>
    <button class="import-btn import-btn-secondary" onclick="closeModal()">Close</button>
  </div>
  <div class="contaminant-attribution">Sources: <a href="https://www.ewg.org/foodnews/" target="_blank" rel="noopener">EWG Shopper's Guide 2025</a> · <a href="https://www.plasticlist.org/report" target="_blank" rel="noopener">PlasticList</a></div>`;
  modal.innerHTML = html;
  overlay.classList.add('show');
}

// ── Card tips badges (async — waits for catalog) ──
async function loadContextCardTips() {
  if (!window.isProductRecsEnabled || !window.isProductRecsEnabled()) return;
  if (!window.loadCatalog || !window.getCardSlotKeys) return;
  await window.loadCatalog();
  const cardKeys = ['sleepRest', 'lightCircadian', 'environment', 'exercise', 'diet', 'stress'];
  for (const key of cardKeys) {
    const el = document.getElementById(`ctx-tips-${key}`);
    if (!el || el.children.length > 0) continue;
    if (window.getCardSlotKeys(key).length === 0) continue;
    const badge = document.createElement('span');
    badge.className = 'ctx-tips-badge';
    badge.textContent = 'Tips';
    badge.title = 'Lifestyle tips for this area';
    badge.onclick = (e) => { e.stopPropagation(); openCardTipsModal(key); };
    el.appendChild(badge);
  }
}

// ── Card tips modal ──
function openCardTipsModal(cardKey) {
  if (!window.renderCardTipsModal) return;
  const html = window.renderCardTipsModal(cardKey);
  if (!html) return;
  // Reuse the detail modal overlay
  const overlay = document.getElementById('modal-overlay');
  const modal = document.getElementById('detail-modal');
  if (!overlay || !modal) return;
  modal.innerHTML = html;
  overlay.classList.add('show');
}

// ── Window exports for onclick handlers ──
Object.assign(window, {
  getConditionsSummary,
  getDietSummary,
  getExerciseSummary,
  getSleepSummary,
  getLightCircadianSummary,
  getStressSummary,
  getLoveLifeSummary,
  getEnvironmentSummary,
  getGoalsSummary,
  isContextFilled,
  renderProfileContextCards,
  debounceContextNotes,
  applyDotColor,
  applyAISummary,
  getCardFingerprint,
  loadContextHealthDots,
  refreshAllHealthDots,
  renderSelectField,
  selectCtxOption,
  getSelectedOption,
  renderTagsField,
  toggleCtxTag,
  getSelectedTags,
  renderNoteField,
  contextEditorActions,
  saveAndRefresh,
  openDiagnosesEditor,
  renderDiagnosesModal,
  filterConditionSuggestions,
  selectConditionSuggestion,
  closeSuggestionsOnClickOutside,
  syncDiagnosesNote,
  addCondition,
  editCondition,
  cancelConditionEdit,
  deleteCondition,
  addFamilyHistoryEntry,
  editFamilyHistoryEntry,
  cancelFamilyHistoryEdit,
  deleteFamilyHistoryEntry,
  filterFamilyConditionSuggestions,
  selectFamilyConditionSuggestion,
  saveDiagnoses,
  closeDiagnoses,
  clearDiagnoses,
  openDietEditor,
  saveDiet,
  clearDiet,
  openSleepRestEditor,
  saveSleepRest,
  clearSleepRest,
  openLightCircadianEditor,
  saveLightCircadian,
  clearLightCircadian,
  openExerciseEditor,
  saveExercise,
  clearExercise,
  openStressEditor,
  saveStress,
  clearStress,
  openLoveLifeEditor,
  saveLoveLife,
  clearLoveLife,
  openEnvironmentEditor,
  saveEnvironment,
  clearEnvironment,
  openHealthGoalsEditor,
  renderHealthGoalsModal,
  addHealthGoal,
  deleteHealthGoal,
  closeHealthGoals,
  clearHealthGoals,
  openInterpretiveLensEditor,
  saveInterpretiveLens,
  clearInterpretiveLens,
  renderInterpretiveLensSection,
  renderKnowledgeBaseSection,
  openPersonalizeAIPicker,
  openDataProtectionPicker,
  triggerDNAFilePicker,
  recordChange,
  showDietContaminantsModal,
  openCardTipsModal,
  loadContextCardTips,
});
