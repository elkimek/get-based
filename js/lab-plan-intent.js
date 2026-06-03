// lab-plan-intent.js — natural chat → actionable lab-test plan.
// This layer stays provider-agnostic: it extracts candidate markers from a
// normal health conversation, then the lab-order layer maps them to providers.

import { getMarkerCrosswalk, resolveMarkerAliases } from './lab-standards/marker-crosswalk.js';

const TEST_PLAN_PROMPTS = [
  'what should i test', 'what should i get tested', 'what to test', 'what labs',
  'what markers', 'which markers', 'next blood draw', 'next labs', 'next lab',
  'check next', 'test next', 'get tested next', 'vyšetřit', 'vysetrit',
  'jaké testy', 'jake testy', 'co otestovat', 'krevní testy', 'krevni testy',
];

const PANEL_MARKERS = Object.freeze({
  methylation: [
    ['coagulation.homocysteine', 'Homocysteine', 'Functional methylation marker.'],
    ['vitamins.folate', 'Folate', 'B9 status needed to interpret methylation support.'],
    ['vitamins.vitaminB12', 'Vitamin B12', 'Core B12 status marker.'],
    ['vitamins.holotranscobalamin', 'Holotranscobalamin / active B12', 'Active B12 can clarify usable B12 status.'],
  ],
  b12: [
    ['vitamins.vitaminB12', 'Vitamin B12', 'Core B12 status marker.'],
    ['vitamins.holotranscobalamin', 'Holotranscobalamin / active B12', 'Active B12 can clarify usable B12 status.'],
    ['coagulation.homocysteine', 'Homocysteine', 'Functional downstream marker affected by B12/folate.'],
    ['vitamins.folate', 'Folate', 'B12 interpretation is incomplete without folate context.'],
  ],
});

function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function markerDisplayName(markerKey) {
  return getMarkerCrosswalk(markerKey)?.canonicalName || markerKey.split('.').pop() || markerKey;
}

function mentionsTestPlan(text) {
  const normalized = normalize(text);
  return TEST_PLAN_PROMPTS.some(term => normalized.includes(normalize(term)));
}

function addMarker(out, markerKey, opts = {}) {
  if (!markerKey || out.has(markerKey)) return;
  out.set(markerKey, {
    markerKey,
    displayName: opts.displayName || markerDisplayName(markerKey),
    reason: opts.reason || 'Mentioned in the health conversation.',
    priority: opts.priority || 'core',
    confidence: opts.confidence || 'conversation_derived',
  });
}

function inferPanelMarkers(text, out) {
  const normalized = normalize(text);
  if (normalized.includes('methylation') || normalized.includes('homocysteine') || normalized.includes('folate')) {
    for (const [markerKey, displayName, reason] of PANEL_MARKERS.methylation) {
      addMarker(out, markerKey, { displayName, reason, confidence: 'context_template' });
    }
  }
  if (normalized.includes('b12') || normalized.includes('cobalamin') || normalized.includes('kobalamin')) {
    for (const [markerKey, displayName, reason] of PANEL_MARKERS.b12) {
      addMarker(out, markerKey, { displayName, reason, confidence: 'context_template' });
    }
  }
}

function extractMentionedMarkers(text, out) {
  const raw = String(text || '');
  for (const token of raw.split(/[^\p{L}\p{N}]+/u).filter(Boolean)) {
    resolveMarkerAliases(token).forEach(markerKey => addMarker(out, markerKey));
  }
  resolveMarkerAliases(raw).forEach(markerKey => addMarker(out, markerKey));
}

export function buildLabPlanFromConversation(userText, assistantText = '') {
  const combined = `${userText || ''}\n${assistantText || ''}`;
  const userAskedForPlan = mentionsTestPlan(userText);
  const out = new Map();
  extractMentionedMarkers(combined, out);
  inferPanelMarkers(combined, out);
  const markers = [...out.values()];
  if (!userAskedForPlan || !markers.length) return null;
  return {
    id: `labplan_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    status: 'suggested',
    title: markers.length > 4 ? 'Suggested next lab plan' : 'Suggested focused lab plan',
    source: 'conversation',
    userPrompt: String(userText || ''),
    markers,
    safetyBoundary: 'This is a test plan, not a diagnosis. Compare labs only after you review/edit the marker list.',
    nextAction: 'compare_labs',
  };
}
