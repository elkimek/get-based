// @ts-check
// focus-card.js - Current Focus dashboard and Insight lens card

import { state } from './state.js';
import { trackUsage } from './schema.js';
import { escapeAttr, escapeHTML, hasCardContent, getStatus } from './utils.js';
import { getActiveData, getFocusCardFingerprint } from './data.js';
import { getAllFlaggedMarkers } from './marker-analysis.js';
import { profileStorageKey } from './profile.js';
import { callClaudeAPI, hasAIProvider, getAIProvider, getActiveModelId } from './api.js';
import { injectLensChunks, isGroupInAIContext, isInsightContextCardsEnabled, isLabMarkersContextEnabled, isSupplementsMedsContextEnabled } from './lab-context.js';
import { hasLens, queryLens } from './lens.js';
import { applyInlineMarkdown } from './markdown.js';
import { computeAllImpacts } from './supplement-impact.js';
import { getCurrentSupplements, getSupplementPeriods, getSupplementsOverlappingRange } from './supplement-medication-domain.js';

const focusCardActionDelegateRoots = new WeakSet();
const FOCUS_CARD_ACTION_ATTR = 'data-focus-card-action';

function focusCardActionAttrs(action) {
  return `${FOCUS_CARD_ACTION_ATTR}="${escapeAttr(action)}"`;
}

function closestFocusCardAction(target) {
  return /** @type {HTMLElement | null} */ (
    target && typeof target.closest === 'function'
      ? target.closest(`[${FOCUS_CARD_ACTION_ATTR}]`)
      : null
  );
}

function handleFocusCardActionClick(event) {
  const actionEl = closestFocusCardAction(event.target);
  if (!actionEl || !event.currentTarget?.contains?.(actionEl)) return;
  if (actionEl.getAttribute(FOCUS_CARD_ACTION_ATTR) !== 'refresh') return;
  refreshFocusCard();
  event.preventDefault();
  event.stopPropagation();
}

export function installFocusCardActionDelegates(root = typeof document !== 'undefined' ? document : null) {
  if (!root || focusCardActionDelegateRoots.has(root)) return;
  focusCardActionDelegateRoots.add(root);
  root.addEventListener('click', handleFocusCardActionClick);
}

if (typeof document !== 'undefined') installFocusCardActionDelegates();

function focusCategoryInContext(data, catKey) {
  const group = data?.categories?.[catKey]?.group;
  return !group || isGroupInAIContext(group);
}

function getFocusFlaggedMarkers(data) {
  if (!isLabMarkersContextEnabled()) return [];
  return getAllFlaggedMarkers(data).filter(f => focusCategoryInContext(data, f.categoryKey));
}

export function renderFocusCard() {
  const cacheKey = profileStorageKey(state.currentProfile, 'focusCard');
  const cached = (() => { try { return JSON.parse(localStorage.getItem(cacheKey) || 'null'); } catch(e) { return null; } })();
  const fp = getFocusCardFingerprint();
  const text = (cached && cached.fingerprint === fp) ? cached.text : null;
  return `<div class="focus-card" id="focus-card">
    <div class="focus-card-icon">\uD83D\uDD2C</div>
    <div class="focus-card-body" id="focus-card-body">${text
      ? `<span class="focus-card-text">${applyInlineMarkdown(text)}</span>`
      : `<span class="focus-card-shimmer"></span>`}</div>
    <button class="focus-card-refresh" ${focusCardActionAttrs('refresh')} aria-label="Regenerate insight" title="Regenerate insight">\u21BB</button>
  </div>`;
}

export function buildFocusContext() {
  const data = getActiveData();
  if (!data.dates.length && !Object.values(data.categories).some(c => c.singleDate)) {
    return null;
  }
  if (!isLabMarkersContextEnabled()) return null;
  const sexLabel = state.profileSex === 'female' ? 'female' : state.profileSex === 'male' ? 'male' : 'not specified';
  const age = state.profileDob ? Math.floor((Date.now() - new Date(state.profileDob).getTime()) / (365.25 * 24 * 60 * 60 * 1000)) : null;
  const today = new Date().toISOString().slice(0, 10);
  const lastDate = data.dates[data.dates.length - 1];
  const includeInsightCards = isInsightContextCardsEnabled();
  const includeSupplementsMeds = isSupplementsMedsContextEnabled();
  let ctx = `Profile: ${sexLabel}${age !== null ? ', age ' + age : ''}, today ${today}, last labs ${lastDate}\n`;

  const healthGoals = state.importedData.healthGoals || [];
  if (includeInsightCards && healthGoals.length > 0) {
    const byPriority = { major: [], mild: [], minor: [] };
    for (const g of healthGoals) (byPriority[g.severity] || byPriority.minor).push(g.text);
    const parts = [];
    for (const [sev, items] of Object.entries(byPriority)) {
      if (items.length > 0) parts.push(`${sev}: ${items.join('; ')}`);
    }
    ctx += `Goals: ${parts.join(' | ')}\n`;
  }

  const interpretiveLens = state.importedData.interpretiveLens || '';
  if (interpretiveLens.trim()) {
    ctx += `Lens: ${interpretiveLens.trim()}\n`;
  }

  const diag = state.importedData.diagnoses;
  if (includeInsightCards && hasCardContent(diag)) {
    const conditions = (diag.conditions || []).map(c => `${c.name} (${c.severity})`);
    if (conditions.length > 0) ctx += `Conditions: ${conditions.join(', ')}\n`;
    if (diag.note) ctx += `Medical notes: ${diag.note}\n`;
  }

  const contextNotes = state.importedData.contextNotes || '';
  if (includeInsightCards && contextNotes.trim()) {
    ctx += `Notes for AI: ${contextNotes.trim()}\n`;
  }

  const flags = getFocusFlaggedMarkers(data);
  if (flags.length > 0) {
    ctx += `Flagged (${flags.length} total${flags.length > 15 ? ', showing top 15' : ''}):\n`;
    for (const f of flags.slice(0, 15)) {
      ctx += `- ${f.name}: ${f.value} ${f.unit} (${f.status}, ref ${f.effectiveMin}\u2013${f.effectiveMax})\n`;
    }
  }

  const allSupps = state.importedData.supplements || [];
  const supps = (data.dates?.length
    ? getSupplementsOverlappingRange(allSupps, data.dates[0], data.dates[data.dates.length - 1])
    : getCurrentSupplements(allSupps)).slice(0, 8);
  if (includeSupplementsMeds && supps.length > 0) {
    ctx += `Supplements:\n`;
    for (const s of supps) {
      const pds = [...getSupplementPeriods(s)].sort((a, b) => (a.start || '').localeCompare(b.start || ''));
      const dateRange = pds.length === 1
        ? `${pds[0].start} \u2192 ${pds[0].end || 'ongoing'}`
        : pds.map(p => `${p.start}\u2192${p.end || 'now'}`).join(', ');
      let timing = '';
      const firstStart = pds[0].start;
      if (lastDate && firstStart > lastDate) timing = ' (started AFTER last labs \u2014 cannot have affected these results)';
      else if (lastDate && data.dates.length >= 2 && firstStart > data.dates[data.dates.length - 2]) timing = ' (started between last two labs)';
      let impactNote = '';
      if (!timing && data.dates.length >= 2) {
        const impacts = computeAllImpacts(s, data);
        if (impacts && impacts.length > 0) {
          const top = impacts.slice(0, 2).filter(im => typeof im.pctChange === 'number' && im.confidence !== 'low');
          if (top.length > 0) {
            impactNote = ' \u2014 impacts: ' + top.map(im => {
              const pctChange = typeof im.pctChange === 'number' ? im.pctChange : 0;
              return `${im.markerName} ${pctChange > 0 ? '+' : ''}${pctChange.toFixed(1)}%`;
            }).join(', ');
          }
        }
      }
      ctx += `- ${s.name}${s.dosage ? ' (' + s.dosage + ')' : ''} [${s.type}]: ${dateRange}${timing}${impactNote}\n`;
    }
  }

  const changes = [];
  for (const [catKey, cat] of Object.entries(data.categories)) {
    if (!focusCategoryInContext(data, catKey)) continue;
    for (const [, m] of Object.entries(cat.markers)) {
      const nonNull = m.values.filter(v => v !== null);
      if (nonNull.length < 2) continue;
      const prev = nonNull[nonNull.length - 2];
      const last = nonNull[nonNull.length - 1];
      if (prev === 0) continue;
      const pct = Math.abs((last - prev) / prev * 100);
      if (pct > 20) {
        const dir = last > prev ? 'up' : 'down';
        const ref = m.refMin != null && m.refMax != null ? `, ref ${m.refMin}\u2013${m.refMax}` : '';
        const status = getStatus(last, m.refMin, m.refMax);
        changes.push(`${m.name}: ${prev} \u2192 ${last} ${m.unit || ''} (${dir} ${pct.toFixed(0)}%${ref}, ${status})`);
      }
    }
  }
  if (changes.length > 0) {
    ctx += `Notable changes:\n${changes.slice(0, 5).map(c => '- ' + c).join('\n')}\n`;
  }

  return ctx;
}

export async function loadFocusCard(opts = {}) {
  const el = document.getElementById('focus-card-body');
  if (!el) return;
  const refreshStale = opts.refreshStale !== false;
  const cacheKey = profileStorageKey(state.currentProfile, 'focusCard');
  const cached = (() => { try { return JSON.parse(localStorage.getItem(cacheKey) || 'null'); } catch(e) { return null; } })();
  const fp = getFocusCardFingerprint();
  if (cached && cached.text) {
    el.innerHTML = `<span class="focus-card-text">${applyInlineMarkdown(cached.text)}</span>`;
    // Hand-authored prefill (demo profiles only) ships without a
    // fingerprint; never auto-refresh. The manual refresh button still
    // works because refreshFocusCard clears the cache entirely.
    if (!cached.fingerprint) return;
    if (cached.fingerprint === fp || !hasAIProvider()) return;
    if (!refreshStale) return;
  }
  if (!hasAIProvider()) {
    if (!cached?.text) el.innerHTML = `<span class="focus-card-text" style="color:var(--text-muted)">Enable AI to generate insights</span>`;
    return;
  }
  el.innerHTML = `<span class="focus-card-text" style="color:var(--text-muted)">\uD83D\uDD0D Looking into your results\u2026</span>`;
  try {
    let ctx = buildFocusContext();
    if (!ctx) {
      el.innerHTML = `<span class="focus-card-text" style="color:var(--text-muted)">No insight available</span>`;
      return;
    }
    if (hasLens()) {
      const data = getActiveData();
      const includeInsightCards = isInsightContextCardsEnabled();
      const goals = includeInsightCards ? (state.importedData.healthGoals || []).map(g => g.text).slice(0, 3).join('; ') : '';
      const flags = getFocusFlaggedMarkers(data).slice(0, 5).map(f => f.name).join(', ');
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
- Only reference data provided below \u2014 never infer or assume
- Never attribute changes to supplements started after the last lab date
- CRITICAL: Output ONLY the insight text. No thinking, no reasoning, no "Let me analyze", no numbered analysis steps, no preamble. Start directly with your finding.`;

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
      consentKind: opts.userInitiated ? 'text' : 'automatic-insight',
      // A thinking model spends this 500-token cap on reasoning and finishes
      // with `length` before writing any content, leaving the card empty.
      reasoningEffort: 'none',
      onStream(text) {
        if (text.length < target.length) displayed = 0;
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
    const lines = trimmed.split('\n');
    const thinkingPattern = /^(Let me |I need to |I should |I'll |Key findings|The user |Looking at the|Now |First,|So |OK |Alright|\d+\.\s+\w+:)/i;
    let startIdx = 0;
    while (startIdx < lines.length && (thinkingPattern.test(lines[startIdx].trim()) || lines[startIdx].trim() === '')) startIdx++;
    if (startIdx > 0 && startIdx < lines.length) trimmed = lines.slice(startIdx).join('\n').trim();
    if (trimmed.length > 1500) { const cut = trimmed.slice(0, 1500).lastIndexOf('.'); if (cut > 100) trimmed = trimmed.slice(0, cut + 1); }
    if (trimmed) {
      localStorage.setItem(cacheKey, JSON.stringify({ fingerprint: fp, text: trimmed }));
      el.innerHTML = `<span class="focus-card-text">${applyInlineMarkdown(trimmed)}</span>`;
    } else {
      el.innerHTML = `<span class="focus-card-text" style="color:var(--text-muted)">No insight available</span>`;
    }
  } catch(e) {
    // Show why. The transport raises actionable messages here (e.g. a local
    // model spending its output budget on reasoning); collapsing them all to
    // "Could not load insight" sends people debugging the network instead.
    console.error('Focus card insight failed:', e);
    const reason = e instanceof Error && e.message ? e.message : '';
    el.innerHTML = `<span class="focus-card-text" style="color:var(--text-muted)">Could not load insight${reason ? ` — ${escapeHTML(reason)}` : ''}</span>`;
  }
}

export function refreshFocusCard() {
  const cacheKey = profileStorageKey(state.currentProfile, 'focusCard');
  localStorage.removeItem(cacheKey);
  loadFocusCard({ userInitiated: true });
}
