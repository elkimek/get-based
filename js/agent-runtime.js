// @ts-check
// agent-runtime.js — browser-local getbased agent spine and first read-only mode

import { state } from './state.js';
import { saveChatHistory } from './chat-history.js';
import { renderChatMessages } from './chat-render.js';
import { getActivePersonality } from './chat-personalities.js';
import { compareLatestLabEntries, getAgentProfileSnapshot, getAgentToolRegistry } from './agent-tools.js';

const AGENT_MODE_LABELS = {
  'find-what-changed': 'Find what changed',
};

function fmtValue(value) {
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toFixed(Math.abs(value) >= 10 ? 1 : 2).replace(/\.00$/, '');
  return String(value ?? '—');
}

function fmtPct(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '';
  const sign = value > 0 ? '+' : '';
  return ` (${sign}${value.toFixed(0)}%)`;
}

function topLabChangeLines(comparison, limit = 4) {
  const lines = [];
  for (const m of comparison.changedMarkers.slice(0, limit)) {
    const arrow = m.direction === 'up' ? '↑' : '↓';
    lines.push(`- ${m.label}: ${fmtValue(m.previousValue)} → ${fmtValue(m.latestValue)} ${arrow}${fmtPct(m.percentChange)}`);
  }
  for (const m of comparison.addedMarkers.slice(0, Math.max(0, limit - lines.length))) {
    lines.push(`- ${m.label}: new value ${fmtValue(m.value)}`);
  }
  if (!lines.length) lines.push('- No numeric marker changes found between the two latest lab entries.');
  return lines;
}

function buildFindWhatChangedResult(opts = {}) {
  const snapshot = getAgentProfileSnapshot(opts);
  const comparison = compareLatestLabEntries(opts);
  const lines = topLabChangeLines(comparison);
  const dateLine = comparison.latestDate && comparison.previousDate
    ? `Compared ${comparison.previousDate} → ${comparison.latestDate}.`
    : comparison.latestDate
      ? `Only one lab date found (${comparison.latestDate}), so I can summarize but not compare yet.`
      : 'No lab entries found yet.';
  const content = [
    `### What changed`,
    dateLine,
    '',
    ...lines,
    '',
    snapshot.supplementCount ? `Context seen: ${snapshot.supplementCount} supplement/med entry${snapshot.supplementCount === 1 ? '' : 'ies'} and ${snapshot.healthGoalCount} health goal${snapshot.healthGoalCount === 1 ? '' : 's'}.` : `Context seen: ${snapshot.healthGoalCount} health goal${snapshot.healthGoalCount === 1 ? '' : 's'}; no supplements/meds logged yet.`,
    '',
    'I did not change anything. I can draft a lab-plan or open the relevant view next.',
  ].join('\n');
  return {
    mode: 'find-what-changed',
    label: AGENT_MODE_LABELS['find-what-changed'],
    status: 'completed',
    policy: { writeLevel: 'read-only', requiresConfirmationForWrites: true },
    toolCalls: [
      { id: 'get_profile_context', status: 'completed' },
      { id: 'compare_latest_labs', status: 'completed' },
    ],
    cards: [
      {
        title: 'Lab changes',
        latestDate: comparison.latestDate,
        previousDate: comparison.previousDate,
        changedMarkers: comparison.changedMarkers.slice(0, 8),
        addedMarkers: comparison.addedMarkers.slice(0, 8),
        removedMarkers: comparison.removedMarkers.slice(0, 8),
      },
    ],
    proposedActions: [
      { id: 'open_labs_view', label: 'Open Labs', requiresConfirmation: false, writeLevel: 'navigation' },
      { id: 'draft_lab_plan', label: 'Draft lab plan', requiresConfirmation: true, writeLevel: 'draft-only' },
    ],
    assistantMessage: {
      role: 'assistant',
      content,
      auto: true,
      agentMode: 'find-what-changed',
      agentResult: { comparison, snapshot },
    },
  };
}

export function classifyAgentIntent(text = '') {
  const s = String(text || '');
  const entities = [];
  const supplementRegexes = [
    { action: 'started', re: /\b(?:started|added|began|begin|taking)\s+([a-z0-9 +_-]{2,40})/ig },
    { action: 'stopped', re: /\b(?:stopped|quit|removed|discontinued)\s+([a-z0-9 +_-]{2,40})/ig },
  ];
  for (const { action, re } of supplementRegexes) {
    let m;
    while ((m = re.exec(s))) {
      const raw = (m[1] || '').replace(/\b(last|this|week|month|today|yesterday)\b.*$/i, '').trim();
      if (raw) entities.push({ type: 'supplement', action, label: raw });
    }
  }
  if (entities.length) return { intent: 'record-context-change', confidence: 'medium', entities };
  if (/\b(what changed|changed|new labs|uploaded|compare)\b/i.test(s)) return { intent: 'find-what-changed', confidence: 'medium', entities };
  return { intent: 'chat', confidence: 'low', entities };
}

export async function runGetbasedAgentMode(mode, opts = {}) {
  if (mode !== 'find-what-changed') throw new Error(`Unsupported getbased agent mode: ${mode}`);
  const result = buildFindWhatChangedResult(opts);
  if (opts.appendToChat === true) {
    const personality = getActivePersonality?.();
    if (personality) {
      result.assistantMessage.personalityName = personality.name;
      result.assistantMessage.personalityIcon = personality.icon;
    }
    state.chatHistory.push(result.assistantMessage);
    await saveChatHistory();
    renderChatMessages();
  }
  return result;
}

export function getGetbasedAgentModes() {
  return [
    { id: 'find-what-changed', label: AGENT_MODE_LABELS['find-what-changed'], writeLevel: 'read-only' },
  ];
}

Object.assign(window, {
  classifyAgentIntent,
  getAgentToolRegistry,
  getGetbasedAgentModes,
  runGetbasedAgentMode,
});
