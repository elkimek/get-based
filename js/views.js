// views.js — Navigate, dashboard, category views, detail modal, compare, correlations

import { state } from './state.js';
import { CORRELATION_PRESETS, CHIP_COLORS, trackUsage } from './schema.js';
import { escapeHTML, getStatus, getRangePosition, formatValue, getTrend, showNotification, showConfirmDialog, hasCardContent } from './utils.js';
import { getChartColors } from './theme.js';
import { getActiveData, filterDatesByRange, destroyAllCharts, getEffectiveRange, getEffectiveRangeForDate, getLatestValueIndex, getAllFlaggedMarkers, statusIcon, detectTrendAlerts, getKeyTrendMarkers, getFocusCardFingerprint, saveImportedData, recalculateHOMAIR, updateHeaderDates, renderDateRangeFilter, renderChartLayersDropdown, convertDisplayToSI } from './data.js';
import { profileStorageKey } from './profile.js';
import { createLineChart, getMarkerDescription, getNotesForChart, getSupplementsForChart, refBandPlugin, noteAnnotationPlugin, supplementBarPlugin } from './charts.js';
import { renderSupplementsSection } from './supplements.js';
import { renderWearableStrip } from './wearables.js';
import { renderGeneticsSection } from './dna.js';
import { renderMenstrualCycleSection } from './cycle.js';
import { renderProfileContextCards, renderInterpretiveLensSection, loadContextHealthDots, closeSuggestionsOnClickOutside } from './context-cards.js';
import { callClaudeAPI, hasAIProvider, isAIPaused, getAIProvider, getActiveModelId } from './api.js';
import { setupDropZone } from './pdf-import.js';
import { injectLensChunks } from './lab-context.js';
import { hasLens, queryLens } from './lens.js';
import { applyInlineMarkdown } from './markdown.js';

function markerHasData(m) { return m.values?.some(v => v !== null) ?? false; }

// ═══════════════════════════════════════════════
// NAVIGATE (router)
// ═══════════════════════════════════════════════

export function navigate(category, data) {
  document.querySelectorAll(".nav-item").forEach(el => {
    el.classList.toggle("active", el.dataset.category === category);
  });
  // Close mobile sidebar on navigation
  if (window.closeMobileSidebar) window.closeMobileSidebar();
  if (window.syncImportStatusFab) window.syncImportStatusFab();
  destroyAllCharts();
  if (category === "dashboard") showDashboard(data);
  else if (category === "correlations") showCorrelations(data);
  else if (category === "compare") showCompare(data);
  else showCategory(category, data);
}

// ═══════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════

export function showDashboard(data) {
  if (!data) data = getActiveData();
  const main = document.getElementById("main-content");
  const hasData = data.dates.length > 0 || Object.values(data.categories).some(c => c.singlePoint && c.singleDate);

  // Show/hide import FAB based on whether dashboard has data
  const importFab = document.getElementById('import-fab');
  if (importFab) importFab.classList.toggle('hidden', !hasData);

  // ── Empty state: welcome hero + collapsed context ──
  if (!hasData) {
    let html = `<div class="welcome-hero">
      <h2>Welcome to getbased</h2>
      <p class="welcome-hero-subtitle">Lab work + wearables, in one dashboard</p>
      <div class="drop-zone" id="drop-zone">
        <div class="drop-zone-icon">\uD83D\uDCC4</div>
        <div class="drop-zone-text">Drop PDF, image, JSON, or DNA raw data file here, or click to browse</div>
        <div class="drop-zone-hint">AI-powered — works with any lab report (PDF, photo, screenshot) or getbased JSON export</div>
        ${!hasAIProvider() ? `<div class="drop-zone-api-hint">${isAIPaused() ? 'AI features are paused — <a href="#" onclick="event.preventDefault();event.stopPropagation();window.openSettingsModal(\'ai\')">re-enable in Settings</a>' : 'Requires an AI connection — <a href="#" onclick="event.preventDefault();event.stopPropagation();closeChatPanel();window.openSettingsModal(\'ai\')">set up in 30 seconds</a>'}</div>` : ''}</div>
      <div class="welcome-wearable-hint">
        ⧬ Got an Oura, Withings, Fitbit, Polar, or Apple Health export? <a href="#" onclick="event.preventDefault();window.openSettingsModal('wearables')">Connect it</a> to see HRV, sleep, recovery, and body composition trends alongside your blood work.
      </div>
      <div class="onboarding-divider">
        <span class="onboarding-divider-line"></span>
        <span class="onboarding-divider-text">or explore with demo data</span>
        <span class="onboarding-divider-line"></span>
      </div>
      <div class="demo-cards">
        <button class="demo-card" onclick="loadDemoData('female')">
          <span class="demo-card-avatar">\uD83D\uDC69</span>
          <span class="demo-card-name">Sarah, 34</span>
          <span class="demo-card-desc">Iron + Oura: overtraining clues</span>
        </button>
        <button class="demo-card" onclick="loadDemoData('male')">
          <span class="demo-card-avatar">\uD83D\uDC68</span>
          <span class="demo-card-name">Alex, 38</span>
          <span class="demo-card-desc">Metabolic + Withings body comp</span>
        </button>
      </div>
    </div>`;
    // Wearable strip renders even without lab data \u2014 users who connect Oura
    // etc. before importing any PDFs should still see their HRV / sleep /
    // RHR trends. renderWearableStrip() returns '' when no wearables are
    // connected, so it's safe to always call.
    html += renderWearableStrip();
    const detailsOpen = sessionStorage.getItem('welcome-details-open') === '1';
    html += `<details class="welcome-context-details"${detailsOpen ? ' open' : ''}>
      <summary class="welcome-context-summary" onclick="setTimeout(()=>sessionStorage.setItem('welcome-details-open',document.querySelector('.welcome-context-details')?.open?'1':'0'),0)">Don\u2019t have labs yet? Tell the AI about yourself</summary>`;
    html += renderProfileContextCards();
    if (state.profileSex === 'female') html += renderMenstrualCycleSection(data);
    html += renderSupplementsSection();
    html += `</details>`;
    html += renderGeneticsSection();
    main.innerHTML = html;
    setupDropZone();
    return;
  }

  // ── Has data: full dashboard ──
  let html = `<div class="category-header"><h2>Dashboard Overview</h2>
    <p>Summary of all blood work results across ${data.dates.length} collection date${data.dates.length !== 1 ? 's' : ''}</p></div>`;
  // Drop zone hidden element for drag-drop + file input (no visible space on dashboard)
  html += `<div class="drop-zone drop-zone-hidden" id="drop-zone"></div>`;

  // ── 2. Onboarding Banner (Step 2) ──
  html += renderOnboardingBanner();

  // Knowledge Base is now discoverable via the dashboard CTA pill
  // ("Connect a knowledge base") and lives in its own dedicated modal —
  // see openKnowledgeBaseModal() in lens.js. No banner needed here.

  // ── 3. Interpretive Lens ──
  html += renderInterpretiveLensSection();

  // ── 3b. Focus Card (always render if data exists — shows cached insight even when AI is paused) ──
  html += renderFocusCard();

  // ── 3c. Wearable strip (Oura · Withings · Ultrahuman · WHOOP · Fitbit · Apple Health) ──
  html += renderWearableStrip();

  // ── 4. Profile Context Cards ──
  html += renderProfileContextCards();

  // ── 5. Menstrual Cycle (female only) ──
  if (state.profileSex === 'female') html += renderMenstrualCycleSection(data);

  // ── 6. Supplements & Medications ──
  html += renderSupplementsSection();

  // ── 7. Key Trends ──
  const filteredData = filterDatesByRange(data);
  html += `<div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;margin-top:16px">
    <div class="category-header" style="margin:0"><h2>Key Trends</h2>
    <p>Auto-selected from your data</p></div>
    ${renderDateRangeFilter()}
    ${renderChartLayersDropdown()}
  </div>`;

  const keyMarkers = getKeyTrendMarkers(filteredData);
  if (keyMarkers.length > 0) {
    html += `<div class="charts-grid charts-grid-4col">`;
    for (const km of keyMarkers) {
      const marker = filteredData.categories[km.cat].markers[km.key];
      html += renderChartCard(km.cat + "_" + km.key, marker, filteredData.dateLabels);
    }
    html += `</div>`;
  }

  // ── 7b. Genetics (static data, after dynamic trends) ──
  html += renderGeneticsSection();

  // ── 8. Trends & Critical Flags ──
  const trendAlerts = detectTrendAlerts(filteredData);
  const trendMarkerIds = new Set(trendAlerts.map(a => a.id));
  const allFlags = getAllFlaggedMarkers(data);
  // Critical flags always use reference range (not optimal) — critical is a medical concept
  const criticalFlags = allFlags.filter(f => {
    if (trendMarkerIds.has(f.id)) return false;
    const refRange = f.refMax - f.refMin;
    if (refRange <= 0 || f.refMin == null || f.refMax == null) return false;
    const distance = f.status === 'high' ? (f.rawValue - f.refMax) : (f.refMin - f.rawValue);
    return distance > refRange * 0.5;
  });
  const totalAttention = trendAlerts.length + criticalFlags.length;
  if (totalAttention > 0) {
    html += `<div class="alerts-section"><div class="alerts-title">Trends & Alerts (${totalAttention})</div>`;
    for (const alert of trendAlerts) {
      const isSudden = alert.concern.startsWith('sudden_');
      const isPast = alert.concern.startsWith('past_');
      const cls = isSudden ? 'trend-alert-sudden' : isPast ? 'trend-alert-danger' : 'trend-alert-warning';
      const arrow = isSudden ? '\u26A1' : alert.direction === 'rising' ? '\u2197' : '\u2198';
      const label = alert.concern === 'sudden_high' ? 'Sudden jump above range'
        : alert.concern === 'sudden_low' ? 'Sudden drop below range'
        : alert.concern === 'past_high' ? 'Above range & rising'
        : alert.concern === 'past_low' ? 'Below range & falling'
        : alert.concern === 'approaching_high' ? 'Approaching upper limit'
        : 'Approaching lower limit';
      html += `<div class="trend-alert-card ${cls}" onclick="showDetailModal('${alert.id}')">
        <span class="trend-alert-arrow">${arrow}</span>
        <div class="trend-alert-info">
          <div class="trend-alert-name">${escapeHTML(alert.name)} <span class="trend-alert-cat">${escapeHTML(alert.category)}</span></div>
          <div class="trend-alert-label">${label}</div>
        </div>
        <div class="trend-alert-spark">${alert.spark.join(' \u2192 ')}</div>
      </div>`;
    }
    for (const f of criticalFlags) {
      const cls = f.status === "high" ? "alert-high" : "alert-low";
      const label = f.status === "high" ? "\u25B2 CRITICAL HIGH" : "\u25BC CRITICAL LOW";
      html += `<div class="alert-card ${cls}" onclick="navigate('${f.categoryKey}')">
        <span class="alert-indicator">${label}</span>
        <span class="alert-name">${escapeHTML(f.name)}</span>
        <span class="alert-value">${escapeHTML(String(f.value))} ${escapeHTML(f.unit)}</span>
        <span class="alert-ref">${formatValue(f.effectiveMin)} \u2013 ${formatValue(f.effectiveMax)}</span></div>`;
    }
    html += `</div>`;
  }

  // ── 9. Notes (bottom) ──
  const hasNotes = state.importedData.notes && state.importedData.notes.length > 0;
  {
    const noteCount = (state.importedData.notes || []).length;
    const noteBadge = noteCount > 0 ? ` (${noteCount})` : '';
    html += `<div style="margin-top:20px"><span class="context-section-title">Notes${noteBadge}</span></div>`;
    html += `<div class="notes-section">`;
    html += `<button class="add-note-btn" onclick="openNoteEditor()">+ Add Note</button>`;
    if (hasNotes) {
      const notes = state.importedData.notes
        .map((note, i) => ({ note, idx: i }))
        .sort((a, b) => a.note.date.localeCompare(b.note.date));
      for (const { note, idx } of notes) {
        const d = new Date(note.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        const preview = escapeHTML(note.text.length > 200 ? note.text.slice(0, 200) + '...' : note.text);
        html += `<div class="note-card" onclick="openNoteEditor(null, ${idx})">
          <div class="note-card-date">${d}</div>
          <div class="note-card-text">${preview}</div>
          <div class="note-card-actions">
            <button class="note-card-action" onclick="event.stopPropagation();openNoteEditor(null, ${idx})">Edit</button>
            <button class="note-card-action note-card-action-delete" onclick="event.stopPropagation();deleteNote(${idx})">Delete</button>
          </div>
        </div>`;
      }
    } else {
      html += `<div style="color:var(--text-muted);font-size:13px;padding:12px 0;font-style:italic">No notes yet — add notes to track context around your lab results</div>`;
    }
    html += `</div>`;
  }

  main.innerHTML = html;

  for (const km of keyMarkers) {
    const marker = filteredData.categories[km.cat].markers[km.key];
    createLineChart(km.cat + "_" + km.key, marker, filteredData.dateLabels, filteredData.dates, filteredData.phaseLabels);
  }
  setupDropZone();

  // Non-blocking: load focus card, health dots, and recs after DOM is ready
  if (hasData) loadFocusCard();
  if (hasData) loadChartCardRecs();
  loadContextHealthDots();
  if (window.loadContextCardTips) window.loadContextCardTips();
  loadCommitHash();
  // Preload catalog so rec sections and sorting use it immediately
  if (window.loadCatalog) window.loadCatalog().then(c => { window._cachedCatalog = c; });

  // Auto-trigger guided tour on first visit — but skip if no data (chat onboarding handles new users)
  const _p = window.getProfiles?.()?.find(p => p.id === state.currentProfile);
  const _hasProfile = _p?.name && _p.name !== 'Default' && state.profileSex;
  if (_hasProfile && hasData) {
    if (window.startTour) window.startTour(true);
  } else if (!hasData) {
    // First-time visitor: auto-open chat onboarding after a short delay
    setTimeout(() => window.openChatPanel?.(), 800);
  }
}

// ── Commit Hash ──

let _cachedCommitHash = null;

// Remembered focus before a detail modal opens, so closeModal() can return
// focus to the trigger. Keyboard users otherwise land on <body> after close
// and lose their place in the page.
let _modalLastTrigger = null;
export function rememberModalTrigger() {
  const el = document.activeElement;
  _modalLastTrigger = (el && el !== document.body && typeof el.focus === 'function') ? el : null;
}
function restoreModalTrigger() {
  const el = _modalLastTrigger;
  _modalLastTrigger = null;
  if (!el || !document.contains(el)) return;
  try { el.focus(); } catch { /* element may have been replaced */ }
}
function loadCommitHash() {
  const vEl = document.getElementById('app-version-text');
  if (vEl && !vEl.textContent) vEl.textContent = window.APP_VERSION || '';
  const el = document.getElementById('app-commit-hash');
  if (!el) return;
  if (_cachedCommitHash) { el.innerHTML = `<a href="https://github.com/elkimek/get-based/commit/${_cachedCommitHash}" target="_blank" rel="noopener">${_cachedCommitHash}</a>`; return; }
  fetch('https://api.github.com/repos/elkimek/get-based/commits/main', { headers: { Accept: 'application/vnd.github.sha' } })
    .then(r => r.ok ? r.text() : Promise.reject())
    .then(sha => { _cachedCommitHash = sha.slice(0, 7); const e = document.getElementById('app-commit-hash'); if (e) e.innerHTML = `<a href="https://github.com/elkimek/get-based/commit/${_cachedCommitHash}" target="_blank" rel="noopener">${_cachedCommitHash}</a>`; })
    .catch(() => {});
}

// ── Focus Card ──

export function renderFocusCard() {
  const cacheKey = profileStorageKey(state.currentProfile, 'focusCard');
  const cached = (() => { try { return JSON.parse(localStorage.getItem(cacheKey)); } catch(e) { return null; } })();
  const fp = getFocusCardFingerprint();
  const text = (cached && cached.fingerprint === fp) ? cached.text : null;
  return `<div class="focus-card" id="focus-card">
    <div class="focus-card-icon">\uD83D\uDD2C</div>
    <div class="focus-card-body" id="focus-card-body">${text
      ? `<span class="focus-card-text">${applyInlineMarkdown(text)}</span>`
      : `<span class="focus-card-shimmer"></span>`}</div>
    <button class="focus-card-refresh" onclick="refreshFocusCard()" title="Regenerate insight">\u21BB</button>
  </div>`;
}

export function buildFocusContext() {
  const data = getActiveData();
  if (!data.dates.length && !Object.values(data.categories).some(c => c.singleDate)) {
    return null;
  }
  const sexLabel = state.profileSex === 'female' ? 'female' : state.profileSex === 'male' ? 'male' : 'not specified';
  const age = state.profileDob ? Math.floor((new Date() - new Date(state.profileDob)) / (365.25 * 24 * 60 * 60 * 1000)) : null;
  const today = new Date().toISOString().slice(0, 10);
  const lastDate = data.dates[data.dates.length - 1];
  let ctx = `Profile: ${sexLabel}${age !== null ? ', age ' + age : ''}, today ${today}, last labs ${lastDate}\n`;

  // Health goals (all priorities)
  const healthGoals = state.importedData.healthGoals || [];
  if (healthGoals.length > 0) {
    const byPriority = { major: [], mild: [], minor: [] };
    for (const g of healthGoals) (byPriority[g.severity] || byPriority.minor).push(g.text);
    const parts = [];
    for (const [sev, items] of Object.entries(byPriority)) {
      if (items.length > 0) parts.push(`${sev}: ${items.join('; ')}`);
    }
    ctx += `Goals: ${parts.join(' | ')}\n`;
  }

  // Interpretive lens
  const interpretiveLens = state.importedData.interpretiveLens || '';
  if (interpretiveLens.trim()) {
    ctx += `Lens: ${interpretiveLens.trim()}\n`;
  }

  // Medical conditions
  const diag = state.importedData.diagnoses;
  if (hasCardContent(diag)) {
    const conditions = (diag.conditions || []).map(c => `${c.name} (${c.severity})`);
    if (conditions.length > 0) ctx += `Conditions: ${conditions.join(', ')}\n`;
    if (diag.note) ctx += `Medical notes: ${diag.note}\n`;
  }

  // Additional context notes
  const contextNotes = state.importedData.contextNotes || '';
  if (contextNotes.trim()) {
    ctx += `Notes for AI: ${contextNotes.trim()}\n`;
  }

  // Flagged/non-normal markers (latest values only), respecting AI context toggles
  const _isAICtx = (catKey) => { const g = data.categories[catKey]?.group; return !g || (window.isGroupInAIContext ? window.isGroupInAIContext(g) : true); };
  const flags = getAllFlaggedMarkers(data).filter(f => _isAICtx(f.categoryKey));
  if (flags.length > 0) {
    ctx += `Flagged (${flags.length} total${flags.length > 15 ? ', showing top 15' : ''}):\n`;
    for (const f of flags.slice(0, 15)) {
      ctx += `- ${f.name}: ${f.value} ${f.unit} (${f.status}, ref ${f.effectiveMin}\u2013${f.effectiveMax})\n`;
    }
  }

  // Supplements with temporal context (cap at 8 for focus card)
  const supps = (state.importedData.supplements || []).slice(0, 8);
  if (supps.length > 0) {
    ctx += `Supplements:\n`;
    for (const s of supps) {
      const pds = (s.periods && s.periods.length > 0) ? [...s.periods].sort((a, b) => a.start.localeCompare(b.start)) : [{ start: s.startDate, end: s.endDate }];
      const dateRange = pds.length === 1
        ? `${pds[0].start} \u2192 ${pds[0].end || 'ongoing'}`
        : pds.map(p => `${p.start}\u2192${p.end || 'now'}`).join(', ');
      let timing = '';
      const firstStart = pds[0].start;
      if (lastDate && firstStart > lastDate) timing = ' (started AFTER last labs — cannot have affected these results)';
      else if (lastDate && data.dates.length >= 2 && firstStart > data.dates[data.dates.length - 2]) timing = ' (started between last two labs)';
      // Top impact summary for AI context
      let impactNote = '';
      if (!timing && data.dates.length >= 2) {
        const impacts = window.computeAllImpacts?.(s, data);
        if (impacts && impacts.length > 0) {
          const top = impacts.slice(0, 2).filter(im => im.confidence !== 'low');
          if (top.length > 0) {
            impactNote = ' — impacts: ' + top.map(im => `${im.markerName} ${im.pctChange > 0 ? '+' : ''}${im.pctChange.toFixed(1)}%`).join(', ');
          }
        }
      }
      ctx += `- ${s.name}${s.dosage ? ' (' + s.dosage + ')' : ''} [${s.type}]: ${dateRange}${timing}${impactNote}\n`;
    }
  }

  // Also include any markers that changed significantly (latest vs previous)
  const changes = [];
  for (const [catKey, cat] of Object.entries(data.categories)) {
    if (!_isAICtx(catKey)) continue;
    for (const [key, m] of Object.entries(cat.markers)) {
      const nonNull = m.values.filter(v => v !== null);
      if (nonNull.length < 2) continue;
      const prev = nonNull[nonNull.length - 2];
      const last = nonNull[nonNull.length - 1];
      if (prev === 0) continue;
      const pct = Math.abs((last - prev) / prev * 100);
      if (pct > 20) {
        const dir = last > prev ? 'up' : 'down';
        const ref = m.refMin != null && m.refMax != null ? `, ref ${m.refMin}–${m.refMax}` : '';
        const status = getStatus(last, m.refMin, m.refMax);
        changes.push(`${m.name}: ${prev} → ${last} ${m.unit || ''} (${dir} ${pct.toFixed(0)}%${ref}, ${status})`);
      }
    }
  }
  if (changes.length > 0) {
    ctx += `Notable changes:\n${changes.slice(0, 5).map(c => '- ' + c).join('\n')}\n`;
  }

  return ctx;
}

export async function loadFocusCard() {
  const el = document.getElementById('focus-card-body');
  if (!el) return;
  const cacheKey = profileStorageKey(state.currentProfile, 'focusCard');
  const cached = (() => { try { return JSON.parse(localStorage.getItem(cacheKey)); } catch(e) { return null; } })();
  const fp = getFocusCardFingerprint();
  if (cached && cached.text) {
    el.innerHTML = `<span class="focus-card-text">${applyInlineMarkdown(cached.text)}</span>`;
    if (cached.fingerprint === fp || !hasAIProvider()) return;
  }
  if (!hasAIProvider()) {
    if (!cached?.text) el.innerHTML = `<span class="focus-card-text" style="color:var(--text-muted)">Enable AI to generate insights</span>`;
    return;
  }
  el.innerHTML = `<span class="focus-card-text" style="color:var(--text-muted)">🔍 Looking into your results\u2026</span>`;
  try {
    let ctx = buildFocusContext();
    if (!ctx) {
      el.innerHTML = `<span class="focus-card-text" style="color:var(--text-muted)">No insight available</span>`;
      return;
    }
    if (hasLens()) {
      const data = getActiveData();
      const goals = (state.importedData.healthGoals || []).map(g => g.text).slice(0, 3).join('; ');
      const flags = getAllFlaggedMarkers(data).slice(0, 5).map(f => f.name).join(', ');
      const hint = [goals && 'Goals: ' + goals, flags && 'Flagged: ' + flags].filter(Boolean).join(' | ') || 'prioritize and summarize lab findings';
      const lensResult = await queryLens(hint);
      if (lensResult) ctx = injectLensChunks(ctx, lensResult);
    }
    const focusSystem = `You summarize blood work for a health dashboard card. Write 3-5 sentences, no more. Rules:
- Start with the single most critical finding and why it matters for this person's goals/conditions
- Then mention 1-2 secondary findings worth watching
- End with one concrete next step (retest, lifestyle change, discuss with provider)
- Connect findings to each other when relevant (e.g. liver markers + hormones)
- Only flag values genuinely outside reference range
- Never recommend specific supplements or products
- Only reference data provided below — never infer or assume
- Never attribute changes to supplements started after the last lab date
- CRITICAL: Output ONLY the insight text. No thinking, no reasoning, no "Let me analyze", no numbered analysis steps, no preamble. Start directly with your finding.`;

    // Typewriter: trickle streamed text for smooth appearance
    const textEl = document.createElement('span');
    textEl.className = 'focus-card-text';
    let target = '', displayed = 0, timer = null;
    function tick() {
      if (displayed >= target.length) { timer = null; return; }
      const batch = Math.max(1, Math.ceil((target.length - displayed) * 0.3));
      displayed = Math.min(displayed + batch, target.length);
      textEl.textContent = target.slice(0, displayed);
      timer = setTimeout(tick, 16);
    }

    const { text: fullText, usage } = await callClaudeAPI({
      system: focusSystem,
      messages: [{ role: 'user', content: ctx }],
      maxTokens: 500,
      onStream(text) {
        if (text.length < target.length) displayed = 0; // reset typewriter if stream cleared reasoning
        target = text;
        if (!textEl.parentNode) { el.innerHTML = ''; el.appendChild(textEl); }
        if (!timer) tick();
      }
    });
    if (timer) { clearTimeout(timer); timer = null; }

    if (usage) {
      trackUsage(getAIProvider(), getActiveModelId(), usage.inputTokens || 0, usage.outputTokens || 0);
    }
    let trimmed = (fullText || '')
      .replace(/<think>[\s\S]*?<\/think>/g, '')
      .trim();
    // Strip thinking-out-loud preamble — remove lines starting with reasoning patterns
    const lines = trimmed.split('\n');
    const thinkingPattern = /^(Let me |I need to |I should |I'll |Key findings|The user |Looking at the|Now |First,|So |OK |Alright|\d+\.\s+\w+:)/i;
    let startIdx = 0;
    while (startIdx < lines.length && (thinkingPattern.test(lines[startIdx].trim()) || lines[startIdx].trim() === '')) startIdx++;
    if (startIdx > 0 && startIdx < lines.length) trimmed = lines.slice(startIdx).join('\n').trim();
    // Safety cap — truncate at last sentence boundary within 1500 chars
    if (trimmed.length > 1500) { const cut = trimmed.slice(0, 1500).lastIndexOf('.'); if (cut > 100) trimmed = trimmed.slice(0, cut + 1); }
    if (trimmed) {
      localStorage.setItem(cacheKey, JSON.stringify({ fingerprint: fp, text: trimmed }));
      el.innerHTML = `<span class="focus-card-text">${applyInlineMarkdown(trimmed)}</span>`;
    } else {
      el.innerHTML = `<span class="focus-card-text" style="color:var(--text-muted)">No insight available</span>`;
    }
  } catch(e) {
    el.innerHTML = `<span class="focus-card-text" style="color:var(--text-muted)">Could not load insight</span>`;
  }
}

export function refreshFocusCard() {
  const cacheKey = profileStorageKey(state.currentProfile, 'focusCard');
  localStorage.removeItem(cacheKey);
  loadFocusCard();
}

// ── Chart Card Recommendation Links ──
async function loadChartCardRecs() {
  if (!window.isProductRecsEnabled || !window.isProductRecsEnabled()) return;
  if (!window.loadCatalog) return;
  const catalog = await window.loadCatalog();
  if (!catalog || !catalog.slots) return;

  const els = document.querySelectorAll('[id^="chart-rec-"]');
  for (const el of els) {
    if (el.children.length > 0) continue;
    const id = el.id.replace('chart-rec-', '');
    const slotKey = id.replace('_', '.');
    const slot = catalog.slots[slotKey];
    if (!slot) continue;
    const badge = document.createElement('span');
    badge.className = 'ctx-tips-badge';
    badge.textContent = 'Tips';
    badge.title = 'What can help';
    badge.onclick = e => {
      e.stopPropagation();
      showDetailModal(id, { scrollToRec: true });
    };
    el.appendChild(badge);
  }
  // Reorder chart cards: those with tips badges first (within each grid)
  for (const grid of document.querySelectorAll('.charts-grid')) {
    const cards = Array.from(grid.querySelectorAll('.chart-card'));
    const withRec = cards.filter(c => c.querySelector('.ctx-tips-badge'));
    const without = cards.filter(c => !c.querySelector('.ctx-tips-badge'));
    for (const c of [...withRec, ...without]) grid.appendChild(c);
  }
  // One-time nudge (must query after badges are added)
  const recLinks = document.querySelectorAll('[id^="chart-rec-"] .ctx-tips-badge');
  if (recLinks.length > 0 && !localStorage.getItem('labcharts-rec-nudge-seen')) {
    localStorage.setItem('labcharts-rec-nudge-seen', '1');
    showNotification(`${recLinks.length} marker${recLinks.length > 1 ? 's have' : ' has'} actionable tips \u2014 look for the Tips badge on your chart cards`, 'info');
  }
}

// ── Onboarding ──

export function renderOnboardingBanner() {
  const onboarded = localStorage.getItem(profileStorageKey(state.currentProfile, 'onboarded'));
  if (onboarded) return '';
  if (state.profileSex && state.profileDob) {
    localStorage.setItem(profileStorageKey(state.currentProfile, 'onboarded'), 'profile-set');
    return '';
  }
  return `<div class="onboarding-banner" id="onboarding-banner">
    <div class="onboarding-steps">
      <span class="onboarding-step completed">\u2713</span>
      <span class="onboarding-step-line"></span>
      <span class="onboarding-step active">2</span>
      <span class="onboarding-step-line"></span>
      <span class="onboarding-step">3</span>
    </div>
    <div class="onboarding-step-labels">
      <span class="onboarding-step-label">Import</span>
      <span class="onboarding-step-label active">Profile</span>
      <span class="onboarding-step-label">Ready</span>
    </div>
    <h3 class="onboarding-title">Set up your profile</h3>
    <p class="onboarding-subtitle">Sex and date of birth help us show the right reference ranges for your results.</p>
    <div class="onboarding-form">
      <div class="onboarding-field">
        <label class="onboarding-label">Sex</label>
        <div class="onboarding-sex-toggle">
          <button class="onboarding-sex-btn${state.profileSex === 'male' ? ' active' : ''}" onclick="completeOnboardingSex('male')">Male</button>
          <button class="onboarding-sex-btn${state.profileSex === 'female' ? ' active' : ''}" onclick="completeOnboardingSex('female')">Female</button>
        </div>
      </div>
      <div class="onboarding-field">
        <label class="onboarding-label">Date of Birth</label>
        <input type="date" class="onboarding-dob-input" id="onboarding-dob" value="${state.profileDob || ''}" />
      </div>
      <div class="onboarding-actions">
        <button class="onboarding-save-btn" onclick="completeOnboardingProfile()">Save & Continue</button>
        <button class="onboarding-skip-btn" onclick="dismissOnboarding()">Skip for now</button>
      </div>
    </div>
  </div>`;
}

export function completeOnboardingSex(sex) {
  document.querySelectorAll('.onboarding-sex-btn').forEach(b => b.classList.remove('active'));
  const btns = document.querySelectorAll('.onboarding-sex-btn');
  if (sex === 'male' && btns[0]) btns[0].classList.add('active');
  if (sex === 'female' && btns[1]) btns[1].classList.add('active');
}

export function completeOnboardingProfile() {
  const activeSexBtn = document.querySelector('.onboarding-sex-btn.active');
  const sex = activeSexBtn ? (activeSexBtn.textContent.trim().toLowerCase()) : null;
  const dobInput = document.getElementById('onboarding-dob');
  const dob = dobInput ? dobInput.value : null;
  localStorage.setItem(profileStorageKey(state.currentProfile, 'onboarded'), 'profile-set');
  if (sex) { state.profileSex = sex; setProfileSex(state.currentProfile, sex); }
  if (dob) { state.profileDob = dob; setProfileDob(state.currentProfile, dob); }
  const data = getActiveData();
  window.buildSidebar(data);
  updateHeaderDates(data);
  navigate('dashboard', data);
  showNotification("Profile set up — you're all set!", 'success');
}

export function dismissOnboarding() {
  localStorage.setItem(profileStorageKey(state.currentProfile, 'onboarded'), 'dismissed');
  const banner = document.getElementById('onboarding-banner');
  if (banner) {
    banner.style.transition = 'opacity 0.3s, transform 0.3s';
    banner.style.opacity = '0';
    banner.style.transform = 'translateY(-10px)';
    setTimeout(() => banner.remove(), 300);
  }
  showNotification('You can set sex and DOB anytime in Settings.', 'info');
}

// ═══════════════════════════════════════════════
// CATEGORY VIEWS
// ═══════════════════════════════════════════════

export function showCategory(categoryKey, preData) {
  // Ensure catalog is preloaded for sorting and rec links
  if (window.loadCatalog && !window._cachedCatalog) window.loadCatalog().then(c => { window._cachedCatalog = c; });
  const rawData = preData || getActiveData();
  const data = filterDatesByRange(rawData);
  const cat = data.categories[categoryKey];
  const main = document.getElementById("main-content");
  const allEntries = Object.entries(cat.markers).filter(([, m]) => !m.hidden);
  const withData = allEntries.filter(([, m]) => markerHasData(m));
  const countLabel = withData.length < allEntries.length ? `${withData.length} of ${allEntries.length} biomarkers with data` : `${allEntries.length} biomarkers tracked`;
  const renameBtn = ` <span class="ref-edited-badge" title="Rename category" onclick="event.stopPropagation();renameCategory('${categoryKey}')" style="cursor:pointer;font-size:12px">rename</span>`;
  const iconDisplay = cat.icon || '\uD83D\uDD16';
  let html = `<div class="category-header"><h2><span title="Click to change icon" style="cursor:pointer;min-width:24px;display:inline-block" onclick="event.stopPropagation();changeCategoryIcon('${categoryKey}')">${iconDisplay}</span> ${escapeHTML(cat.label)}${renameBtn}</h2>
    <p>${countLabel}</p></div>`;

  html += `<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:20px">`;
  html += `<div class="view-toggle" style="margin-bottom:0">
    <button class="view-btn active" onclick="switchView('charts','${categoryKey}',this)">Charts</button>
    <button class="view-btn" onclick="switchView('table','${categoryKey}',this)">Table</button>
    <button class="view-btn" onclick="switchView('heatmap','${categoryKey}',this)">Heatmap</button></div>`;
  html += renderDateRangeFilter();
  html += renderChartLayersDropdown();
  html += `</div>`;

  html += `<div id="view-content">`;
  if (withData.length === 0) {
    html += `<div class="empty-state"><div class="empty-state-icon">${cat.icon}</div>
      <h3>No Data Available</h3><p>Import lab results containing ${escapeHTML(cat.label.toLowerCase())} markers to see data here.</p></div>`;
  } else if (cat.singleDate) {
    html += renderFattyAcidsView(cat, categoryKey);
  } else {
    // Sort: markers with catalog slots first, then by status (out-of-range before normal)
    const catalog = window._cachedCatalog;
    const hasSlot = (k) => catalog?.slots?.[categoryKey + '.' + k] ? 0 : 1;
    const statusOrder = { high: 0, low: 0, normal: 1, missing: 2 };
    withData.sort(([ka, a], [kb, b]) => {
      const slotDiff = hasSlot(ka) - hasSlot(kb);
      if (slotDiff !== 0) return slotDiff;
      const ai = getLatestValueIndex(a.values), bi = getLatestValueIndex(b.values);
      const ar = ai !== -1 ? getEffectiveRangeForDate(a, ai) : { min: null, max: null };
      const br = bi !== -1 ? getEffectiveRangeForDate(b, bi) : { min: null, max: null };
      const as = ai !== -1 ? getStatus(a.values[ai], ar.min, ar.max) : 'missing';
      const bs = bi !== -1 ? getStatus(b.values[bi], br.min, br.max) : 'missing';
      return (statusOrder[as] ?? 2) - (statusOrder[bs] ?? 2);
    });
    html += `<div class="charts-grid">`;
    for (const [key, marker] of withData) {
      html += renderChartCard(categoryKey + "_" + key, marker, data.dateLabels);
    }
    html += `</div>`;
    // Show empty markers (no data yet) as clickable cards
    const noData = allEntries.filter(([, m]) => !markerHasData(m));
    if (noData.length > 0) {
      html += `<div style="margin-top:16px"><p style="color:var(--text-secondary);font-size:13px;margin-bottom:8px">No data yet</p><div style="display:flex;flex-wrap:wrap;gap:8px">`;
      for (const [key, marker] of noData) {
        const id = categoryKey + '_' + key;
        html += `<div class="chart-card" onclick="showDetailModal('${id}')" style="cursor:pointer;padding:12px 16px;min-height:auto;flex:0 0 auto">
          <span style="color:var(--text-secondary)">${escapeHTML(marker.name)}</span>
          <span style="color:var(--text-muted);font-size:11px;margin-left:6px">+ add value</span></div>`;
      }
      html += `</div></div>`;
    }
  }
  html += `</div>`;
  main.innerHTML = html;

  if (withData.length === 0) { /* no charts to render */ }
  else if (cat.singleDate) { renderFattyAcidsCharts(cat); }
  else {
    for (const [key, marker] of withData) {
      createLineChart(categoryKey + "_" + key, marker, data.dateLabels, data.dates, data.phaseLabels);
    }
  }
  loadChartCardRecs();
}

export async function renameCategory(categoryKey) {
  const data = getActiveData();
  const cat = data.categories[categoryKey];
  if (!cat) return;
  const currentLabel = cat.label;
  const newLabel = await window.showPromptDialog('Rename category:', {
    defaultValue: currentLabel,
    okLabel: 'Rename',
  });
  if (!newLabel || newLabel === currentLabel) return;
  const trimmed = newLabel.trim();
  // Store label override
  if (!state.importedData.categoryLabels) state.importedData.categoryLabels = {};
  state.importedData.categoryLabels[categoryKey] = trimmed;
  // Also update custom marker defs so sidebar picks it up
  const cms = state.importedData.customMarkers || {};
  for (const [k, def] of Object.entries(cms)) {
    if (k.startsWith(categoryKey + '.')) def.categoryLabel = trimmed;
  }
  saveImportedData();
  window.buildSidebar();
  navigate(categoryKey);
  showNotification(`Category renamed to "${trimmed}"`, 'info');
}

export async function renameMarker(id) {
  const data = getActiveData();
  const idx = id.indexOf('_');
  const catKey = id.slice(0, idx), mKey = id.slice(idx + 1);
  const marker = data.categories[catKey]?.markers[mKey];
  if (!marker) return;
  const newName = await window.showPromptDialog('Rename marker:', {
    defaultValue: marker.name,
    okLabel: 'Rename',
  });
  if (!newName || newName === marker.name) return;
  const trimmed = newName.trim();
  const dotKey = catKey + '.' + mKey;
  if (!state.importedData.markerLabels) state.importedData.markerLabels = {};
  state.importedData.markerLabels[dotKey] = trimmed;
  saveImportedData();
  showDetailModal(id);
  showNotification(`Marker renamed to "${trimmed}"`, 'info');
}

export function revertMarkerName(id) {
  const idx = id.indexOf('_');
  const dotKey = id.slice(0, idx) + '.' + id.slice(idx + 1);
  if (!state.importedData.markerLabels?.[dotKey]) return;
  delete state.importedData.markerLabels[dotKey];
  if (Object.keys(state.importedData.markerLabels).length === 0) delete state.importedData.markerLabels;
  saveImportedData();
  showDetailModal(id);
  showNotification('Marker name reverted', 'info');
}

const EMOJI_CATEGORIES = [
  { id: 'science', icon: '\uD83E\uDDEA', label: 'Science & Medical', emojis: ['\uD83E\uDDEA','\uD83E\uDDEC','\uD83E\uDD2C','\uD83D\uDD2C','\u2697\uFE0F','\uD83D\uDC89','\uD83D\uDC8A','\u2695\uFE0F','\uD83E\uDE7A','\uD83E\uDDB7','\uD83E\uDDB4','\uD83E\uDDE0','\uD83E\uDEC0','\uD83E\uDEC1','\uD83D\uDD2D','\uD83E\uDDA0','\uD83E\uDE78','\uD83E\uDDEB'] },
  { id: 'body', icon: '\uD83D\uDCAA', label: 'Body & Lifestyle', emojis: ['\uD83D\uDCAA','\uD83D\uDC41\uFE0F','\uD83D\uDC42','\uD83D\uDC45','\u2764\uFE0F','\uD83E\uDDE1','\uD83E\uDD71','\uD83D\uDE34','\uD83C\uDFC3','\uD83E\uDDD8','\uD83C\uDFCB\uFE0F','\uD83D\uDEB4','\uD83C\uDFCA','\uD83D\uDE4F','\uD83E\uDDCD','\uD83E\uDEC2'] },
  { id: 'food', icon: '\uD83C\uDF4E', label: 'Food & Nutrition', emojis: ['\uD83C\uDF4E','\uD83C\uDF4A','\uD83C\uDF4B','\uD83C\uDF47','\uD83E\uDD51','\uD83E\uDD66','\uD83C\uDF45','\uD83E\uDD55','\uD83E\uDD6C','\uD83C\uDF57','\uD83E\uDD5A','\uD83D\uDC1F','\uD83E\uDD5B','\uD83E\uDD57','\u2615','\uD83C\uDF75','\uD83E\uDD64','\uD83D\uDCA7'] },
  { id: 'nature', icon: '\uD83C\uDF3F', label: 'Nature & Environment', emojis: ['\uD83C\uDF3F','\uD83C\uDF31','\uD83C\uDF3B','\uD83C\uDF3E','\uD83C\uDF43','\uD83C\uDF40','\u2600\uFE0F','\uD83C\uDF19','\u2B50','\uD83D\uDD25','\uD83C\uDF0A','\u26A1','\uD83C\uDF08','\u2744\uFE0F','\uD83C\uDF0D','\uD83D\uDCA8','\uD83C\uDF32','\uD83E\uDEB5'] },
  { id: 'symbols', icon: '\uD83D\uDD36', label: 'Symbols & Colors', emojis: ['\uD83D\uDD36','\uD83D\uDD35','\uD83D\uDFE2','\uD83D\uDFE1','\uD83D\uDFE3','\uD83D\uDD34','\u26AA','\u26AB','\uD83D\uDFE0','\uD83D\uDFE4','\u2728','\uD83D\uDCAB','\u267B\uFE0F','\u269B\uFE0F','\u2699\uFE0F','\u267E\uFE0F','\u2B55','\uD83D\uDD16'] },
];

function showEmojiPicker(anchorEl, callback, opts = {}) {
  // Remove existing picker
  document.querySelector('.emoji-picker')?.remove();
  const picker = document.createElement('div');
  picker.className = 'emoji-picker';

  // Position near anchor
  const rect = anchorEl.getBoundingClientRect();
  picker.style.left = Math.min(rect.left, window.innerWidth - 340) + 'px';
  picker.style.top = Math.min(rect.bottom + 4, window.innerHeight - 420) + 'px';

  let activeCat = null;
  let searchTerm = '';

  function render() {
    let html = `<div class="emoji-picker-search"><input type="text" placeholder="Search emoji..." value="${escapeHTML(searchTerm)}"></div>`;
    html += `<div class="emoji-picker-cats">`;
    if (opts.showReset) {
      html += `<button data-cat="__reset" title="Reset to default" style="font-size:12px;font-family:inherit">\u00d7</button>`;
    }
    for (const cat of EMOJI_CATEGORIES) {
      html += `<button data-cat="${cat.id}" title="${cat.label}" class="${activeCat === cat.id ? 'active' : ''}">${cat.icon}</button>`;
    }
    html += `</div><div class="emoji-picker-grid">`;

    const items = [];
    for (const cat of EMOJI_CATEGORIES) {
      if (activeCat && activeCat !== cat.id) continue;
      if (searchTerm && !cat.label.toLowerCase().includes(searchTerm.toLowerCase())) continue;
      items.push(`<div class="emoji-picker-label">${cat.label}</div>`);
      for (const e of cat.emojis) {
        items.push(`<span data-emoji="${e}">${e}</span>`);
      }
    }
    if (items.length === 0) items.push(`<div class="emoji-picker-label">No results</div>`);
    html += items.join('') + `</div>`;
    picker.innerHTML = html;

    // Bind events
    const input = picker.querySelector('input');
    input.addEventListener('input', e => { searchTerm = e.target.value; activeCat = null; render(); const el = picker.querySelector('input'); el.focus(); el.setSelectionRange(searchTerm.length, searchTerm.length); });
    picker.querySelectorAll('.emoji-picker-cats button').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.dataset.cat === '__reset') { callback(null); picker.remove(); cleanup(); return; }
        activeCat = activeCat === btn.dataset.cat ? null : btn.dataset.cat; searchTerm = ''; render();
      });
    });
    picker.querySelectorAll('.emoji-picker-grid span[data-emoji]').forEach(span => {
      span.addEventListener('click', () => { callback(span.dataset.emoji); picker.remove(); cleanup(); });
    });
  }

  render();
  document.body.appendChild(picker);
  setTimeout(() => picker.querySelector('input')?.focus(), 50);

  // Close on outside click
  function onClickOutside(e) { if (!picker.contains(e.target) && e.target !== anchorEl) { picker.remove(); cleanup(); } }
  function onEsc(e) { if (e.key === 'Escape') { picker.remove(); cleanup(); } }
  function cleanup() { document.removeEventListener('mousedown', onClickOutside); document.removeEventListener('keydown', onEsc); }
  setTimeout(() => { document.addEventListener('mousedown', onClickOutside); document.addEventListener('keydown', onEsc); }, 10);
}

export function changeCategoryIcon(categoryKey) {
  const data = getActiveData();
  const cat = data.categories[categoryKey];
  if (!cat) return;
  const anchor = event?.target || document.querySelector('.category-header h2 span');
  const hasOverride = categoryKey in (state.importedData?.categoryIcons || {});
  showEmojiPicker(anchor, (emoji) => {
    if (emoji === null) {
      // Reset to default
      if (state.importedData.categoryIcons) delete state.importedData.categoryIcons[categoryKey];
    } else {
      if (!state.importedData.categoryIcons) state.importedData.categoryIcons = {};
      state.importedData.categoryIcons[categoryKey] = emoji;
    }
    const cms = state.importedData.customMarkers || {};
    for (const [k, def] of Object.entries(cms)) {
      if (k.startsWith(categoryKey + '.')) {
        if (emoji === null) delete def.icon;
        else def.icon = emoji;
      }
    }
    saveImportedData();
    window.buildSidebar();
    navigate(categoryKey);
    showNotification(emoji === null ? 'Icon reset to default' : 'Icon updated', 'info');
  }, { showReset: !!hasOverride });
}

export function switchView(view, categoryKey, btn) {
  document.querySelectorAll(".view-btn").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  destroyAllCharts();
  const rawData = getActiveData();
  const data = filterDatesByRange(rawData);
  const cat = data.categories[categoryKey];
  const container = document.getElementById("view-content");
  if (view === "table") {
    container.innerHTML = renderTableView(cat, data.dateLabels, categoryKey);
  } else if (view === "heatmap") {
    container.innerHTML = renderHeatmapView(cat, data.dateLabels, data.dates, categoryKey);
  } else {
    if (cat.singleDate) {
      container.innerHTML = renderFattyAcidsView(cat, categoryKey);
      renderFattyAcidsCharts(cat);
    } else {
      const withData = Object.entries(cat.markers).filter(([, m]) => markerHasData(m));
      let html = `<div class="charts-grid">`;
      for (const [key, marker] of withData) {
        html += renderChartCard(categoryKey + "_" + key, marker, data.dateLabels);
      }
      html += `</div>`;
      container.innerHTML = html;
      for (const [key, marker] of withData) {
        createLineChart(categoryKey + "_" + key, marker, data.dateLabels, data.dates, data.phaseLabels);
      }
    }
  }
}

export function renderChartCard(id, marker, dateLabels) {
  state.markerRegistry[id] = marker;
  const latestIdx = getLatestValueIndex(marker.values);
  const latestVal = latestIdx !== -1 ? marker.values[latestIdx] : null;
  const lr = getEffectiveRangeForDate(marker, latestIdx);
  const status = latestVal !== null ? getStatus(latestVal, lr.min, lr.max) : "missing";
  const statusLabel = status === "normal" ? "Normal" : status === "high" ? "High" : status === "low" ? "Low" : "N/A";
  const sIcon = statusIcon(status);

  const trend = getTrend(marker.values, lr.min, lr.max);
  const trendBadge = trend.cls !== 'trend-stable' || trend.arrow !== '\u2014' ? `<span class="chart-card-trend ${trend.cls}">${trend.arrow}</span>` : '';

  let html = `<div class="chart-card" onclick="showDetailModal('${id}')">
    <div class="chart-card-header"><div>
      <div class="chart-card-title">${escapeHTML(marker.name)} <span id="chart-rec-${id}"></span></div>
      <div class="chart-card-unit">${escapeHTML(marker.unit)}</div></div>
      <div><span class="chart-card-status status-${status}">${sIcon ? sIcon + ' ' : ''}${statusLabel}</span>${trendBadge}</div></div>
    <div class="chart-container"><canvas id="chart-${id}"></canvas></div>
    <div class="chart-values">`;
  const labels = marker.singlePoint ? [marker.singleDateLabel || "N/A"] : dateLabels;
  // Trim leading/trailing nulls to match chart trimming
  let valStart = 0, valEnd = marker.values.length - 1;
  if (!marker.singlePoint && marker.values.length > 1) {
    valStart = marker.values.findIndex(v => v !== null);
    if (valStart < 0) valStart = 0;
    while (valEnd > valStart && marker.values[valEnd] === null) valEnd--;
  }
  for (let i = valStart; i <= valEnd; i++) {
    const v = marker.values[i];
    const ri = getEffectiveRangeForDate(marker, i);
    const s = v !== null ? getStatus(v, ri.min, ri.max) : "missing";
    html += `<div class="chart-value-item"><div class="chart-value-date">${labels[i] || ''}</div>
      <div class="chart-value-num val-${s}">${v !== null ? formatValue(v) : "\u2014"}</div></div>`;
  }
  let rangeHtml = '';
  const fmtRange = (min, max) => `${min != null ? formatValue(min) : '–'} \u2013 ${max != null ? formatValue(max) : '–'}`;
  if (state.rangeMode === 'both' && (marker.optimalMin != null || marker.optimalMax != null) && (marker.refMin != null || marker.refMax != null)) {
    rangeHtml = `<div class="chart-ref-range">Ref: ${fmtRange(marker.refMin, marker.refMax)} · <span style="color:var(--green)">Optimal: ${fmtRange(marker.optimalMin, marker.optimalMax)}</span> ${escapeHTML(marker.unit)}</div>`;
  } else {
    const r = getEffectiveRange(marker);
    const rangeLabel = state.rangeMode === 'optimal' && (marker.optimalMin != null || marker.optimalMax != null) ? 'Optimal' : 'Reference';
    rangeHtml = r.min != null || r.max != null ? `<div class="chart-ref-range">${rangeLabel}: ${fmtRange(r.min, r.max)} ${escapeHTML(marker.unit)}</div>` : '';
  }
  html += `</div>${rangeHtml}</div>`;
  return html;
}

export function renderTableView(cat, dateLabels, categoryKey) {
  const labels = cat.singleDate ? [cat.singleDateLabel || "N/A"] : dateLabels;
  let html = `<div class="data-table-wrapper"><table class="data-table"><thead><tr>
    <th>Biomarker</th><th>Unit</th><th>Reference</th>`;
  for (const d of labels) html += `<th>${d}</th>`;
  html += `<th>Trend</th><th>Range</th></tr></thead><tbody>`;
  for (const [key, marker] of Object.entries(cat.markers)) {
    const id = categoryKey ? categoryKey + '_' + key : '';
    const r = getEffectiveRange(marker);
    let refCell = r.min != null && r.max != null ? `${formatValue(r.min)} \u2013 ${formatValue(r.max)}` : '\u2014';
    if (state.rangeMode === 'both') {
      if (marker.optimalMin != null || marker.optimalMax != null) refCell = `${formatValue(marker.refMin)} \u2013 ${formatValue(marker.refMax)}<br><span style="color:var(--green);font-size:11px">opt: ${formatValue(marker.optimalMin)} \u2013 ${formatValue(marker.optimalMax)}</span>`;
    }
    const rowClick = id ? ` onclick="showDetailModal('${id}')" style="cursor:pointer"` : '';
    html += `<tr${rowClick}><td class="marker-name">${escapeHTML(marker.name)}</td>
      <td class="unit-col">${escapeHTML(marker.unit)}</td>
      <td class="ref-col">${refCell}</td>`;
    for (let i = 0; i < marker.values.length; i++) {
      const v = marker.values[i];
      const ri = getEffectiveRangeForDate(marker, i);
      const s = v !== null ? getStatus(v, ri.min, ri.max) : "missing";
      html += `<td class="value-cell val-${s}">${v !== null ? formatValue(v) : "\u2014"}</td>`;
    }
    const li = getLatestValueIndex(marker.values);
    const trendRange = li !== -1 ? getEffectiveRangeForDate(marker, li) : r;
    const trend = getTrend(marker.values, trendRange.min, trendRange.max);
    html += `<td><span class="trend-arrow ${trend.cls}">${trend.arrow}</span></td>`;
    if (li !== -1 && r.min != null && r.max != null) {
      const lr = getEffectiveRangeForDate(marker, li);
      const pos = Math.max(0, Math.min(100, getRangePosition(marker.values[li], lr.min, lr.max)));
      const s = getStatus(marker.values[li], lr.min, lr.max);
      html += `<td><div class="range-bar"><div class="range-bar-fill" style="left:0;width:100%"></div>
        <div class="range-bar-marker marker-${s}" style="left:${pos}%"></div></div></td>`;
    } else html += `<td>\u2014</td>`;
    html += `</tr>`;
  }
  html += `</tbody></table></div>`;
  return html;
}

export function renderHeatmapView(cat, dateLabels, dates, categoryKey) {
  const labels = cat.singleDate ? [cat.singleDateLabel || "N/A"] : dateLabels;
  let html = `<div class="heatmap-wrapper"><table class="heatmap-table"><thead><tr><th>Biomarker</th>`;
  for (const d of labels) html += `<th>${d}</th>`;
  html += `</tr></thead><tbody>`;
  for (const [key, marker] of Object.entries(cat.markers)) {
    const id = categoryKey + "_" + key;
    state.markerRegistry[id] = marker;
    html += `<tr><td style="cursor:pointer" onclick="showDetailModal('${id}')">${escapeHTML(marker.name)}</td>`;
    for (let i = 0; i < marker.values.length; i++) {
      const v = marker.values[i];
      const ri = getEffectiveRangeForDate(marker, i);
      const s = v !== null ? getStatus(v, ri.min, ri.max) : "missing";
      html += `<td class="heatmap-${s}" onclick="showDetailModal('${id}')">${v !== null ? formatValue(v) : "\u2014"}</td>`;
    }
    html += `</tr>`;
  }
  html += `</tbody></table></div>`;
  return html;
}

export function renderFattyAcidsView(cat, categoryKey) {
  let html = `<div style="background:var(--bg-card);border-radius:var(--radius);padding:20px;margin-bottom:20px;border:1px solid var(--border)">
    <h3 style="margin-bottom:16px;font-size:16px">Fatty Acid Profile${cat.singleDate ? ' \u2014 ' + new Date(cat.singleDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : ''}</h3>
    <div class="fa-bar-chart-container"><canvas id="chart-fa-bar"></canvas></div></div>`;
  html += `<div class="fatty-acids-grid">`;
  for (const [key, marker] of Object.entries(cat.markers)) {
    const r = getEffectiveRange(marker);
    const v = marker.values[0], s = getStatus(v, r.min, r.max);
    const pos = Math.max(0, Math.min(100, getRangePosition(v, r.min, r.max)));
    let faRangeText;
    if (state.rangeMode === 'both' && (marker.optimalMin != null || marker.optimalMax != null) && (marker.refMin != null || marker.refMax != null)) {
      faRangeText = `Ref: ${formatValue(marker.refMin)} \u2013 ${formatValue(marker.refMax)} · <span style="color:var(--green)">Opt: ${formatValue(marker.optimalMin)} \u2013 ${formatValue(marker.optimalMax)}</span>`;
    } else {
      const rangeLabel = state.rangeMode === 'optimal' && (marker.optimalMin != null || marker.optimalMax != null) ? 'Optimal' : 'Ref';
      faRangeText = `${rangeLabel}: ${formatValue(r.min)} \u2013 ${formatValue(r.max)}`;
    }
    html += `<div class="fa-card" onclick="showDetailModal('${categoryKey}_${key}')" style="cursor:pointer"><div class="fa-card-name">${escapeHTML(marker.name)}</div>
      <div class="fa-card-value val-${s}">${formatValue(v)}${marker.unit ? " " + escapeHTML(marker.unit) : ""}</div>
      <div class="fa-card-ref">${faRangeText}</div>
      <div class="range-bar" style="margin-top:8px;width:100%"><div class="range-bar-fill" style="left:0;width:100%"></div>
      <div class="range-bar-marker marker-${s}" style="left:${pos}%"></div></div></div>`;
  }
  html += `</div>`;
  return html;
}

export function renderFattyAcidsCharts(cat) {
  const tc = getChartColors();
  const names=[], vals=[], mins=[], maxs=[], bgC=[], brC=[];
  for (const m of Object.values(cat.markers)) {
    const r = getEffectiveRange(m);
    names.push(m.name.replace(/\(.+\)/,"").trim());
    vals.push(m.values[0]); mins.push(r.min); maxs.push(r.max);
    const s = getStatus(m.values[0], r.min, r.max);
    bgC.push(s==="normal"?tc.green+"99":s==="high"?tc.red+"99":tc.yellow+"99");
    brC.push(s==="normal"?tc.green:s==="high"?tc.red:tc.yellow);
  }
  const ctx = document.getElementById("chart-fa-bar");
  if (!ctx) return;
  state.chartInstances["fa-bar"] = new Chart(ctx, {
    type: "bar",
    data: { labels: names, datasets: [
      { label:"Value", data:vals, backgroundColor:bgC, borderColor:brC, borderWidth:1, borderRadius:4 },
      { label:"Ref Min", data:mins, type:"line", borderColor:tc.lineColor+"80", borderDash:[4,4], pointRadius:0, fill:false, borderWidth:1.5 },
      { label:"Ref Max", data:maxs, type:"line", borderColor:tc.lineColor+"80", borderDash:[4,4], pointRadius:0, fill:false, borderWidth:1.5 }
    ]},
    options: { responsive:true, maintainAspectRatio:false,
      plugins: { legend:{display:false}, tooltip:{ backgroundColor:tc.tooltipBg, titleColor:tc.tooltipTitle, bodyColor:tc.tooltipBody, borderColor:tc.tooltipBorder, borderWidth:1 }},
      scales: { x:{ticks:{color:tc.tickColor,font:{size:10},maxRotation:45},grid:{display:false}}, y:{ticks:{color:tc.tickColor},grid:{color:tc.gridColor}} }
    }
  });
}

// ═══════════════════════════════════════════════
// DETAIL MODAL & MANUAL ENTRY
// ═══════════════════════════════════════════════

export async function fetchCustomMarkerDescription(markerId, markerName, unit) {
  const cacheKey = 'labcharts-marker-desc';
  const cache = JSON.parse(localStorage.getItem(cacheKey) || '{}');
  if (cache[markerId]) return cache[markerId];
  if (!hasAIProvider()) return null;
  try {
    const descResult = await callClaudeAPI({
      system: 'You are a concise medical reference. Reply with exactly one sentence (max 30 words) explaining what this blood biomarker measures and why it matters clinically. No preamble.',
      messages: [{ role: 'user', content: `${markerName} (${unit})` }],
      maxTokens: 100
    });
    if (descResult && descResult.usage) {
      trackUsage(getAIProvider(), getActiveModelId(), descResult.usage.inputTokens || 0, descResult.usage.outputTokens || 0);
    }
    const resp = (descResult && descResult.text) || '';
    const text = resp.trim();
    if (text) {
      cache[markerId] = text;
      localStorage.setItem(cacheKey, JSON.stringify(cache));
    }
    return text || null;
  } catch { return null; }
}

export function showDetailModal(id, opts = {}) {
  const data = getActiveData();
  const idx = id.indexOf('_');
  const catKey = id.slice(0, idx), mKey = id.slice(idx + 1);
  let marker = data.categories[catKey]?.markers[mKey];
  if (marker) state.markerRegistry[id] = marker;
  if (!marker) return;
  rememberModalTrigger();
  const modal = document.getElementById("detail-modal");
  const overlay = document.getElementById("modal-overlay");
  const dates = marker.singlePoint ? [marker.singleDateLabel || "N/A"] : data.dateLabels;
  const r = getEffectiveRange(marker);
  const dotKey = id.replace('_', '.');
  let rangeInfo = '';
  const overrides = state.importedData?.refOverrides?.[dotKey] || {};
  const refEditable = (label, min, max, type) => {
    const isEdited = type === 'optimal' ? ('optimalMin' in overrides || 'optimalMax' in overrides) : ('refMin' in overrides || 'refMax' in overrides);
    const source = type === 'optimal' ? overrides.optimalSource : overrides.refSource;
    const badgeLabel = source === 'manual' ? 'edited' : 'lab';
    const hasLabStash = type === 'optimal' ? 'labOptimalMin' in overrides : 'labRefMin' in overrides;
    const badgeTitle = source === 'manual' ? (hasLabStash ? 'Manually edited — click to revert to lab range' : 'Manually edited — click to revert to default') : 'Custom range from your lab — click to revert to default';
    const editedBadge = isEdited ? ` <span class="ref-edited-badge" title="${badgeTitle}" onclick="event.stopPropagation();revertRefRange('${id}','${type}')">${badgeLabel} \u00d7</span>` : '';
    const displayMin = min != null ? min : '–';
    const displayMax = max != null ? max : '–';
    return ` &middot; ${type === 'optimal' ? '<span style="color:var(--green)">' : ''}${label}: <span class="ref-editable" onclick="editRefRange('${id}','${type}',event)" title="Click to edit">${displayMin} \u2013 ${displayMax}</span>${editedBadge}${type === 'optimal' ? '</span>' : ''}`;
  };
  const isCustom = !!state.importedData?.customMarkers?.[dotKey];
  const hasRef = marker.refMin != null || marker.refMax != null;
  const hasOpt = marker.optimalMin != null || marker.optimalMax != null;
  if (state.rangeMode === 'both') {
    if (hasRef) rangeInfo += refEditable('Reference', marker.refMin, marker.refMax, 'ref');
    else if (isCustom) rangeInfo += refEditable('Reference', '–', '–', 'ref');
    if (hasOpt) rangeInfo += refEditable('Optimal', marker.optimalMin, marker.optimalMax, 'optimal');
    else if (isCustom) rangeInfo += refEditable('Optimal', '–', '–', 'optimal');
  } else if (state.rangeMode === 'optimal') {
    if (hasOpt) rangeInfo = refEditable('Optimal', marker.optimalMin, marker.optimalMax, 'optimal');
    else if (isCustom) rangeInfo = refEditable('Optimal', '–', '–', 'optimal');
  } else if (hasRef) {
    rangeInfo = refEditable('Reference', marker.refMin, marker.refMax, 'ref');
  } else if (isCustom) {
    rangeInfo = refEditable('Reference', '–', '–', 'ref');
  }
  const isRenamed = !!state.importedData?.markerLabels?.[dotKey];
  const renameLink = isRenamed
    ? ` <span class="ref-edited-badge" title="Renamed — click to revert to original" onclick="event.stopPropagation();revertMarkerName('${id}')" style="cursor:pointer">renamed ×</span> <span class="ref-edited-badge" title="Rename marker" onclick="event.stopPropagation();renameMarker('${id}')" style="cursor:pointer;font-size:12px">rename</span>`
    : ` <span class="ref-edited-badge" title="Rename marker" onclick="event.stopPropagation();renameMarker('${id}')" style="cursor:pointer;font-size:12px">rename</span>`;
  let html = `<button class="modal-close" onclick="closeModal()">&times;</button>
    <h3>${escapeHTML(marker.name)}${renameLink}</h3>
    <div class="modal-unit">${escapeHTML(marker.unit)}${rangeInfo}</div>
    <div class="marker-description" id="marker-desc"></div>
    <div class="modal-chart"><canvas id="chart-modal"></canvas></div>
    <div class="modal-values-grid">`;
  for (let i = 0; i < marker.values.length; i++) {
    const v = marker.values[i];
    if (v === null) continue;
    const ri = getEffectiveRangeForDate(marker, i);
    const s = getStatus(v, ri.min, ri.max);
    const sl = s==="normal"?"\u2713 In Range":s==="high"?"\u25B2 Above Range":s==="low"?"\u25BC Below Range":"Unknown";
    const phaseLabel = marker.phaseLabels && marker.phaseLabels[i];
    const phaseInfo = phaseLabel ? `<div class="mv-phase">${phaseLabel} \u2022 ${formatValue(ri.min)}\u2013${formatValue(ri.max)}</div>` : '';
    const rawDate = marker.singlePoint ? null : data.dates[i];
    const matchingNote = rawDate && state.importedData.notes ? state.importedData.notes.find(n => n.date === rawDate) : null;
    const noteIcon = matchingNote ? `<div class="mv-note" onclick="event.stopPropagation();this.parentElement.parentElement.querySelector('.mv-note-text').classList.toggle('show')">&#128221;</div><div class="mv-note-text">${escapeHTML(matchingNote.text)}</div>` : '';
    const mvKey = dotKey + ':' + rawDate;
    const manualVal = rawDate && state.importedData.manualValues && state.importedData.manualValues[mvKey];
    const isManual = manualVal !== undefined && manualVal !== null;
    const canRevert = isManual && manualVal !== true;
    const manualBadge = canRevert
      ? ` <span class="ref-edited-badge" title="Edited — click to revert" onclick="event.stopPropagation();revertMarkerValue('${id}','${rawDate}')">edited \u00d7</span>`
      : isManual ? ' <span class="ref-edited-badge" title="Manually entered">manual</span>' : '';
    const deleteBtn = `<button class="mv-delete" onclick="event.stopPropagation();deleteMarkerValue('${id}','${rawDate}')" title="Remove this value">&times;</button>`;
    const editClick = rawDate ? ` onclick="event.stopPropagation();editMarkerValue('${id}','${rawDate}',${v},event)" title="Click to edit" style="cursor:pointer"` : '';
    // Provenance: which file imported this value
    let sourceHtml = '';
    if (rawDate) {
      const srcEntry = state.importedData.entries?.find(e => e.date === rawDate);
      const src = srcEntry?.markerSources?.[dotKey];
      if (src) {
        const fname = src.file;
        if (fname) {
          const display = fname.length > 30 ? fname.slice(0, 27) + '...' : fname;
          sourceHtml = `<div class="mv-source" title="${escapeHTML(fname)}">${escapeHTML(display)}</div>`;
        } else {
          sourceHtml = `<div class="mv-source mv-source-manual">manual entry</div>`;
        }
      } else if (srcEntry?.sourceFile) {
        const fname = srcEntry.sourceFile;
        const display = fname.length > 30 ? fname.slice(0, 27) + '...' : fname;
        sourceHtml = `<div class="mv-source" title="${escapeHTML(fname)}">${escapeHTML(display)}</div>`;
      }
    }
    html += `<div class="modal-value-card status-${s}">${deleteBtn}<div class="mv-date">${dates[i]}${noteIcon}</div>${sourceHtml}
      <div class="mv-value val-${s}"${editClick}>${formatValue(v)}${manualBadge}</div>
      <div class="mv-status val-${s}">${sl}</div>${phaseInfo}</div>`;
  }
  html += `</div>`;
  const nonNull = marker.values.map((v,i)=>({v,i})).filter(x=>x.v!==null);
  if (nonNull.length >= 2) {
    const f = nonNull[0], l = nonNull[nonNull.length-1];
    const ch = l.v - f.v, pct = ((ch/f.v)*100).toFixed(1);
    const dir = ch > 0 ? "increased" : ch < 0 ? "decreased" : "unchanged";
    html += `<div class="modal-ref-info"><strong>Trend:</strong> ${dir} by ${Math.abs(ch).toFixed(2)} ${escapeHTML(marker.unit)} (${ch>0?"+":""}${pct}%) from ${dates[f.i]} to ${dates[l.i]}</div>`;
  }
  // Calculated marker input diagnostic — show missing inputs
  const calcInputs = {
    'calculatedRatios_phenoAge': [
      ['proteins', 'albumin', 'Albumin'], ['biochemistry', 'creatinine', 'Creatinine'],
      ['biochemistry', 'glucose', 'Glucose'], ['proteins', 'hsCRP', 'CRP'],
      ['differential', 'lymphocytesPct', 'Lymphocytes %'], ['hematology', 'mcv', 'MCV'],
      ['hematology', 'rdwcv', 'RDW-CV'], ['biochemistry', 'alp', 'ALP'], ['hematology', 'wbc', 'WBC']
    ],
    'calculatedRatios_bortzAge': [
      ['proteins', 'albumin', 'Albumin'], ['biochemistry', 'alp', 'ALP'],
      ['biochemistry', 'urea', 'Urea'], ['lipids', 'cholesterol', 'Cholesterol'],
      ['biochemistry', 'creatinine', 'Creatinine'], ['biochemistry', 'cystatinC', 'Cystatin C'],
      ['diabetes', 'hba1c', 'HbA1c'], ['proteins', 'hsCRP', 'CRP'],
      ['biochemistry', 'ggt', 'GGT'], ['hematology', 'rbc', 'RBC'],
      ['hematology', 'mcv', 'MCV'], ['hematology', 'rdwcv', 'RDW-CV'],
      ['differential', 'monocytes', 'Monocytes'], ['differential', 'neutrophils', 'Neutrophils'],
      ['differential', 'lymphocytesPct', 'Lymphocytes %'], ['biochemistry', 'alt', 'ALT'],
      ['hormones', 'shbg', 'SHBG'], ['vitamins', 'vitaminD', 'Vitamin D'],
      ['biochemistry', 'glucose', 'Glucose'], ['hematology', 'mch', 'MCH'],
      ['lipids', 'apoAI', 'ApoA-I']
    ],
    'calculatedRatios_biologicalAge': [],
    'calculatedRatios_bunCreatRatio': [
      ['biochemistry', 'urea', 'Urea (BUN)'], ['biochemistry', 'creatinine', 'Creatinine']
    ],
    'calculatedRatios_freeWaterDeficit': [['electrolytes', 'sodium', 'Sodium']],
    'calculatedRatios_tgHdlRatio': [['lipids', 'triglycerides', 'Triglycerides'], ['lipids', 'hdl', 'HDL']],
    'calculatedRatios_ldlHdlRatio': [['lipids', 'ldl', 'LDL'], ['lipids', 'hdl', 'HDL']],
    'calculatedRatios_nlr': [['differential', 'neutrophils', 'Neutrophils'], ['differential', 'lymphocytes', 'Lymphocytes']],
    'calculatedRatios_plr': [['hematology', 'platelets', 'Platelets'], ['differential', 'lymphocytes', 'Lymphocytes']],
    'calculatedRatios_deRitisRatio': [['biochemistry', 'ast', 'AST'], ['biochemistry', 'alt', 'ALT']],
    'calculatedRatios_copperZincRatio': [['electrolytes', 'copper', 'Copper'], ['electrolytes', 'zinc', 'Zinc']],
    'calculatedRatios_apoBapoAIRatio': [['lipids', 'apoB', 'ApoB'], ['lipids', 'apoAI', 'ApoA-I']],
    'calculatedRatios_crpHdlRatio': [['proteins', 'hsCRP', 'CRP'], ['lipids', 'hdl', 'HDL']],
  };
  const inputs = calcInputs[id];
  if (inputs) {
    const issues = [];
    // Check for completely missing markers
    const missing = inputs.filter(([cat, key]) => {
      const vals = data.categories[cat]?.markers[key]?.values;
      return !vals || vals.every(v => v == null);
    });
    if ((id === 'calculatedRatios_phenoAge' || id === 'calculatedRatios_bortzAge' || id === 'calculatedRatios_biologicalAge') && !state.profileDob) {
      issues.push('Date of birth not set (required for age at blood draw)');
    }
    if (missing.length > 0) {
      issues.push(`Missing: ${missing.map(m => m[2]).join(', ')}`);
    }
    // Biological age clocks: per-date gap check, CRP fallback, unit sanity
    const _isBioAgeClock = id === 'calculatedRatios_phenoAge' || id === 'calculatedRatios_bortzAge';
    if (_isBioAgeClock && state.profileDob) {
      // For CRP check: accept either hs-CRP or standard CRP
      const _hasCRPonDate = (idx) => {
        const hs = data.categories.proteins?.markers.hsCRP?.values?.[idx];
        const std = data.categories.proteins?.markers.crp?.values?.[idx];
        return hs != null || std != null;
      };
      // Override the missing check for CRP — it's satisfied by either marker
      const crpInInputs = inputs.some(([, key]) => key === 'hsCRP');
      if (crpInInputs && missing.some(([, key]) => key === 'hsCRP')) {
        const hasAnyCRP = data.categories.proteins?.markers.hsCRP?.values?.some(v => v != null)
          || data.categories.proteins?.markers.crp?.values?.some(v => v != null);
        if (hasAnyCRP) {
          // Remove CRP from missing list — it's covered by the fallback
          const idx = missing.findIndex(([, key]) => key === 'hsCRP');
          if (idx >= 0) missing.splice(idx, 1);
          // Re-generate missing message
          if (missing.length > 0) {
            const mi = issues.findIndex(s => s.startsWith('Missing:'));
            if (mi >= 0) issues[mi] = `Missing: ${missing.map(m => m[2]).join(', ')}`;
          } else {
            const mi = issues.findIndex(s => s.startsWith('Missing:'));
            if (mi >= 0) issues.splice(mi, 1);
          }
        }
      }
      if (missing.length === 0) {
        const latestIdx = data.dates.length - 1;
        if (latestIdx >= 0) {
          const nullAt = inputs.filter(([cat, key]) => {
            if (key === 'hsCRP') return !_hasCRPonDate(latestIdx);
            const v = data.categories[cat]?.markers[key]?.values?.[latestIdx];
            return v == null;
          });
          if (nullAt.length > 0) {
            issues.push(`Missing on latest date (${data.dateLabels[latestIdx]}): ${nullAt.map(m => m[2]).join(', ')}`);
          }
          // CRP value sanity
          const crpVal = data.categories.proteins?.markers.hsCRP?.values?.[latestIdx]
            ?? data.categories.proteins?.markers.crp?.values?.[latestIdx];
          if (crpVal != null && crpVal <= 0) {
            issues.push('CRP is zero or negative — cannot calculate (log undefined)');
          }
          // Unit sanity warnings
          const albVal = data.categories.proteins?.markers.albumin?.values?.[latestIdx];
          if (albVal != null && albVal > 10) {
            issues.push(`Albumin value ${albVal} looks like g/dL — expected g/L (typically 35–55)`);
          }
          const lymphVal = data.categories.differential?.markers.lymphocytesPct?.values?.[latestIdx];
          if (lymphVal != null && lymphVal > 1) {
            issues.push(`Lymphocytes % value ${lymphVal} looks like a percentage — expected fraction 0–1 (e.g. 0.28)`);
          }
          const alpVal = data.categories.biochemistry?.markers.alp?.values?.[latestIdx];
          if (alpVal != null && alpVal > 10) {
            issues.push(`ALP value ${alpVal} looks like U/L — expected µkat/L (typically 0.5–2.0)`);
          }
        }
      }
    }
    // Biological Age: show component status
    if (id === 'calculatedRatios_biologicalAge') {
      const latestIdx = data.dates.length - 1;
      const pheno = data.categories.calculatedRatios?.markers?.phenoAge?.values?.[latestIdx];
      const bortz = data.categories.calculatedRatios?.markers?.bortzAge?.values?.[latestIdx];
      if (pheno == null && bortz == null) {
        issues.push('Neither PhenoAge nor Bortz Age could be calculated — check their detail views for missing inputs');
      } else {
        const age = state.profileDob ? ((new Date(data.dates[latestIdx] + 'T00:00:00') - new Date(state.profileDob + 'T00:00:00')) / (365.25*24*60*60*1000)) : null;
        const parts = [];
        if (pheno != null) parts.push(`PhenoAge: ${pheno}${age ? ' (' + (pheno - age > 0 ? '+' : '') + (pheno - age).toFixed(1) + 'y)' : ''}`);
        if (bortz != null) parts.push(`Bortz Age: ${bortz}${age ? ' (' + (bortz - age > 0 ? '+' : '') + (bortz - age).toFixed(1) + 'y)' : ''}`);
        if (pheno == null) parts.push('PhenoAge: not calculated');
        if (bortz == null) parts.push('Bortz Age: not calculated');
        issues.push(parts.join(' · '));
      }
    }
    if (issues.length > 0) {
      html += `<div class="calc-missing-inputs">Not calculated — ${issues.join('. ')}</div>`;
    }
  }
  // Collect inline SNPs for the unified rec section (genetics + actionable tips together)
  const _inlineSNPs = (state.importedData.genetics?.snps && window._getRelevantSNPs) ? window._getRelevantSNPs(dotKey) : [];
  // Marker note
  const markerNote = state.importedData.markerNotes?.[dotKey] || '';
  html += `<div class="marker-note-section">
    <div class="marker-note-header"><span class="marker-note-label">Note</span><button class="marker-note-edit-btn" onclick="event.stopPropagation();toggleMarkerNoteEditor('${dotKey}')">${markerNote ? 'Edit' : '+ Add note'}</button></div>
    ${markerNote ? `<div class="marker-note-text">${escapeHTML(markerNote)}</div>` : ''}
    <div class="marker-note-editor" id="marker-note-editor" style="display:none">
      <textarea id="marker-note-input" placeholder="Your notes about this marker (e.g. why it's high, what to watch for, what you've learned...)" rows="3">${escapeHTML(markerNote)}</textarea>
      <div class="marker-note-actions">
        <button class="import-btn import-btn-primary" onclick="event.stopPropagation();saveMarkerNote('${dotKey}','${id}')">Save</button>
        <button class="import-btn import-btn-secondary" onclick="event.stopPropagation();toggleMarkerNoteEditor('${dotKey}')">Cancel</button>
        ${markerNote ? `<button class="import-btn import-btn-secondary" style="color:var(--red)" onclick="event.stopPropagation();deleteMarkerNote('${dotKey}','${id}')">Delete</button>` : ''}
      </div>
    </div>
  </div>`;
  // Recommendation placeholder — shown for any marker with a catalog slot
  if (window.isProductRecsEnabled && window.isProductRecsEnabled()) {
    html += `<div id="rec-modal-${id}"></div>`;
  }
  html += `<button class="ask-ai-btn" onclick="event.stopPropagation();askAIAboutMarker('${id}')">Ask AI about this marker</button>`;
  html += `<button class="manual-entry-btn" onclick="event.stopPropagation();openManualEntryForm('${id}')">+ Add Value</button>`;
  // Show delete link for custom markers only
  if (state.importedData?.customMarkers?.[dotKey]) {
    html += `<div style="text-align:center;margin-top:8px"><a href="#" style="color:var(--text-muted);font-size:0.8rem" onclick="event.preventDefault();event.stopPropagation();deleteCustomMarker('${id}')">Delete this marker</a></div>`;
  }
  modal.innerHTML = html;
  overlay.classList.add("show");
  // Async-fill recommendation section (unified: genetics + actionable tips)
  if (window.renderRecommendationSection) {
    const _latestVal = marker.values?.filter(v => v !== null).pop();
    const _markerStatus = _latestVal != null ? getStatus(_latestVal, r.min, r.max) : 'missing';
    window.renderRecommendationSection(id.replace('_','.'), { label: 'What can help', maxProducts: 3, inlineSNPs: _inlineSNPs, markerStatus: _markerStatus })
      .then(h => {
        const el = document.getElementById('rec-modal-' + id);
        if (h && el) {
          el.innerHTML = h;
          if (opts.scrollToRec) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      });
  }
  setTimeout(() => {
    if (document.getElementById("chart-modal")) createLineChart("modal", marker, data.dateLabels, data.dates, data.phaseLabels);
  }, 50);
  // Display marker description (sync for schema markers, async fetch for custom)
  const descEl = document.getElementById('marker-desc');
  if (descEl) {
    const desc = getMarkerDescription(id);
    if (desc) {
      descEl.textContent = desc;
      descEl.classList.add('loaded');
    } else if (!marker.desc && hasAIProvider()) {
      descEl.classList.add('loading');
      fetchCustomMarkerDescription(id, marker.name, marker.unit).then(text => {
        const el = document.getElementById('marker-desc');
        if (text && el) {
          el.textContent = text;
          el.classList.remove('loading');
          el.classList.add('loaded');
        } else if (el) {
          el.remove();
        }
      });
    } else {
      descEl.remove();
    }
  }
}

export function openManualEntryForm(id) {
  const marker = state.markerRegistry[id];
  if (!marker) return;
  const modal = document.getElementById("detail-modal");
  const overlay = document.getElementById("modal-overlay");
  const today = new Date().toISOString().slice(0, 10);
  const refText = marker.refMin != null || marker.refMax != null
    ? `Reference: ${marker.refMin != null ? marker.refMin : '–'} \u2013 ${marker.refMax != null ? marker.refMax : '–'} ${escapeHTML(marker.unit)}`
    : '';
  modal.innerHTML = `<button class="modal-close" onclick="closeModal()">&times;</button>
    <h3>Add Value \u2014 ${escapeHTML(marker.name)}</h3>
    <div class="modal-unit">${escapeHTML(marker.unit)}${refText ? ' \u00b7 ' + refText : ''}</div>
    <div class="manual-entry-form">
      <div class="me-field">
        <label>Date</label>
        <input type="date" id="me-date" value="${today}">
      </div>
      <div class="me-field">
        <label>Value (${marker.unit})</label>
        <input type="number" id="me-value" step="any" placeholder="Enter value..." autofocus>
      </div>
      <div style="display:flex;gap:8px;margin-top:16px">
        <button class="import-btn import-btn-primary" onclick="saveManualEntry('${id}')">Save</button>
        <button class="import-btn import-btn-secondary" onclick="showDetailModal('${id}')">Cancel</button>
      </div>
    </div>`;
  overlay.classList.add("show");
  setTimeout(() => { const el = document.getElementById('me-value'); if (el) el.focus(); }, 50);
}

export function saveManualEntry(id) {
  const dateInput = document.getElementById('me-date');
  const valueInput = document.getElementById('me-value');
  if (!dateInput || !valueInput) return;
  const date = dateInput.value;
  const value = parseFloat(valueInput.value);
  if (!date) { showNotification('Please enter a date', 'error'); return; }
  if (isNaN(value)) { showNotification('Please enter a valid number', 'error'); return; }
  // Convert id format: "category_markerKey" → "category.markerKey"
  const dotKey = id.replace('_', '.');
  if (!state.importedData.entries) state.importedData.entries = [];
  let entry = state.importedData.entries.find(e => e.date === date);
  if (!entry) {
    entry = { date: date, markers: {} };
    state.importedData.entries.push(entry);
  }
  const storedValue = convertDisplayToSI(dotKey, value);
  entry.markers[dotKey] = storedValue;
  // Track provenance
  if (!entry.markerSources) entry.markerSources = {};
  entry.markerSources[dotKey] = { file: null, at: Date.now() };
  // Track as manually added
  if (!state.importedData.manualValues) state.importedData.manualValues = {};
  state.importedData.manualValues[dotKey + ':' + date] = true;
  // Insulin dual-mapping
  if (dotKey === 'hormones.insulin') { entry.markers['diabetes.insulin_d'] = storedValue; entry.markerSources['diabetes.insulin_d'] = entry.markerSources[dotKey]; }
  recalculateHOMAIR(entry);
  saveImportedData();
  window.buildSidebar();
  updateHeaderDates();
  closeModal();
  const activeNav = document.querySelector(".nav-item.active");
  navigate(activeNav ? activeNav.dataset.category : "dashboard");
  showNotification(`Added ${state.markerRegistry[id]?.name || id}: ${value} on ${date}`, 'success');
  // Re-open detail modal so user stays in context (#29)
  setTimeout(() => showDetailModal(id), 50);
}

export function openCreateMarkerModal() {
  const modal = document.getElementById("detail-modal");
  const overlay = document.getElementById("modal-overlay");
  // Build category options from schema + existing custom categories
  const data = getActiveData();
  const catOptions = Object.entries(data.categories)
    .map(([key, c]) => `<option value="${key}">${escapeHTML(c.label)}</option>`)
    .join('');
  modal.innerHTML = `<button class="modal-close" onclick="closeModal()">&times;</button>
    <h3>Create New Biomarker</h3>
    <div class="manual-entry-form">
      <div class="me-field">
        <label>Category</label>
        <div class="cm-cat-row">
          <select id="cm-category" onchange="document.getElementById('cm-new-cat-row').style.display=this.value==='__new__'?'flex':'none'">
            ${catOptions}
            <option value="__new__">+ New category...</option>
          </select>
          <div id="cm-new-cat-row" style="display:none;margin-top:6px;gap:8px;align-items:center">
            <span id="cm-new-cat-icon" title="Pick icon" style="cursor:pointer;font-size:20px;min-width:28px;text-align:center" data-custom="" onclick="pickNewCatIcon(this)">\uD83D\uDD16</span>
            <input type="text" id="cm-new-cat" placeholder="Category name" style="flex:1">
          </div>
        </div>
      </div>
      <div class="me-field">
        <label>Marker name</label>
        <input type="text" id="cm-name" placeholder="e.g. Lipoprotein(a)" autofocus>
      </div>
      <div class="me-field">
        <label>Unit</label>
        <input type="text" id="cm-unit" placeholder="e.g. mg/dL, nmol/L, %">
      </div>
      <div class="me-field">
        <label>Reference range (optional)</label>
        <div style="display:flex;gap:8px">
          <input type="number" id="cm-ref-min" step="any" placeholder="Min">
          <span style="line-height:36px">\u2013</span>
          <input type="number" id="cm-ref-max" step="any" placeholder="Max">
        </div>
      </div>
      <div class="me-field">
        <label>Optimal range (optional)</label>
        <div style="display:flex;gap:8px">
          <input type="number" id="cm-opt-min" step="any" placeholder="Min">
          <span style="line-height:36px">\u2013</span>
          <input type="number" id="cm-opt-max" step="any" placeholder="Max">
        </div>
      </div>
      <div style="display:flex;gap:8px;margin-top:16px">
        <button class="import-btn import-btn-primary" onclick="saveCustomMarker()">Create</button>
        <button class="import-btn import-btn-secondary" onclick="closeModal()">Cancel</button>
      </div>
    </div>`;
  overlay.classList.add("show");
  setTimeout(() => { const el = document.getElementById('cm-name'); if (el) el.focus(); }, 50);
}

export function pickNewCatIcon(el) {
  showEmojiPicker(el, (emoji) => {
    if (emoji) { el.textContent = emoji; el.dataset.custom = '1'; }
  });
}

export function saveCustomMarker() {
  const catSelect = document.getElementById('cm-category');
  const newCatInput = document.getElementById('cm-new-cat');
  const nameInput = document.getElementById('cm-name');
  const unitInput = document.getElementById('cm-unit');
  const refMinInput = document.getElementById('cm-ref-min');
  const refMaxInput = document.getElementById('cm-ref-max');
  if (!nameInput?.value.trim()) { showNotification('Please enter a marker name', 'error'); return; }
  const name = nameInput.value.trim();
  // Determine category key and label
  let catKey, catLabel;
  if (catSelect.value === '__new__') {
    catLabel = (newCatInput?.value || '').trim();
    if (!catLabel) { showNotification('Please enter a category name', 'error'); return; }
    const iconEl = document.getElementById('cm-new-cat-icon');
    var newCatIcon = iconEl?.dataset.custom === '1' ? iconEl.textContent.trim() : null;
    catKey = catLabel.replace(/[^a-zA-Z0-9\s]/g, '').split(/\s+/)
      .map((w, i) => i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join('');
    if (!catKey || /^\d/.test(catKey)) catKey = 'custom' + catKey.charAt(0).toUpperCase() + catKey.slice(1);
  } else {
    catKey = catSelect.value;
    catLabel = catSelect.options[catSelect.selectedIndex].text;
  }
  // Generate marker key from name (camelCase)
  const markerKey = name
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .split(/\s+/)
    .map((w, i) => i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join('');
  if (!markerKey) { showNotification('Could not generate a valid key from marker name', 'error'); return; }
  const fullKey = catKey + '.' + markerKey;
  // Check for conflicts
  const data = getActiveData();
  const existingCat = data.categories[catKey];
  if (existingCat?.markers[markerKey]) {
    showNotification('A marker with this name already exists in that category', 'error');
    return;
  }
  // Parse optional ref range
  const refMin = refMinInput?.value ? parseFloat(refMinInput.value) : null;
  const refMax = refMaxInput?.value ? parseFloat(refMaxInput.value) : null;
  const optMinInput = document.getElementById('cm-opt-min');
  const optMaxInput = document.getElementById('cm-opt-max');
  const optMin = optMinInput?.value ? parseFloat(optMinInput.value) : null;
  const optMax = optMaxInput?.value ? parseFloat(optMaxInput.value) : null;
  // Save custom marker definition
  if (!state.importedData.customMarkers) state.importedData.customMarkers = {};
  const cmDef = {
    name,
    unit: (unitInput?.value || '').trim(),
    refMin: isNaN(refMin) ? null : refMin,
    refMax: isNaN(refMax) ? null : refMax,
    categoryLabel: catLabel,
    ...(typeof newCatIcon !== 'undefined' && newCatIcon ? { icon: newCatIcon } : {})
  };
  state.importedData.customMarkers[fullKey] = cmDef;
  // Save optimal range as refOverride if provided
  if (optMin != null && !isNaN(optMin) && optMax != null && !isNaN(optMax)) {
    if (!state.importedData.refOverrides) state.importedData.refOverrides = {};
    state.importedData.refOverrides[fullKey] = {
      ...(state.importedData.refOverrides[fullKey] || {}),
      optimalMin: optMin,
      optimalMax: optMax
    };
  }
  saveImportedData();
  window.buildSidebar();
  closeModal();
  showNotification(`Created "${name}" in ${catLabel}`, 'success');
  // Register marker and open manual entry to add first value
  const id = catKey + '_' + markerKey;
  state.markerRegistry[id] = {
    name,
    unit: (unitInput?.value || '').trim(),
    refMin: isNaN(refMin) ? null : refMin,
    refMax: isNaN(refMax) ? null : refMax,
    custom: true
  };
  setTimeout(() => openManualEntryForm(id), 100);
}

export function deleteMarkerValue(id, date) {
  const dotKey = id.replace('_', '.');
  if (!state.importedData.entries) return;
  const entry = state.importedData.entries.find(e => e.date === date);
  if (!entry || entry.markers[dotKey] === undefined) return;
  delete entry.markers[dotKey];
  // Clean up provenance and manual tracking
  if (entry.markerSources) delete entry.markerSources[dotKey];
  if (state.importedData.manualValues) delete state.importedData.manualValues[dotKey + ':' + date];
  // Clean up insulin dual-mapping
  if (dotKey === 'hormones.insulin') { delete entry.markers['diabetes.insulin_d']; if (entry.markerSources) delete entry.markerSources['diabetes.insulin_d']; recalculateHOMAIR(entry); }
  // Remove entry entirely if no markers left
  if (Object.keys(entry.markers).length === 0) {
    state.importedData.entries = state.importedData.entries.filter(e => e.date !== date);
  }
  saveImportedData();
  window.buildSidebar();
  updateHeaderDates();
  // Re-open the detail modal to show updated values
  const activeNav = document.querySelector(".nav-item.active");
  navigate(activeNav ? activeNav.dataset.category : "dashboard");
  showDetailModal(id);
  showNotification(`Removed value from ${date}`, 'info');
}

export function deleteCustomMarker(id) {
  const dotKey = id.replace('_', '.');
  const catKey = dotKey.split('.')[0];
  const def = state.importedData?.customMarkers?.[dotKey];
  if (!def) return;
  // Find all custom markers in same category
  const siblingsInCat = Object.keys(state.importedData.customMarkers).filter(k => k.startsWith(catKey + '.'));
  const isLastInCat = siblingsInCat.length <= 1;
  const msg = isLastInCat
    ? `Delete "${def.name}" and the entire "${def.categoryLabel || catKey}" category? This cannot be undone.`
    : `Delete "${def.name}" and all its values? This cannot be undone.`;
  showConfirmDialog(msg, () => {
    // Determine which keys to delete — just this marker, or all in category
    const keysToDelete = isLastInCat ? siblingsInCat : [dotKey];
    for (const key of keysToDelete) {
      // Remove from all entries
      if (state.importedData.entries) {
        for (const entry of state.importedData.entries) {
          if (entry.markers) delete entry.markers[key];
        }
      }
      // Remove manual value tracking
      if (state.importedData.manualValues) {
        for (const k of Object.keys(state.importedData.manualValues)) {
          if (k.startsWith(key + ':')) delete state.importedData.manualValues[k];
        }
      }
      // Remove ref overrides
      if (state.importedData.refOverrides) delete state.importedData.refOverrides[key];
      // Remove custom marker definition
      delete state.importedData.customMarkers[key];
    }
    // Clean up empty entries
    if (state.importedData.entries) {
      state.importedData.entries = state.importedData.entries.filter(e => Object.keys(e.markers || {}).length > 0);
    }
    saveImportedData();
    closeModal();
    window.buildSidebar();
    updateHeaderDates();
    navigate('dashboard');
    showNotification(`Deleted "${def.name}"${isLastInCat && siblingsInCat.length > 1 ? ` and ${siblingsInCat.length - 1} other marker(s)` : ''}`, 'info');
  });
}

export function editMarkerValue(id, date, currentValue, event) {
  const el = event.target.closest('.mv-value');
  if (!el || el.querySelector('input')) return;
  const input = document.createElement('input');
  input.type = 'number';
  input.step = 'any';
  input.value = currentValue;
  input.className = 'ref-edit-input';
  input.style.cssText = 'width:80px;text-align:center;font-size:inherit';
  el.textContent = '';
  el.appendChild(input);
  input.focus();
  input.select();
  const save = () => {
    const newValue = parseFloat(input.value);
    if (isNaN(newValue)) { showDetailModal(id); return; }
    const dotKey = id.replace('_', '.');
    const entry = state.importedData.entries?.find(e => e.date === date);
    if (!entry) return;
    // Track as manually edited — store original value for revert (true = manual entry with no original)
    if (!state.importedData.manualValues) state.importedData.manualValues = {};
    const mvKey = dotKey + ':' + date;
    if (!(mvKey in state.importedData.manualValues)) {
      // First edit — save original SI value for revert
      state.importedData.manualValues[mvKey] = entry.markers[dotKey] != null ? entry.markers[dotKey] : true;
    }
    const storedValue = convertDisplayToSI(dotKey, newValue);
    entry.markers[dotKey] = storedValue;
    // Update provenance to reflect manual edit
    if (!entry.markerSources) entry.markerSources = {};
    entry.markerSources[dotKey] = { file: null, at: Date.now() };
    if (dotKey === 'hormones.insulin') { entry.markers['diabetes.insulin_d'] = storedValue; if (entry.markerSources) entry.markerSources['diabetes.insulin_d'] = entry.markerSources[dotKey]; recalculateHOMAIR(entry); }
    saveImportedData();
    showDetailModal(id);
  };
  input.addEventListener('blur', save);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') input.blur(); else if (e.key === 'Escape') showDetailModal(id); });
}

export function revertMarkerValue(id, date) {
  const dotKey = id.replace('_', '.');
  const mvKey = dotKey + ':' + date;
  const original = state.importedData.manualValues?.[mvKey];
  if (original == null || original === true) return;
  const entry = state.importedData.entries?.find(e => e.date === date);
  if (!entry) return;
  entry.markers[dotKey] = original;
  if (dotKey === 'hormones.insulin') { entry.markers['diabetes.insulin_d'] = original; recalculateHOMAIR(entry); }
  delete state.importedData.manualValues[mvKey];
  saveImportedData();
  showDetailModal(id);
}

export function closeModal() {
  document.getElementById("modal-overlay").classList.remove("show");
  if (state.chartInstances["modal"]) { state.chartInstances["modal"].destroy(); delete state.chartInstances["modal"]; }
  document.removeEventListener('click', closeSuggestionsOnClickOutside);
  if (window.closeEMFInterpretation) window.closeEMFInterpretation();
  // Detail-modal Tab focus trap (wearables) — uninstall explicitly so the
  // global keydown handler doesn't outlive the modal it scoped to.
  if (window._uninstallWearableModalFocusTrap) window._uninstallWearableModalFocusTrap();
  restoreModalTrigger();
}


// ═══════════════════════════════════════════════
// COMPARE DATES
// ═══════════════════════════════════════════════

export function showCompare(data) {
  if (!data) data = getActiveData();
  const main = document.getElementById("main-content");
  let html = `<div class="category-header"><h2>\u2194 Compare Dates</h2>
    <p>Side-by-side comparison of biomarker values between two collection dates</p></div>`;
  if (data.dates.length < 2) {
    html += `<div class="empty-state"><div class="empty-state-icon">\u2194</div>
      <h3>Not Enough Data</h3><p>Import at least 2 lab result dates to compare values side by side.</p></div>`;
    main.innerHTML = html;
    return;
  }
  if (!state.compareDate1 || !data.dates.includes(state.compareDate1)) state.compareDate1 = data.dates[0];
  if (!state.compareDate2 || !data.dates.includes(state.compareDate2)) state.compareDate2 = data.dates[data.dates.length - 1];
  const fmtOpt = d => {
    const label = new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return `<option value="${d}">${label}</option>`;
  };
  html += `<div class="compare-controls">
    <label>Date 1:</label>
    <select id="compare-select-1" onchange="setCompareDate1(this.value)">${data.dates.map(d => fmtOpt(d)).join('')}</select>
    <button class="compare-swap-btn" onclick="swapCompareDates()" title="Swap dates">\u21C4</button>
    <label>Date 2:</label>
    <select id="compare-select-2" onchange="setCompareDate2(this.value)">${data.dates.map(d => fmtOpt(d)).join('')}</select>
  </div>`;
  html += `<div id="compare-results"></div>`;
  main.innerHTML = html;
  document.getElementById('compare-select-1').value = state.compareDate1;
  document.getElementById('compare-select-2').value = state.compareDate2;
  updateCompare();
}

export function setCompareDate1(value) { state.compareDate1 = value; updateCompare(); }
export function setCompareDate2(value) { state.compareDate2 = value; updateCompare(); }

export function updateCompare() {
  const data = getActiveData();
  const container = document.getElementById('compare-results');
  if (!container) return;
  const idx1 = data.dates.indexOf(state.compareDate1);
  const idx2 = data.dates.indexOf(state.compareDate2);
  if (idx1 === -1 || idx2 === -1) { container.innerHTML = ''; return; }
  container.innerHTML = renderCompareTable(data, idx1, idx2);
}

export function swapCompareDates() {
  const tmp = state.compareDate1;
  state.compareDate1 = state.compareDate2;
  state.compareDate2 = tmp;
  const s1 = document.getElementById('compare-select-1');
  const s2 = document.getElementById('compare-select-2');
  if (s1) s1.value = state.compareDate1;
  if (s2) s2.value = state.compareDate2;
  updateCompare();
}

export function renderCompareTable(data, idx1, idx2) {
  const d1Label = data.dateLabels[idx1];
  const d2Label = data.dateLabels[idx2];
  let html = `<div class="compare-table-wrapper"><table class="compare-table"><thead><tr>
    <th>Biomarker</th><th>Unit</th><th>Reference</th>
    <th>${d1Label}</th><th>${d2Label}</th><th>Delta</th><th>% Change</th></tr></thead><tbody>`;
  for (const [catKey, cat] of Object.entries(data.categories)) {
    if (cat.singlePoint) continue;
    const rows = [];
    for (const [mKey, marker] of Object.entries(cat.markers)) {
      const v1 = marker.values[idx1];
      const v2 = marker.values[idx2];
      if (v1 === null && v2 === null) continue;
      const mr1 = getEffectiveRangeForDate(marker, idx1);
      const mr2 = getEffectiveRangeForDate(marker, idx2);
      const mr = getEffectiveRange(marker);
      const s1 = v1 !== null ? getStatus(v1, mr1.min, mr1.max) : 'missing';
      const s2 = v2 !== null ? getStatus(v2, mr2.min, mr2.max) : 'missing';
      let delta = null, pctChange = null, directionClass = 'compare-neutral';
      if (v1 !== null && v2 !== null) {
        delta = v2 - v1;
        pctChange = v1 !== 0 ? (delta / v1) * 100 : null;
        if (mr.min != null && mr.max != null) {
          const mid = (mr.min + mr.max) / 2;
          const dist1 = Math.abs(v1 - mid);
          const dist2 = Math.abs(v2 - mid);
          if (dist2 < dist1 - 0.001) directionClass = 'compare-improved';
          else if (dist2 > dist1 + 0.001) directionClass = 'compare-worsened';
        }
      }
      const refStr = marker.refMin != null && marker.refMax != null ? `${formatValue(marker.refMin)} \u2013 ${formatValue(marker.refMax)}` : '\u2014';
      rows.push(`<tr>
        <td class="marker-name">${escapeHTML(marker.name)}</td>
        <td style="color:var(--text-muted);font-size:12px">${escapeHTML(marker.unit)}</td>
        <td style="color:var(--text-secondary);font-size:12px">${refStr}</td>
        <td class="value-cell val-${s1}" style="font-weight:600">${v1 !== null ? formatValue(v1) : '\u2014'}</td>
        <td class="value-cell val-${s2}" style="font-weight:600">${v2 !== null ? formatValue(v2) : '\u2014'}</td>
        <td class="${directionClass}" style="font-weight:600">${delta !== null ? (delta > 0 ? '+' : '') + formatValue(delta) : '\u2014'}</td>
        <td class="${directionClass}" style="font-weight:600">${pctChange !== null ? (pctChange > 0 ? '+' : '') + pctChange.toFixed(1) + '%' : '\u2014'}</td>
      </tr>`);
    }
    if (rows.length > 0) {
      html += `<tr class="cat-row"><td colspan="7">${escapeHTML(cat.icon)} ${escapeHTML(cat.label)}</td></tr>`;
      html += rows.join('');
    }
  }
  html += `</tbody></table></div>`;
  return html;
}

// ═══════════════════════════════════════════════
// CORRELATIONS
// ═══════════════════════════════════════════════

export function showCorrelations(data) {
  if (!data) data = getActiveData();
  const main = document.getElementById("main-content");
  let html = `<div class="category-header"><h2>\uD83D\uDCC8 Correlations</h2>
    <p>Compare biomarkers across categories on a normalized scale</p></div>`;
  html += `<div class="correlation-controls">
    <h3>Select Biomarkers (2\u20138)</h3>
    <div class="corr-select-row">
      <div class="corr-dropdown">
        <input type="text" class="corr-search" id="corr-search" placeholder="Search biomarkers..."
          oninput="filterCorrelationOptions()" onfocus="showCorrelationDropdown()">
        <div class="corr-options" id="corr-options"></div>
      </div>
    </div>
    <div class="corr-chips" id="corr-chips"></div>
    <div class="corr-presets">
      <div class="corr-presets-label">Quick Presets:</div>`;
  for (let i = 0; i < CORRELATION_PRESETS.length; i++) {
    html += `<button class="corr-preset-btn" onclick="applyCorrelationPreset(${i})">${CORRELATION_PRESETS[i].label}</button>`;
  }
  html += `</div></div>`;
  html += `<div class="corr-chart-container" id="corr-chart-container" style="display:none">
    <h3>Normalized Comparison (% of Reference Range)
      <button class="corr-ask-ai-btn" onclick="askAIAboutCorrelations()" title="Ask AI about these correlations">Ask AI</button>
    </h3>
    <div class="corr-chart"><canvas id="chart-correlation"></canvas></div></div>`;
  main.innerHTML = html;
  populateCorrelationOptions(data);
  renderCorrelationChips();
  if (state.selectedCorrelationMarkers.length >= 2) renderCorrelationChart();
}

export function populateCorrelationOptions(data) {
  if (!data) data = getActiveData();
  const container = document.getElementById("corr-options");
  if (!container) return;
  let html = '';
  for (const [catKey, cat] of Object.entries(data.categories)) {
    for (const [markerKey, marker] of Object.entries(cat.markers)) {
      if (marker.singlePoint) continue;
      const fullKey = `${catKey}.${markerKey}`;
      const selected = state.selectedCorrelationMarkers.includes(fullKey);
      html += `<div class="corr-option ${selected ? 'selected' : ''}"
        data-key="${fullKey}" data-name="${escapeHTML(marker.name)}" data-cat="${escapeHTML(cat.label)}"
        onclick="toggleCorrelationMarker('${fullKey}')">
        ${escapeHTML(marker.name)} <span class="opt-cat">${escapeHTML(cat.label)}</span></div>`;
    }
  }
  container.innerHTML = html;
}

export function showCorrelationDropdown() {
  document.getElementById("corr-options").classList.add("show");
}

export function filterCorrelationOptions() {
  const search = document.getElementById("corr-search").value.toLowerCase();
  document.querySelectorAll(".corr-option").forEach(opt => {
    const name = opt.dataset.name.toLowerCase();
    const cat = opt.dataset.cat.toLowerCase();
    opt.style.display = (name.includes(search) || cat.includes(search)) ? '' : 'none';
  });
  document.getElementById("corr-options").classList.add("show");
}

export function toggleCorrelationMarker(key) {
  const idx = state.selectedCorrelationMarkers.indexOf(key);
  if (idx !== -1) state.selectedCorrelationMarkers.splice(idx, 1);
  else if (state.selectedCorrelationMarkers.length < 8) state.selectedCorrelationMarkers.push(key);
  renderCorrelationChips();
  populateCorrelationOptions();
  if (state.selectedCorrelationMarkers.length >= 2) renderCorrelationChart();
  else {
    document.getElementById("corr-chart-container").style.display = "none";
    if (state.chartInstances["correlation"]) { state.chartInstances["correlation"].destroy(); delete state.chartInstances["correlation"]; }
  }
}

export function applyCorrelationPreset(idx) {
  state.selectedCorrelationMarkers = [...CORRELATION_PRESETS[idx].markers];
  renderCorrelationChips();
  populateCorrelationOptions();
  if (state.selectedCorrelationMarkers.length >= 2) renderCorrelationChart();
}

export function renderCorrelationChips() {
  const container = document.getElementById("corr-chips");
  if (!container) return;
  const data = getActiveData();
  let html = '';
  state.selectedCorrelationMarkers.forEach((key, i) => {
    const [catKey, markerKey] = key.split('.');
    const marker = data.categories[catKey]?.markers[markerKey];
    if (!marker) return;
    const color = CHIP_COLORS[i % CHIP_COLORS.length];
    html += `<span class="corr-chip" style="background:${color}20;border-color:${color};color:${color}">
      ${escapeHTML(marker.name)} <span class="chip-remove" onclick="toggleCorrelationMarker('${key}')">&times;</span></span>`;
  });
  container.innerHTML = html;
}

export function renderCorrelationChart() {
  const data = getActiveData();
  const container = document.getElementById("corr-chart-container");
  container.style.display = "block";
  if (state.chartInstances["correlation"]) { state.chartInstances["correlation"].destroy(); delete state.chartInstances["correlation"]; }
  const canvas = document.getElementById("chart-correlation");
  if (!canvas) return;
  const datasets = [];
  state.selectedCorrelationMarkers.forEach((key, i) => {
    const [catKey, markerKey] = key.split('.');
    const marker = data.categories[catKey]?.markers[markerKey];
    if (!marker) return;
    const normalizedValues = marker.values.map(v => {
      if (v === null) return null;
      if (marker.refMin == null || marker.refMax == null) return 50;
      const range = marker.refMax - marker.refMin;
      return range !== 0 ? ((v - marker.refMin) / range) * 100 : 50;
    });
    const color = CHIP_COLORS[i % CHIP_COLORS.length];
    datasets.push({
      label: marker.name, data: normalizedValues,
      borderColor: color, backgroundColor: color + '20',
      borderWidth: 2.5, pointRadius: 5, pointHoverRadius: 7,
      pointBackgroundColor: color, tension: 0.3, fill: false, spanGaps: true,
      _realValues: marker.values, _unit: marker.unit, _refMin: marker.refMin, _refMax: marker.refMax
    });
  });
  const allVals = datasets.flatMap(ds => ds.data.filter(v => v !== null));
  const minY = Math.min(0, ...allVals) - 10;
  const maxY = Math.max(100, ...allVals) + 10;
  const tc = getChartColors();
  state.chartInstances["correlation"] = new Chart(canvas, {
    type: "line",
    data: { labels: data.dateLabels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: true, labels: { color: tc.legendColor, font: { size: 12 }, usePointStyle: true, pointStyle: "circle" } },
        tooltip: {
          backgroundColor: tc.tooltipBg, titleColor: tc.tooltipTitle, bodyColor: tc.tooltipBody,
          borderColor: tc.tooltipBorder, borderWidth: 1,
          callbacks: {
            label: (ctx) => {
              const ds = ctx.dataset;
              const realVal = ds._realValues[ctx.dataIndex];
              const pct = ctx.parsed.y;
              return `${ds.label}: ${formatValue(realVal)} ${ds._unit} (${pct !== null ? pct.toFixed(0) + '%' : 'N/A'})`;
            }
          }
        },
        refBand: { refMin: 0, refMax: 100 },
        noteAnnotations: (function() { const n = getNotesForChart(data.dates); return n.length ? { notes: n, chartDates: data.dates } : false; })(),
        supplementBars: (function() { const s = getSupplementsForChart(data.dates); return s.length ? { supplements: s, chartDates: data.dates } : false; })()
      },
      layout: { padding: { top: (function() { const s = getSupplementsForChart(data.dates); return s.length ? s.length * 14 + 6 : 0; })() } },
      scales: {
        x: { ticks: { color: tc.tickColor, font: { size: 11 } }, grid: { display: false } },
        y: { min: minY, max: maxY, ticks: { color: tc.tickColor, font: { size: 10 }, callback: v => v + '%' }, grid: { color: tc.gridColor } }
      }
    },
    plugins: [refBandPlugin, noteAnnotationPlugin, supplementBarPlugin]
  });
}

// ═══════════════════════════════════════════════
// EDITABLE REFERENCE RANGES
// ═══════════════════════════════════════════════

export function editRefRange(id, type, evt) {
  const marker = state.markerRegistry[id];
  if (!marker) return;
  const isOptimal = type === 'optimal';
  const curMin = isOptimal ? marker.optimalMin : marker.refMin;
  const curMax = isOptimal ? marker.optimalMax : marker.refMax;
  const label = isOptimal ? 'Optimal' : 'Reference';

  const span = evt.target.closest('.ref-editable');
  if (!span) return;

  // Replace span with inline inputs
  const form = document.createElement('span');
  form.className = 'ref-edit-form';
  form.innerHTML = `${label}: <span class="ref-edit-field"><input type="text" inputmode="decimal" value="${curMin ?? ''}" placeholder="none" class="ref-edit-input" id="ref-edit-min"><button type="button" class="ref-edit-clear" onclick="document.getElementById('ref-edit-min').value='';document.getElementById('ref-edit-min').focus()" title="Clear (open-ended)">\u00d7</button></span> \u2013 <span class="ref-edit-field"><input type="text" inputmode="decimal" value="${curMax ?? ''}" placeholder="none" class="ref-edit-input" id="ref-edit-max"><button type="button" class="ref-edit-clear" onclick="document.getElementById('ref-edit-max').value='';document.getElementById('ref-edit-max').focus()" title="Clear (open-ended)">\u00d7</button></span> <button class="ref-edit-save" onclick="saveRefRange('${id}','${type}')">Save</button>`;
  span.replaceWith(form);
  form.querySelector('#ref-edit-min').focus();

  // Enter to save
  form.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); window.saveRefRange(id, type); } });
  // Escape to cancel
  form.addEventListener('keydown', e => { if (e.key === 'Escape') showDetailModal(id); });
}

export function saveRefRange(id, type) {
  const dotKey = id.replace('_', '.');
  const minEl = document.getElementById('ref-edit-min');
  const maxEl = document.getElementById('ref-edit-max');
  if (!minEl || !maxEl) return;
  let newMin = minEl.value.trim() !== '' ? parseFloat(minEl.value) : null;
  let newMax = maxEl.value.trim() !== '' ? parseFloat(maxEl.value) : null;
  // Treat NaN as null (open-ended)
  if (newMin != null && isNaN(newMin)) newMin = null;
  if (newMax != null && isNaN(newMax)) newMax = null;

  // If user is in US mode, convert back to SI for storage (overrides are applied before unit conversion)
  if (newMin != null) newMin = convertDisplayToSI(dotKey, newMin);
  if (newMax != null) newMax = convertDisplayToSI(dotKey, newMax);

  if (!state.importedData.refOverrides) state.importedData.refOverrides = {};
  if (!state.importedData.refOverrides[dotKey]) state.importedData.refOverrides[dotKey] = {};

  const ovr = state.importedData.refOverrides[dotKey];
  if (type === 'optimal') {
    // Stash lab values before first manual edit
    if (ovr.optimalSource !== 'manual' && ('optimalMin' in ovr) && !('labOptimalMin' in ovr)) {
      ovr.labOptimalMin = ovr.optimalMin;
      ovr.labOptimalMax = ovr.optimalMax;
    }
    ovr.optimalMin = newMin;
    ovr.optimalMax = newMax;
    ovr.optimalSource = 'manual';
  } else {
    if (ovr.refSource !== 'manual' && ('refMin' in ovr) && !('labRefMin' in ovr)) {
      ovr.labRefMin = ovr.refMin;
      ovr.labRefMax = ovr.refMax;
    }
    ovr.refMin = newMin;
    ovr.refMax = newMax;
    ovr.refSource = 'manual';
  }

  saveImportedData();
  // Refresh background view, then re-render modal with new ranges
  const activeNav = document.querySelector('.nav-item.active');
  navigate(activeNav ? activeNav.dataset.category : 'dashboard');
  showDetailModal(id);
  showNotification('Range updated', 'info');
}

export function revertRefRange(id, type) {
  const dotKey = id.replace('_', '.');
  const ovr = state.importedData?.refOverrides?.[dotKey];
  if (!ovr) return;
  let msg = 'Range reverted to default';
  if (type === 'optimal') {
    if ('labOptimalMin' in ovr) {
      // Revert to imported lab range
      ovr.optimalMin = ovr.labOptimalMin;
      ovr.optimalMax = ovr.labOptimalMax;
      ovr.optimalSource = 'import';
      delete ovr.labOptimalMin; delete ovr.labOptimalMax;
      msg = 'Range reverted to lab range';
    } else {
      delete ovr.optimalMin; delete ovr.optimalMax; delete ovr.optimalSource;
    }
  } else {
    if ('labRefMin' in ovr) {
      ovr.refMin = ovr.labRefMin;
      ovr.refMax = ovr.labRefMax;
      ovr.refSource = 'import';
      delete ovr.labRefMin; delete ovr.labRefMax;
      msg = 'Range reverted to lab range';
    } else {
      delete ovr.refMin; delete ovr.refMax; delete ovr.refSource;
    }
  }
  // Clean up empty override objects
  if (Object.keys(ovr).length === 0) delete state.importedData.refOverrides[dotKey];
  saveImportedData();
  const activeNav = document.querySelector('.nav-item.active');
  navigate(activeNav ? activeNav.dataset.category : 'dashboard');
  showDetailModal(id);
  showNotification(msg, 'info');
}

// ═══════════════════════════════════════════════
// WELCOME INTRO (profile setup on first visit)
// ═══════════════════════════════════════════════


// ═══════════════════════════════════════════════
// MARKER NOTES
// ═══════════════════════════════════════════════

function toggleMarkerNoteEditor(dotKey) {
  const editor = document.getElementById('marker-note-editor');
  if (!editor) return;
  const isHidden = editor.style.display === 'none';
  editor.style.display = isHidden ? 'block' : 'none';
  if (isHidden) {
    const input = document.getElementById('marker-note-input');
    if (input) input.focus();
  }
}

function saveMarkerNote(dotKey, id) {
  const input = document.getElementById('marker-note-input');
  const text = input?.value?.trim();
  if (!text) {
    // Empty text = delete the note
    if (state.importedData.markerNotes?.[dotKey]) {
      delete state.importedData.markerNotes[dotKey];
      saveImportedData();
      showNotification('Note removed', 'info');
      showDetailModal(id);
    }
    return;
  }
  if (!state.importedData.markerNotes) state.importedData.markerNotes = {};
  state.importedData.markerNotes[dotKey] = text;
  saveImportedData();
  showNotification('Note saved', 'success');
  showDetailModal(id);
}

function deleteMarkerNote(dotKey, id) {
  if (!state.importedData.markerNotes) return;
  delete state.importedData.markerNotes[dotKey];
  saveImportedData();
  showNotification('Note removed', 'info');
  showDetailModal(id);
}

// ═══════════════════════════════════════════════
// WINDOW EXPORTS
// ═══════════════════════════════════════════════

Object.assign(window, {
  navigate,
  showDashboard,
  renderFocusCard,
  buildFocusContext,
  loadFocusCard,
  refreshFocusCard,
  renderOnboardingBanner,
  completeOnboardingSex,
  completeOnboardingProfile,
  dismissOnboarding,
  showCategory,
  renameCategory,
  renameMarker,
  revertMarkerName,
  changeCategoryIcon,
  switchView,
  renderChartCard,
  renderTableView,
  renderHeatmapView,
  renderFattyAcidsView,
  renderFattyAcidsCharts,
  fetchCustomMarkerDescription,
  showDetailModal,
  editRefRange,
  saveRefRange,
  revertRefRange,
  openManualEntryForm,
  saveManualEntry,
  openCreateMarkerModal,
  pickNewCatIcon,
  saveCustomMarker,
  deleteMarkerValue,
  deleteCustomMarker,
  editMarkerValue,
  revertMarkerValue,
  toggleMarkerNoteEditor,
  saveMarkerNote,
  deleteMarkerNote,
  closeModal,
  rememberModalTrigger,
  showCompare,
  setCompareDate1,
  setCompareDate2,
  updateCompare,
  swapCompareDates,
  renderCompareTable,
  showCorrelations,
  populateCorrelationOptions,
  showCorrelationDropdown,
  filterCorrelationOptions,
  toggleCorrelationMarker,
  applyCorrelationPreset,
  renderCorrelationChips,
  renderCorrelationChart,
});
