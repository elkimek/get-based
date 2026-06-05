// lab-plan-ai.js — AI-powered thread → reasoned lab plan conversion.

import { callClaudeAPI, getActiveModelDisplay, getActiveModelId, getAIProvider, hasAIProvider, isAIPaused } from './api.js';
import { buildLabContext } from './lab-context.js';
import { buildSummaryTranscript } from './chat-summaries.js';
import { buildLabPlanFromConversation } from './lab-plan-intent.js';
import { resolveMarkerAliases, getMarkerCrosswalk } from './lab-standards/marker-crosswalk.js';

export const LAB_PLAN_AI_SYSTEM_PROMPT = `You are a careful lab-planning assistant inside getbased.

Task: turn a health conversation into a provider-agnostic, reasoned lab plan.

Return ONLY JSON. No markdown, no prose outside JSON.

JSON shape:
{
  "title": "short plan title",
  "rationale": "2-4 sentence logic for why this panel fits the conversation",
  "tests": [
    {
      "name": "lab test name",
      "reason": "why each test belongs for this user/context",
      "priority": "core" | "optional" | "follow_up"
    }
  ]
}

Rules:
- Recommend tests only when they are supported by the recent conversation/profile context.
- Treat PROFILE / LAB CONTEXT as background for interpretation, not as a reason to invent a plan by itself.
- Anchor the plan on the latest health/lab-related user request and the assistant response around it; ignore older unrelated turns.
- If the latest exchange is not health/lab/biomarker-related and the conversation does not contain an active lab-planning request, return an empty tests array.
- Prefer a coherent, minimal plan over a huge shopping list, but do not omit required companion markers for interpretation.
- If the latest user request explicitly lists named tests/markers to check or asks whether a provider can cover those named tests, treat that list as CLOSED: preserve the listed tests and do not add companion markers, panel defaults, or older-profile additions unless the user explicitly asks to expand it.
- Separate core tests from optional/follow-up tests.
- Include unmapped/specialist tests if clinically/logically relevant; getbased will mark missing provider mapping honestly.
- Do not create a provider cart. Do not choose Labshop/Unilabs. This is plan-first only.
- Keep the plan practical for a next blood draw.
- Avoid diagnosis claims; explain testing logic.

Panel consistency guardrails:
- If you include fasting insulin, also include fasting glucose unless the user explicitly asks to exclude glucose. Insulin without glucose is incomplete for HOMA-IR / insulin-resistance interpretation.
- If you include HOMA-IR, include fasting glucose and fasting insulin as separate tests; HOMA-IR itself is calculated after results.
- Metabolic / glycemic context usually means fasting glucose, fasting insulin, HbA1c, triglycerides, and HDL cholesterol. Keep all as core unless the request is deliberately narrower.
- Male hormone / testosterone context usually means total testosterone, free testosterone or calculated free testosterone, SHBG, LH, FSH, estradiol, and prolactin. Add DHEA-S when energy/adrenal/androgen context is relevant.
- Thyroid tests belong in a male-hormone/metabolic plan only when the latest request or profile context makes energy/thyroid status part of the question; otherwise keep them optional or omit them.
- Morning cortisol is optional/follow-up unless the latest request specifically asks for cortisol, adrenal rhythm, stress-axis, sleep-wake timing, or morning energy context.
- Do not replace metabolic companion markers with broader energy markers. For example, if the rationale mentions glucose/insulin, the tests must include fasting glucose.`;

function normalizeText(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function stripCodeFence(text) {
  return String(text || '').replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
}

export function extractJSONFromAIText(text) {
  const raw = stripCodeFence(text);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch {}
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try { return JSON.parse(raw.slice(start, end + 1)); } catch { return null; }
}

function readTests(payload) {
  if (!payload || typeof payload !== 'object') return [];
  const tests = Array.isArray(payload.tests) ? payload.tests : [];
  return tests.map(item => {
    if (typeof item === 'string') return { name: item, reason: '', priority: 'core' };
    if (!item || typeof item !== 'object') return null;
    const name = String(item.name || item.test || item.marker || '').trim();
    if (!name) return null;
    const priority = ['core', 'optional', 'follow_up'].includes(item.priority) ? item.priority : 'core';
    return {
      name,
      reason: String(item.reason || item.why || '').trim(),
      priority,
    };
  }).filter(Boolean);
}

function compactText(text) {
  return normalizeText(text).replace(/\s+/g, '');
}

function tokensEquivalent(a, b) {
  const aTokens = normalizeText(a).split(/\s+/).filter(Boolean);
  const bTokens = normalizeText(b).split(/\s+/).filter(Boolean);
  if (!aTokens.length || !bTokens.length) return false;
  const aSet = new Set(aTokens);
  const bSet = new Set(bTokens);
  return aTokens.every(token => bSet.has(token)) || bTokens.every(token => aSet.has(token));
}

function findAIItemForMarker(marker, items) {
  const markerName = normalizeText(marker.displayName || marker.markerKey || '');
  const markerLeaf = normalizeText(String(marker.markerKey || '').split('.').pop());
  const compactMarkerName = compactText(marker.displayName || marker.markerKey || '');
  const compactMarkerLeaf = compactText(String(marker.markerKey || '').split('.').pop());
  return items.find(item => {
    const itemName = normalizeText(item.name);
    const compactItemName = compactText(item.name);
    const aliasKeys = resolveMarkerAliases(item.name);
    return itemName && (
      aliasKeys.includes(marker.markerKey) ||
      itemName === markerName ||
      itemName === markerLeaf ||
      markerName.includes(itemName) ||
      itemName.includes(markerName) ||
      markerLeaf.includes(itemName) ||
      itemName.includes(markerLeaf) ||
      compactItemName === compactMarkerName ||
      compactItemName === compactMarkerLeaf ||
      tokensEquivalent(item.name, marker.displayName || marker.markerKey || '') ||
      tokensEquivalent(item.name, String(marker.markerKey || '').split('.').pop()) ||
      compactMarkerName.includes(compactItemName) ||
      compactItemName.includes(compactMarkerName) ||
      compactMarkerLeaf.includes(compactItemName) ||
      compactItemName.includes(compactMarkerLeaf)
    );
  }) || null;
}

const AI_PANEL_MARKER_KEYS = Object.freeze([
  {
    pattern: /\b(?:thyroid|stitna zlaza)\b.*\bpanel\b|\bpanel\b.*\b(?:thyroid|stitna zlaza)\b|\bfull\s+thyroid\b/,
    markerKeys: ['thyroid.tsh', 'thyroid.freeT4', 'thyroid.freeT3'],
  },
  {
    pattern: /\b(?:cbc|complete blood count|full blood count)\b.*\b(?:diff|differential)?\b|\b(?:blood count|hematology)\b.*\bpanel\b/,
    markerKeys: ['hematology.cbcDiff'],
  },
  {
    pattern: /\b(?:male hormone|testosterone|androgen)\b.*\bpanel\b|\bpanel\b.*\b(?:male hormone|testosterone|androgen)\b/,
    markerKeys: [
      'hormones.totalTestosterone',
      'hormones.freeTestosterone',
      'hormones.shbg',
      'hormones.lh',
      'hormones.fsh',
      'hormones.estradiol',
      'hormones.prolactin',
    ],
  },
]);

function panelMarkersForAIItem(item) {
  const normalized = normalizeText(item?.name || '');
  if (!normalized) return [];
  const match = AI_PANEL_MARKER_KEYS.find(entry => entry.pattern.test(normalized));
  if (!match) return [];
  return match.markerKeys.map(markerKey => markerFromKey(markerKey, [], {
    reason: item.reason || 'Expanded from the AI-proposed panel name.',
    priority: item.priority || 'core',
    confidence: 'ai_panel_expanded_mapped',
  }));
}

function splitExplicitMarkerList(text) {
  const raw = String(text || '')
    .replace(/\b(?:can|could)\s+(?:labshop|unilabs|labs?)\s+cover\s+these\??/gi, '')
    .replace(/\b(?:build|turn)\b[^\n]*\b(?:labshop|lab plan|order|panel)\b[^\n]*/gi, '')
    .replace(/^[^:]*?:\s*/, '');
  return raw
    .split(/,|;|\+|\s+and\s+/i)
    .map(part => part
      .replace(/^\s*(?:i\s+want|i'd\s+like|include|check|test|order|for)\s+/i, '')
      .replace(/\b(?:please|thanks|can labshop cover these|can labs cover these)\b/gi, '')
      .trim())
    .filter(Boolean);
}

function explicitMarkerKeysFromText(text) {
  const keys = [];
  for (const candidate of splitExplicitMarkerList(text)) {
    const normalizedCandidate = normalizeText(candidate);
    const resolved = /^(psa|psa total|total psa)$/.test(normalizedCandidate)
      ? ['prostate.psa']
      : resolveMarkerAliases(candidate);
    for (const markerKey of resolved) {
      if (!keys.includes(markerKey)) keys.push(markerKey);
    }
  }
  return keys;
}

function isClosedMarkerListRequest(content) {
  const normalized = normalizeText(content);
  if (!normalized) return false;
  if (/\b(?:last|previous|prior|already|before|month|week|year)\b.*\b(?:tested|checked|measured|had)\b/.test(normalized)) return false;
  if (/\b(?:tested|checked|measured|had)\b.*\b(?:last|previous|prior|already|before|month|week|year)\b/.test(normalized)) return false;
  return /\b(?:want|need|include|order|build|turn|compare|cover|check|test|tests|labs|labshop|unilabs|panel|blood draw|bloodwork|blood work)\b/.test(normalized);
}

export function closedMarkerKeysFromHistory(history = []) {
  const userMessages = (Array.isArray(history) ? history : [])
    .filter(msg => msg?.role === 'user' && typeof msg.content === 'string')
    .map(msg => msg.content)
    .reverse();

  for (const content of userMessages) {
    if (!isClosedMarkerListRequest(content)) continue;
    if (!/[;,]|\s+and\s+/i.test(content)) continue;
    const keys = explicitMarkerKeysFromText(content);
    // Four or more explicit markers is a strong signal that the user gave a
    // closed list. Keep this high enough to avoid blocking normal broad asks.
    if (keys.length >= 4) return keys;
  }
  return [];
}

function markerFromKey(markerKey, aiMarkers = [], fallback = {}) {
  const existing = aiMarkers.find(marker => marker.markerKey === markerKey);
  if (existing) return existing;
  const crosswalk = getMarkerCrosswalk(markerKey);
  return {
    markerKey,
    displayName: crosswalk?.canonicalName || markerKey.split('.').pop() || markerKey,
    reason: fallback.reason || 'Explicitly listed in the latest user request.',
    priority: fallback.priority || 'core',
    confidence: fallback.confidence || 'explicit_user_list_mapped',
  };
}

export function applyClosedMarkerList(plan, closedMarkerKeys = []) {
  if (!plan || !closedMarkerKeys.length) return plan;
  const markers = closedMarkerKeys.map(markerKey => markerFromKey(markerKey, plan.markers));
  return {
    ...plan,
    markers,
    rationale: plan.rationale
      ? `${plan.rationale} Closed-list filter applied: only markers explicitly listed by the user were kept.`
      : 'Closed-list filter applied: only markers explicitly listed by the user were kept.',
  };
}

function latestSubstantiveUserText(history = []) {
  const userMessages = (Array.isArray(history) ? history : [])
    .filter(msg => msg?.role === 'user' && typeof msg.content === 'string')
    .map(msg => msg.content.trim())
    .filter(Boolean)
    .reverse();
  return userMessages.find(text => !/^\s*(?:build|turn)\b.*\b(?:plan|order|labshop|panel)\b/i.test(text)) || userMessages[0] || '';
}

function appendGuardrailMarker(markers, markerKey, reason) {
  if (markers.some(marker => marker.markerKey === markerKey)) return markers;
  return [...markers, markerFromKey(markerKey, markers, {
    reason,
    priority: 'core',
    confidence: 'guardrail_inferred_companion',
  })];
}

function appendGuardrailMarkers(markers, markerKeys, reason) {
  return markerKeys.reduce((acc, markerKey) => appendGuardrailMarker(acc, markerKey, reason), markers);
}

export function applyVagueConcernGuardrails(plan, history = []) {
  if (!plan) return plan;
  const latestText = latestSubstantiveUserText(history);
  const normalized = normalizeText(latestText);
  if (!normalized) return plan;

  let markers = [...(plan.markers || [])];
  const rationaleNotes = [];

  if (/\bthyroid\b|stitna zlaza|stitne zlazy/.test(normalized)) {
    markers = appendGuardrailMarkers(markers, ['thyroid.tsh', 'thyroid.freeT4', 'thyroid.freeT3'], 'Core thyroid context for a vague thyroid/energy concern.');
    rationaleNotes.push('thyroid companion markers');
  }

  if (/blood sugar|glucose|insulin|insulin resistance|homa|glycemic|glycaemic|metabolic/.test(normalized)) {
    markers = appendGuardrailMarkers(markers, ['biochemistry.glucose', 'metabolism.insulin', 'diabetes.hba1c', 'metabolism.homaIR'], 'Glucose + fasting insulin + HbA1c are needed for glycemic context; HOMA-IR is calculated after results.');
    rationaleNotes.push('glycemic/HOMA-IR companions');
  }

  if (/inflammation|inflammatory|crp|hs crp|hscrp/.test(normalized)) {
    markers = appendGuardrailMarker(markers, 'inflammation.hsCRP', 'Core inflammation marker for a vague inflammation concern.');
    rationaleNotes.push('inflammation marker');
  }

  if (/vitamin d|25 oh d|25ohd|d3\b/.test(normalized)) {
    markers = appendGuardrailMarker(markers, 'vitamins.vitaminD', 'Core vitamin D status marker for a vitamin D concern.');
    rationaleNotes.push('vitamin D marker');
  }

  if (/low testosterone|testosterone|androgen|male hormone/.test(normalized)) {
    markers = appendGuardrailMarkers(markers, [
      'hormones.totalTestosterone',
      'hormones.freeTestosterone',
      'hormones.shbg',
      'hormones.lh',
      'hormones.fsh',
      'hormones.estradiol',
      'hormones.prolactin',
      'hormones.dheaS',
    ], 'Male hormone context needs androgen level plus binding, pituitary-gonadal axis, estradiol, prolactin, and DHEA-S when energy is part of the concern.');
    rationaleNotes.push('male hormone axis companions');
  }

  if (markers.length === (plan.markers || []).length) return plan;
  return {
    ...plan,
    markers,
    rationale: plan.rationale
      ? `${plan.rationale} Guardrails added ${[...new Set(rationaleNotes)].join(', ')} for the vague concern.`
      : `Guardrails added ${[...new Set(rationaleNotes)].join(', ')} for the vague concern.`,
  };
}

export function aiPlanResponseToDraft(aiText, options = {}) {
  const payload = extractJSONFromAIText(aiText);
  const tests = readTests(payload);
  if (!tests.length) return null;

  const out = new Map();
  const markerSources = new Map();
  for (const item of tests) {
    const itemPlan = buildLabPlanFromConversation('What blood tests should I check next?', `- ${item.name}`);
    const directMarkers = [];
    for (const marker of itemPlan?.markers || []) {
      if (!findAIItemForMarker(marker, [item])) continue;
      directMarkers.push(marker);
    }
    const itemMarkers = directMarkers.length ? directMarkers : panelMarkersForAIItem(item);
    for (const marker of itemMarkers) {
      if (!out.has(marker.markerKey)) {
        out.set(marker.markerKey, marker);
        markerSources.set(marker.markerKey, item);
      }
    }
  }
  const markers = [...out.values()];
  if (!markers.length) return null;

  const enrichedMarkers = markers.map(marker => {
    const item = markerSources.get(marker.markerKey) || findAIItemForMarker(marker, tests);
    return {
      ...marker,
      reason: item?.reason || marker.reason || 'Recommended by the AI lab-plan reasoning step.',
      priority: item?.priority || marker.priority || 'core',
      confidence: marker.confidence === 'conversation_derived' ? 'ai_recommended_mapped' : marker.confidence,
    };
  });

  return {
    id: options.id || `labplan_ai_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    status: 'suggested',
    title: String(payload.title || '').trim() || (enrichedMarkers.length > 4 ? 'Reasoned next blood draw' : 'Reasoned focused lab plan'),
    rationale: String(payload.rationale || '').trim(),
    source: 'ai_thread_action',
    userPrompt: 'Build AI lab plan from this conversation',
    markers: enrichedMarkers,
    safetyBoundary: 'AI proposed this lab plan from the conversation. Review/edit it before comparing labs or preparing any provider handoff.',
    nextAction: 'compare_labs',
  };
}

export function buildLabPlanAIUserPrompt(history = [], labContext = '') {
  const transcript = buildSummaryTranscript(history);
  return `Build a prioritized lab plan from the recent health/lab-relevant part of this conversation.\n\nPROFILE / LAB CONTEXT (background only; do not recommend tests solely because they appear here):\n${labContext || 'No profile/lab context available.'}\n\nCONVERSATION TRANSCRIPT:\n${transcript}\n\nUse the latest health/lab-related user request as the anchor. If the latest exchange is unrelated to health/labs and there is no active lab-planning request in the conversation, return {"title":"No active lab plan","rationale":"Latest exchange is not lab-planning related.","tests":[]}.\n\nReturn the JSON object only.`;
}

export async function buildAILabPlanFromThread(history = [], options = {}) {
  if (!hasAIProvider()) throw new Error('No AI provider configured');
  if (isAIPaused()) throw new Error('AI features are paused');
  const userMessage = 'Build lab plan from this conversation';
  const labContext = buildLabContext({ userMessage });
  const provider = getAIProvider();
  const modelId = getActiveModelId(provider);
  const modelDisplay = getActiveModelDisplay(provider);
  const result = await callClaudeAPI({
    system: LAB_PLAN_AI_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildLabPlanAIUserPrompt(history, labContext) }],
    maxTokens: options.maxTokens || 1800,
    signal: options.signal,
  });
  const draftPlan = aiPlanResponseToDraft(result.text, options);
  const closedMarkerKeys = closedMarkerKeysFromHistory(history);
  const plan = closedMarkerKeys.length
    ? applyClosedMarkerList(draftPlan, closedMarkerKeys)
    : applyVagueConcernGuardrails(draftPlan, history);
  if (!plan) throw new Error('AI did not return a usable lab plan');
  return {
    plan,
    text: result.text,
    usage: result.usage || null,
    provider,
    modelId,
    modelDisplay,
  };
}
