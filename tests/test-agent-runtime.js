#!/usr/bin/env node
// test-agent-runtime.js — browser-local getbased Agent MVP contracts
//
// Run: node tests/test-agent-runtime.js

import './_node-shim.js';
import fs from 'fs';

let pass = 0, fail = 0;
function assert(name, condition, detail) {
  if (condition) { pass++; console.log(`  PASS: ${name}`); }
  else { fail++; console.log(`  FAIL: ${name}${detail ? ' — ' + detail : ''}`); }
}

console.log('=== getbased Agent Runtime Tests ===\n');

try {
  const tools = await import('../js/agent-tools.js');
  const runtime = await import('../js/agent-runtime.js');

  const fixture = {
    entries: [
      {
        date: '2026-01-01',
        markers: {
          'lipids.ldl': 3.2,
          'inflammation.crp': 0.8,
          'thyroid.tsh': 2.1,
        },
      },
      {
        date: '2026-04-01',
        markers: {
          'lipids.ldl': 2.4,
          'inflammation.crp': 2.4,
          'thyroid.tsh': 2.0,
          'iron.ferritin': 55,
        },
      },
    ],
    supplements: [
      { name: 'Creatine', dosage: '5 g', startDate: '2026-03-20' },
      { name: 'Zinc', dosage: '15 mg', endDate: '2026-03-25' },
    ],
    healthGoals: [{ goal: 'Improve recovery' }],
    biologyScoreContextAI: { updatedAt: 1780000000000 },
  };

  const snapshot = tools.getAgentProfileSnapshot({ importedData: fixture });
  assert('profile snapshot counts labs, supplements, goals, and context review',
    snapshot.labEntryCount === 2
    && snapshot.supplementCount === 2
    && snapshot.healthGoalCount === 1
    && snapshot.hasBiologyScoreContextReview === true,
    JSON.stringify(snapshot));

  const comparison = tools.compareLatestLabEntries({ importedData: fixture });
  assert('latest lab comparison identifies previous and latest dates',
    comparison.latestDate === '2026-04-01' && comparison.previousDate === '2026-01-01',
    JSON.stringify(comparison));
  assert('latest lab comparison reports new markers',
    comparison.addedMarkers.some(m => m.key === 'iron.ferritin' && m.value === 55),
    JSON.stringify(comparison.addedMarkers));
  assert('latest lab comparison sorts changed markers by percent magnitude',
    comparison.changedMarkers[0]?.key === 'inflammation.crp'
    && comparison.changedMarkers[0].direction === 'up'
    && comparison.changedMarkers[1]?.key === 'lipids.ldl',
    JSON.stringify(comparison.changedMarkers));

  const result = await runtime.runGetbasedAgentMode('find-what-changed', {
    importedData: fixture,
    now: 1780000000000,
    executeActions: false,
  });
  assert('find-what-changed agent returns read-only status and cards',
    result.mode === 'find-what-changed'
    && result.status === 'completed'
    && result.policy.writeLevel === 'read-only'
    && result.cards.some(c => c.title === 'Lab changes'),
    JSON.stringify(result));
  assert('find-what-changed agent proposes gated next actions without executing writes',
    result.proposedActions.some(a => a.id === 'draft_lab_plan' && a.requiresConfirmation === true)
    && result.proposedActions.some(a => a.id === 'open_labs_view' && a.requiresConfirmation === false),
    JSON.stringify(result.proposedActions));
  assert('find-what-changed assistant message is human-readable and deterministic',
    /What changed/.test(result.assistantMessage.content)
    && /CRP/.test(result.assistantMessage.content)
    && /Ferritin/.test(result.assistantMessage.content),
    result.assistantMessage.content);

  const supplementIntent = runtime.classifyAgentIntent('I started creatine and stopped zinc last week');
  assert('agent intent classifier recognizes supplement/protocol changes',
    supplementIntent.intent === 'record-context-change'
    && supplementIntent.entities.some(e => e.type === 'supplement' && e.action === 'started' && /creatine/i.test(e.label))
    && supplementIntent.entities.some(e => e.type === 'supplement' && e.action === 'stopped' && /zinc/i.test(e.label)),
    JSON.stringify(supplementIntent));

  const chatEmptySrc = fs.readFileSync('js/chat-empty-state.js', 'utf8');
  assert('chat empty state exposes Find what changed agent mode as a button, not a form submit',
    chatEmptySrc.includes('data-chat-empty-action="run-agent-mode"')
    && chatEmptySrc.includes('data-agent-mode="find-what-changed"')
    && /<button type="button"[^>]+data-chat-empty-action="run-agent-mode"/.test(chatEmptySrc),
    'missing run-agent-mode button');

  const swSrc = fs.readFileSync('service-worker.js', 'utf8');
  assert('service worker caches new agent modules',
    swSrc.includes('/js/agent-tools.js') && swSrc.includes('/js/agent-runtime.js'),
    'agent modules missing from cache list');

} catch (err) {
  fail++;
  console.error('  FAIL: agent runtime tests threw');
  console.error(err && err.stack ? err.stack : err);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
