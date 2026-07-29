// @ts-check
// Lab-context summaries, change narration, and Lens prompt injection.

import { state } from './state.js';
import { getActiveData } from './data.js';
import { getAllFlaggedMarkers } from './marker-analysis.js';
import { getLatitudeFromLocation } from './profile.js';
import {
  isInsightContextCardsEnabled,
  isLabMarkersContextEnabled,
  isLightSunContextEnabled,
  isSupplementsMedsContextEnabled,
} from './lab-context-settings.js';

export function summarizeChange(prev, curr) {
  if (prev == null && curr == null) return null;
  if (prev == null) return 'added';
  if (curr == null) return 'cleared';
  if (typeof curr === 'string' || typeof prev === 'string') {
    const previous = (prev || '').toString().slice(0, 60);
    const current = (curr || '').toString().slice(0, 60);
    if (previous === current) return null;
    return `changed${previous ? ' (was: "' + previous + (prev.length > 60 ? '…' : '') + '")' : ''}`;
  }
  if (Array.isArray(curr)) {
    const previousLength = Array.isArray(prev) ? prev.length : 0;
    if (curr.length > previousLength) {
      const added = curr.slice(previousLength).map(goal => goal.text || JSON.stringify(goal)).join(', ');
      return `added: ${added}`;
    }
    if (curr.length < previousLength) {
      const removed = previousLength - curr.length;
      return `removed ${removed} item${removed > 1 ? 's' : ''}`;
    }
    return 'updated';
  }
  const changes = [];
  const allKeys = new Set([...Object.keys(prev || {}), ...Object.keys(curr || {})]);
  for (const key of allKeys) {
    if (key === 'note') continue;
    const previousValue = prev?.[key];
    const currentValue = curr?.[key];
    if (JSON.stringify(previousValue) === JSON.stringify(currentValue)) continue;
    if (previousValue == null || (Array.isArray(previousValue) && previousValue.length === 0)) {
      const value = Array.isArray(currentValue) ? currentValue.join(', ') : currentValue;
      changes.push(`${key}: ${value}`);
    } else if (currentValue == null || (Array.isArray(currentValue) && currentValue.length === 0)) {
      changes.push(`${key}: removed`);
    } else {
      const value = Array.isArray(currentValue) ? currentValue.join(', ') : currentValue;
      const old = Array.isArray(previousValue) ? previousValue.join(', ') : previousValue;
      changes.push(`${key}: ${old} → ${value}`);
    }
  }
  return changes.length > 0
    ? changes.slice(0, 5).join('; ') + (changes.length > 5 ? '; …' : '')
    : null;
}

export function getContextSummary() {
  const areas = [];
  const data = getActiveData();
  const includeInsightCards = isInsightContextCardsEnabled();
  const includeSupplementsMeds = isSupplementsMedsContextEnabled();
  const markerCount = Object.values(data.categories).reduce((sum, category) =>
    sum + Object.values(category.markers).filter(marker =>
      marker.values.some(value => value !== null)).length, 0);
  if (isLabMarkersContextEnabled() && markerCount > 0) {
    areas.push({ label: 'Lab values', detail: `${markerCount} markers` });
  }
  const diagnoses = state.importedData.diagnoses;
  if (includeInsightCards && diagnoses && (
    (diagnoses.conditions && diagnoses.conditions.length)
    || diagnoses.note
    || (Array.isArray(diagnoses.familyHistory) && diagnoses.familyHistory.length)
  )) {
    const conditionCount = (diagnoses.conditions && diagnoses.conditions.length) || 0;
    const familyCount = (Array.isArray(diagnoses.familyHistory) && diagnoses.familyHistory.length) || 0;
    const detail = conditionCount && familyCount
      ? `${conditionCount} condition${conditionCount !== 1 ? 's' : ''}, ${familyCount} family entr${familyCount !== 1 ? 'ies' : 'y'}`
      : conditionCount
        ? `${conditionCount} condition${conditionCount !== 1 ? 's' : ''}`
        : familyCount
          ? `${familyCount} family entr${familyCount !== 1 ? 'ies' : 'y'}`
          : 'notes';
    areas.push({ label: 'Medical History', detail });
  }
  if (includeInsightCards && state.importedData.diet) {
    areas.push({ label: 'Diet & Digestion', detail: state.importedData.diet.type || 'filled' });
  }
  if (includeInsightCards && state.importedData.exercise) {
    areas.push({ label: 'Exercise', detail: state.importedData.exercise.frequency || 'filled' });
  }
  if (includeInsightCards && state.importedData.sleepRest) {
    areas.push({ label: 'Sleep & Rest', detail: state.importedData.sleepRest.duration || 'filled' });
  }
  const lightCircadian = state.importedData.lightCircadian;
  const autoLatitude = getLatitudeFromLocation();
  if (isLightSunContextEnabled() && (lightCircadian || autoLatitude)) {
    areas.push({ label: 'Light & Circadian', detail: autoLatitude ? `lat ${autoLatitude}` : 'filled' });
  }
  if (includeInsightCards && state.importedData.stress) {
    areas.push({ label: 'Stress', detail: state.importedData.stress.level || 'filled' });
  }
  if (includeInsightCards && state.importedData.loveLife) {
    areas.push({ label: 'Love Life', detail: 'filled' });
  }
  if (includeInsightCards && state.importedData.environment) {
    areas.push({ label: 'Environment', detail: state.importedData.environment.setting || 'filled' });
  }
  const emfData = state.importedData.emfAssessment;
  if (includeInsightCards && emfData?.assessments?.length > 0) {
    areas.push({
      label: 'EMF Assessment',
      detail: `${emfData.assessments.length} assessment${emfData.assessments.length !== 1 ? 's' : ''}`,
    });
  }
  const goals = state.importedData.healthGoals || [];
  if (includeInsightCards && goals.length > 0) {
    areas.push({ label: 'Health Goals', detail: `${goals.length} goal${goals.length !== 1 ? 's' : ''}` });
  }
  const lens = state.importedData.interpretiveLens || '';
  if (lens.trim()) areas.push({ label: 'Interpretive Lens', detail: 'set' });
  const contextNotes = state.importedData.contextNotes || '';
  if (includeInsightCards && contextNotes.trim()) {
    areas.push({ label: 'Context Notes', detail: 'set' });
  }
  const cycle = state.importedData.menstrualCycle;
  if (includeInsightCards && cycle && state.profileSex === 'female') {
    areas.push({ label: 'Menstrual Cycle', detail: `${cycle.cycleLength || 28}-day` });
  }
  const supplements = state.importedData.supplements || [];
  if (includeSupplementsMeds && supplements.length > 0) {
    areas.push({
      label: 'Supplements',
      detail: `${supplements.length} item${supplements.length !== 1 ? 's' : ''}`,
    });
  }
  const notes = state.importedData.notes || [];
  if (includeInsightCards && notes.length > 0) {
    areas.push({ label: 'User Notes', detail: `${notes.length} note${notes.length !== 1 ? 's' : ''}` });
  }
  const flags = getAllFlaggedMarkers(data);
  if (isLabMarkersContextEnabled() && flags.length > 0) {
    areas.push({ label: 'Flagged Results', detail: `${flags.length} flagged` });
  }
  return areas;
}

const LENS_PROMPT_CHUNK_CHAR_LIMIT = 1800;
const LENS_PROMPT_CHUNK_TOTAL_LIMIT = 8000;

function trimLensTextForPrompt(text, remainingBudget) {
  const raw = String(text || '').replace(/\s+/g, ' ').trim();
  if (!raw) return '';
  const limit = Math.max(0, Math.min(LENS_PROMPT_CHUNK_CHAR_LIMIT, remainingBudget));
  if (limit === 0) return '';
  if (raw.length <= limit) return raw;
  const suffix = '... [trimmed]';
  if (limit <= suffix.length) return raw.slice(0, limit);
  return raw.slice(0, limit - suffix.length).trimEnd() + suffix;
}

export function injectLensChunks(context, lensResult) {
  if (!lensResult || !Array.isArray(lensResult.chunks) || !lensResult.chunks.length) return context;
  const snippet = formatLensChunks(lensResult);
  const openTag = '[section:interpretiveLens]';
  const closeTag = '[/section:interpretiveLens]';
  const closeIndex = context.indexOf(closeTag);
  if (closeIndex !== -1) {
    return context.slice(0, closeIndex) + '\n\n' + snippet + '\n' + context.slice(closeIndex);
  }
  const block = `${openTag}\n## Interpretive Lens\n${snippet}\n${closeTag}\n\n`;
  return block + context;
}

function formatLensChunks(result) {
  const lines = [`### Retrieved from your knowledge source (${result.sourceName || 'Lens'}):`];
  let remainingBudget = LENS_PROMPT_CHUNK_TOTAL_LIMIT;
  let index = 1;
  result.chunks.forEach(chunk => {
    if (remainingBudget <= 0) return;
    const text = trimLensTextForPrompt(chunk.text, remainingBudget);
    if (!text) return;
    remainingBudget -= text.length;
    const citation = chunk.source ? ` - ${chunk.source}` : '';
    lines.push(`${index++}. ${text}${citation}`);
  });
  lines.push('When your interpretation draws on these excerpts, cite the source. When it does not, say so.');
  return lines.join('\n');
}
