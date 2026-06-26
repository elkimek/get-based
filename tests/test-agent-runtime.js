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

  const draft = tools.draftSupplementChangeProposal('I started creatine 5g daily and stopped zinc last week', {
    today: '2026-06-26',
    importedData: { supplements: [{ name: 'Zinc', dosage: '15 mg', startDate: '2026-01-01' }], changeHistory: [] },
  });
  assert('supplement proposal drafts structured add/end changes without mutating data',
    draft?.surface === 'supplements'
    && draft.requiresConfirmation === true
    && draft.changes.some(c => c.action === 'add_or_update' && c.name === 'Creatine' && c.dosage === '5g' && c.schedule === 'daily' && c.startDate === '2026-06-19')
    && draft.changes.some(c => c.action === 'end' && c.name === 'Zinc' && c.endDate === '2026-06-19'),
    JSON.stringify(draft));

  const applyData = { supplements: [{ name: 'Zinc', dosage: '15 mg', startDate: '2026-01-01' }], changeHistory: [] };
  const applied = await tools.applySupplementChangeProposal(draft, {
    importedData: applyData,
    now: 1780000000000,
    save: false,
  });
  assert('applying confirmed proposal adds new supplement and ends existing one',
    applied.status === 'applied'
    && applyData.supplements.some(s => s.name === 'Creatine' && s.dosage === '5g' && s.startDate === '2026-06-19' && !s.endDate)
    && applyData.supplements.some(s => s.name === 'Zinc' && s.endDate === '2026-06-19'),
    JSON.stringify({ applied, supplements: applyData.supplements }));
  assert('applying confirmed proposal records auditable agent change history',
    applyData.changeHistory.length === 1
    && applyData.changeHistory[0].source === 'agent'
    && applyData.changeHistory[0].confirmedByUser === true
    && /Creatine/.test(applyData.changeHistory[0].summary)
    && /Zinc/.test(applyData.changeHistory[0].summary),
    JSON.stringify(applyData.changeHistory));

  const handledData = { supplements: [{ name: 'Zinc', dosage: '15 mg', startDate: '2026-01-01' }], changeHistory: [] };
  const handled = await runtime.handleAgentUserTurn('I started creatine 5g daily and stopped zinc last week', {
    importedData: handledData,
    appendToChat: false,
    today: '2026-06-26',
  });
  assert('agent user-turn handler returns a confirmation-gated proposal message instead of applying writes',
    handled.handled === true
    && handled.result.assistantMessage.agentProposal?.requiresConfirmation === true
    && handledData.supplements.length === 1
    && handledData.supplements[0].endDate == null,
    JSON.stringify({ handled, data: handledData }));

  const chatEmptySrc = fs.readFileSync('js/chat-empty-state.js', 'utf8');
  assert('chat empty state exposes Find what changed agent mode as a button, not a form submit',
    chatEmptySrc.includes('data-chat-empty-action="run-agent-mode"')
    && chatEmptySrc.includes('data-agent-mode="find-what-changed"')
    && /<button type="button"[^>]+data-chat-empty-action="run-agent-mode"/.test(chatEmptySrc),
    'missing run-agent-mode button');

  const chatSendSrc = fs.readFileSync('js/chat-send.js', 'utf8');
  assert('chat send path gives agent first refusal on context-change messages after persisting user turn',
    chatSendSrc.includes('handleAgentUserTurn')
    && /await saveChatHistory\(\);[\s\S]{0,500}handleAgentUserTurn\(text/.test(chatSendSrc),
    'sendChatMessage does not call handleAgentUserTurn after saving user turn');

  const chatRenderSrc = fs.readFileSync('js/chat-render.js', 'utf8');
  assert('chat renderer mounts agent proposal cards with explicit button types',
    chatRenderSrc.includes('renderAgentProposalCard')
    && chatRenderSrc.includes('data-chat-message-action="apply-agent-proposal"')
    && /<button type="button"[^>]+data-chat-message-action="apply-agent-proposal"/.test(chatRenderSrc),
    'missing agent proposal card apply button');

  const chatActionsSrc = fs.readFileSync('js/chat-actions.js', 'utf8');
  assert('chat actions wire apply/edit/dismiss agent proposal delegates',
    chatActionsSrc.includes("action === 'apply-agent-proposal'")
    && chatActionsSrc.includes("action === 'edit-agent-proposal'")
    && chatActionsSrc.includes("action === 'dismiss-agent-proposal'"),
    'missing agent proposal action delegates');

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
