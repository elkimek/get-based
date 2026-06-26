// @ts-check
// agent-tools.js — schema-shaped app tools for the browser-local getbased agent

import { state } from './state.js';
import { saveImportedData } from './data.js';
import { appendImportedArrayItem, replaceImportedArrayItem } from './data-merge.js';

/** @type {Record<string, string>} */
const MARKER_LABELS = {
  'lipids.ldl': 'LDL',
  'lipids.hdl': 'HDL',
  'lipids.triglycerides': 'Triglycerides',
  'inflammation.crp': 'CRP',
  'inflammation.hscrp': 'hs-CRP',
  'thyroid.tsh': 'TSH',
  'iron.ferritin': 'Ferritin',
  'glucose.glucose': 'Glucose',
  'diabetes.glucose': 'Glucose',
  'diabetes.insulin': 'Insulin',
  'diabetes.homaIR': 'HOMA-IR',
};

/** @param {{ importedData?: any }} [opts] */
function importedFrom(opts = {}) {
  return opts.importedData || state.importedData || {};
}

/** @param {any} importedData */
function entriesFrom(importedData) {
  return Array.isArray(importedData?.entries) ? importedData.entries.slice() : [];
}

/** @param {Array<any>} entries */
function sortEntriesByDate(entries) {
  return entries
    .filter(e => e && typeof e.date === 'string' && e.markers && typeof e.markers === 'object')
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

/** @param {string} key */
export function markerLabel(key) {
  if (MARKER_LABELS[key]) return MARKER_LABELS[key];
  const tail = String(key || '').split('.').pop() || String(key || '');
  return tail
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

/** @param {any} value */
function numericValue(value) {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/** @param {number} previous @param {number} latest */
function percentChange(previous, latest) {
  if (!Number.isFinite(previous) || previous === 0) return null;
  return ((latest - previous) / Math.abs(previous)) * 100;
}

/** @param {string} value */
function titleCaseName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/** @param {string} value */
function normalizeNameKey(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/** @param {string} today @param {string} phrase */
function resolveDatePhrase(today, phrase) {
  const base = /^\d{4}-\d{2}-\d{2}$/.test(today || '') ? new Date(`${today}T00:00:00Z`) : new Date();
  const text = String(phrase || '').toLowerCase();
  let days = 0;
  if (/last\s+week|a\s+week\s+ago/.test(text)) days = 7;
  else if (/yesterday/.test(text)) days = 1;
  else if (/last\s+month|a\s+month\s+ago/.test(text)) days = 30;
  base.setUTCDate(base.getUTCDate() - days);
  return base.toISOString().slice(0, 10);
}

/** @param {string} raw */
function parseStartedSupplement(raw) {
  const trimmed = String(raw || '').trim().replace(/[.,;]+$/, '');
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  const nameWords = [];
  let dosage = '';
  let schedule = '';
  for (const word of words) {
    if (/^\d+(?:[.,]\d+)?\s*(?:mg|g|mcg|µg|μg|iu|ml|caps?|tablets?|tabs?)$/i.test(word)) {
      dosage = word.replace(',', '.');
      continue;
    }
    if (/^(daily|nightly|weekly|monthly|morning|evening|am|pm)$/i.test(word)) {
      schedule = word.toLowerCase();
      continue;
    }
    if (/^(and|plus|with)$/i.test(word)) continue;
    if (!dosage && !schedule) nameWords.push(word);
  }
  const name = titleCaseName(nameWords.join(' '));
  return name ? { name, dosage, schedule } : null;
}

/** @param {string} raw */
function parseStoppedSupplement(raw) {
  const cleaned = String(raw || '').trim().replace(/[.,;]+$/, '').replace(/\b(last|this|week|month|today|yesterday)\b.*$/i, '').trim();
  return cleaned ? { name: titleCaseName(cleaned) } : null;
}

/** @param {any} proposal */
function summarizeSupplementProposal(proposal) {
  const bits = [];
  for (const change of proposal?.changes || []) {
    if (change.action === 'add_or_update') bits.push(`add ${change.name}`);
    if (change.action === 'end') bits.push(`stop ${change.name}`);
  }
  return bits.length ? bits.join('; ') : 'No supplement changes';
}

/** @param {{ importedData?: any }} [opts] */
export function getAgentProfileSnapshot(opts = {}) {
  const importedData = importedFrom(opts);
  const entries = entriesFrom(importedData);
  return {
    labEntryCount: entries.length,
    latestLabDate: sortEntriesByDate(entries).at(-1)?.date || null,
    supplementCount: Array.isArray(importedData.supplements) ? importedData.supplements.length : 0,
    healthGoalCount: Array.isArray(importedData.healthGoals) ? importedData.healthGoals.length : 0,
    hasBiologyScoreContextReview: !!importedData.biologyScoreContextAI?.updatedAt,
    hasWearableSummary: !!importedData.wearableSummary,
    hasGenetics: !!(importedData.genetics && Object.keys(importedData.genetics.snps || {}).length),
  };
}

/** @param {{ importedData?: any }} [opts] */
export function compareLatestLabEntries(opts = {}) {
  const importedData = importedFrom(opts);
  const entries = sortEntriesByDate(entriesFrom(importedData));
  const latest = entries.at(-1) || null;
  const previous = entries.length > 1 ? entries.at(-2) : null;
  if (!latest || !previous) {
    return {
      latestDate: latest?.date || null,
      previousDate: previous?.date || null,
      changedMarkers: [],
      addedMarkers: latest ? Object.entries(latest.markers || {}).map(([key, value]) => ({ key, label: markerLabel(key), value })) : [],
      removedMarkers: [],
      hasEnoughData: false,
    };
  }
  const latestMarkers = latest.markers || {};
  const previousMarkers = previous.markers || {};
  const changedMarkers = [];
  const addedMarkers = [];
  const removedMarkers = [];
  for (const [key, latestRaw] of Object.entries(latestMarkers)) {
    if (!(key in previousMarkers)) {
      addedMarkers.push({ key, label: markerLabel(key), value: latestRaw });
      continue;
    }
    const latestValue = numericValue(latestRaw);
    const previousValue = numericValue(previousMarkers[key]);
    if (latestValue == null || previousValue == null || latestValue === previousValue) continue;
    const pct = percentChange(previousValue, latestValue);
    changedMarkers.push({
      key,
      label: markerLabel(key),
      previousValue,
      latestValue,
      delta: latestValue - previousValue,
      percentChange: pct,
      direction: latestValue > previousValue ? 'up' : 'down',
    });
  }
  for (const [key, value] of Object.entries(previousMarkers)) {
    if (!(key in latestMarkers)) removedMarkers.push({ key, label: markerLabel(key), value });
  }
  changedMarkers.sort((a, b) => Math.abs(b.percentChange ?? b.delta) - Math.abs(a.percentChange ?? a.delta));
  addedMarkers.sort((a, b) => a.label.localeCompare(b.label));
  removedMarkers.sort((a, b) => a.label.localeCompare(b.label));
  return {
    latestDate: latest.date,
    previousDate: previous.date,
    changedMarkers,
    addedMarkers,
    removedMarkers,
    hasEnoughData: true,
  };
}

/** @param {string} text @param {{ importedData?: any, today?: string }} [opts] */
export function draftSupplementChangeProposal(text, opts = {}) {
  const today = opts.today || new Date().toISOString().slice(0, 10);
  const sourceText = String(text || '');
  const changes = [];
  const startedRe = /\b(?:started|added|began|begin|taking)\s+([a-z0-9µμ .,+_-]+?)(?=\s+and\s+(?:stopped|quit|removed|discontinued|started|added|began|taking)\b|[.;]|$)/ig;
  const stoppedRe = /\b(?:stopped|quit|removed|discontinued)\s+([a-z0-9µμ .,+_-]+?)(?=\s+and\s+(?:stopped|quit|removed|discontinued|started|added|began|taking)\b|[.;]|$)/ig;
  let match;
  while ((match = startedRe.exec(sourceText))) {
    const parsed = parseStartedSupplement(match[1]);
    if (!parsed) continue;
    changes.push({
      action: 'add_or_update',
      surface: 'supplements',
      name: parsed.name,
      dosage: parsed.dosage,
      schedule: parsed.schedule,
      startDate: resolveDatePhrase(today, sourceText),
    });
  }
  while ((match = stoppedRe.exec(sourceText))) {
    const parsed = parseStoppedSupplement(match[1]);
    if (!parsed) continue;
    changes.push({
      action: 'end',
      surface: 'supplements',
      name: parsed.name,
      endDate: resolveDatePhrase(today, sourceText),
    });
  }
  if (!changes.length) return null;
  return {
    id: `agent_proposal_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    surface: 'supplements',
    mode: 'record-context-change',
    requiresConfirmation: true,
    status: 'pending',
    sourceText,
    changes,
    summary: summarizeSupplementProposal({ changes }),
  };
}

/** @param {any} proposal @param {Record<string, Record<string, string>>} edits */
export function reviseSupplementChangeProposal(proposal, edits = {}) {
  if (!proposal || !Array.isArray(proposal.changes)) return proposal;
  const allowed = new Set(['name', 'dosage', 'schedule', 'startDate', 'endDate']);
  return {
    ...proposal,
    status: proposal.status === 'applied' ? proposal.status : 'pending',
    changes: proposal.changes.map((change, idx) => {
      const patch = edits[String(idx)] || edits[idx] || {};
      const next = { ...change };
      for (const [key, value] of Object.entries(patch)) {
        if (!allowed.has(key)) continue;
        const trimmed = String(value ?? '').trim();
        if (key === 'name') next[key] = titleCaseName(trimmed);
        else next[key] = trimmed;
      }
      return next;
    }),
  };
}

/** @param {any} proposal @param {{ importedData?: any, now?: number, save?: boolean }} [opts] */
export async function applySupplementChangeProposal(proposal, opts = {}) {
  if (!proposal || proposal.surface !== 'supplements' || !Array.isArray(proposal.changes)) {
    throw new Error('Invalid supplement proposal');
  }
  const importedData = importedFrom(opts);
  if (!Array.isArray(importedData.supplements)) importedData.supplements = [];
  if (!Array.isArray(importedData.changeHistory)) importedData.changeHistory = [];
  const now = Number.isFinite(opts.now) ? opts.now : Date.now();
  const applied = [];
  for (const change of proposal.changes) {
    const idx = importedData.supplements.findIndex(s => normalizeNameKey(s?.name) === normalizeNameKey(change.name));
    if (change.action === 'add_or_update') {
      const existing = idx >= 0 ? importedData.supplements[idx] : null;
      const next = {
        ...(existing || {}),
        name: change.name,
        dosage: change.dosage || existing?.dosage || '',
        type: existing?.type || 'supplement',
        note: existing?.note || '',
        startDate: change.startDate || existing?.startDate || new Date(now).toISOString().slice(0, 10),
        updatedAt: now,
      };
      if (existing?.endDate && existing.endDate < (change.startDate || '')) next.endDate = existing.endDate;
      if (change.schedule) next.schedule = change.schedule;
      if (idx >= 0) replaceImportedArrayItem(importedData, 'supplements', idx, next);
      else appendImportedArrayItem(importedData, 'supplements', next);
      applied.push(`Added/updated ${change.name}`);
    } else if (change.action === 'end') {
      if (idx >= 0) {
        const existing = importedData.supplements[idx];
        replaceImportedArrayItem(importedData, 'supplements', idx, { ...existing, endDate: change.endDate, updatedAt: now });
        applied.push(`Stopped ${change.name}`);
      } else {
        const next = { name: change.name, dosage: '', type: 'supplement', startDate: '', endDate: change.endDate, note: 'Added by agent from a stopped-supplement note.', updatedAt: now };
        appendImportedArrayItem(importedData, 'supplements', next);
        applied.push(`Recorded stopped ${change.name}`);
      }
    }
  }
  importedData.changeHistory.push({
    source: 'agent',
    mode: proposal.mode || 'record-context-change',
    proposalId: proposal.id || null,
    surface: 'supplements',
    summary: applied.join('; ') || summarizeSupplementProposal(proposal),
    confirmedByUser: true,
    timestamp: now,
  });
  if (opts.save !== false) await saveImportedData({ immediate: true });
  return { status: 'applied', applied };
}

export function getAgentToolRegistry() {
  return [
    { id: 'get_profile_context', writeLevel: 'read-only', description: 'Summarize profile/data availability for agent routing.' },
    { id: 'compare_latest_labs', writeLevel: 'read-only', description: 'Compare the latest lab entry with the previous lab entry.' },
    { id: 'draft_supplement_change', writeLevel: 'draft-only', requiresConfirmation: true, description: 'Draft supplement/med changes from a user message without mutating data.' },
    { id: 'apply_supplement_change', writeLevel: 'write', requiresConfirmation: true, description: 'Apply a confirmed supplement/med proposal and record an audit trail.' },
    { id: 'open_labs_view', writeLevel: 'navigation', description: 'Open the Labs view; no data writes.' },
    { id: 'draft_lab_plan', writeLevel: 'draft-only', requiresConfirmation: true, description: 'Draft a lab plan in chat; requires explicit user confirmation before saving/sending anywhere.' },
  ];
}
