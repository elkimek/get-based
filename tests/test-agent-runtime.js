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

  const proposalHandlers = runtime.getAgentProposalHandlers();
  assert('agent proposal registry exposes surface handlers instead of runtime branching',
    proposalHandlers.supplements?.editable === true
    && proposalHandlers.supplements.apply === tools.applySupplementChangeProposal
    && proposalHandlers.supplements.revise === tools.reviseSupplementChangeProposal
    && proposalHandlers.context?.editable === false
    && proposalHandlers.context.apply === tools.applyContextChangeProposal,
    JSON.stringify(Object.keys(proposalHandlers)));

  const navIntent = runtime.classifyAgentIntent('show my biology scores');
  assert('agent intent classifier recognizes safe navigation requests',
    navIntent.intent === 'navigate'
    && navIntent.entities.some(e => e.type === 'route' && e.route === 'biology-scores' && e.writeLevel === 'navigation'),
    JSON.stringify(navIntent));

  const labPlanIntent = runtime.classifyAgentIntent('build me a lab plan for insulin resistance and low testosterone');
  assert('agent intent classifier recognizes draft lab-plan requests',
    labPlanIntent.intent === 'draft-lab-plan'
    && labPlanIntent.entities.some(e => e.type === 'labPlanTopic' && e.topic === 'insulin-resistance')
    && labPlanIntent.entities.some(e => e.type === 'labPlanTopic' && e.topic === 'androgen-axis'),
    JSON.stringify(labPlanIntent));

  const supplementIntent = runtime.classifyAgentIntent('I started creatine and stopped zinc last week');
  assert('agent intent classifier recognizes supplement/protocol changes',
    supplementIntent.intent === 'record-context-change'
    && supplementIntent.entities.some(e => e.type === 'supplement' && e.action === 'started' && /creatine/i.test(e.label))
    && supplementIntent.entities.some(e => e.type === 'supplement' && e.action === 'stopped' && /zinc/i.test(e.label)),
    JSON.stringify(supplementIntent));

  const contextIntent = runtime.classifyAgentIntent('I am sleeping badly lately and restarted training. Add goal: improve recovery. I have low sunlight right now.');
  assert('agent intent classifier recognizes context card and health goal changes',
    contextIntent.intent === 'record-context-change'
    && contextIntent.entities.some(e => e.type === 'context' && e.field === 'sleepRest')
    && contextIntent.entities.some(e => e.type === 'context' && e.field === 'exercise')
    && contextIntent.entities.some(e => e.type === 'context' && e.field === 'lightCircadian')
    && contextIntent.entities.some(e => e.type === 'healthGoal'),
    JSON.stringify(contextIntent));

  const richerContextText = 'My sleep has been terrible, I am exercising again, barely seeing the sun, and my goal is lower inflammation';
  const detectedContextSignals = tools.detectAgentContextSignals(richerContextText);
  assert('agent context signal router maps natural variants through schema rules',
    detectedContextSignals.some(e => e.type === 'context' && e.field === 'sleepRest')
    && detectedContextSignals.some(e => e.type === 'context' && e.field === 'exercise')
    && detectedContextSignals.some(e => e.type === 'context' && e.field === 'lightCircadian')
    && detectedContextSignals.some(e => e.type === 'healthGoal' && /lower inflammation/i.test(e.label)),
    JSON.stringify(detectedContextSignals));
  const richerContextIntent = runtime.classifyAgentIntent(richerContextText);
  assert('agent intent classifier reuses context signal router variants',
    richerContextIntent.intent === 'record-context-change'
    && richerContextIntent.entities.some(e => e.field === 'sleepRest')
    && richerContextIntent.entities.some(e => e.field === 'exercise')
    && richerContextIntent.entities.some(e => e.field === 'lightCircadian')
    && richerContextIntent.entities.some(e => e.type === 'healthGoal'),
    JSON.stringify(richerContextIntent));

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

  const navigatedRoutes = [];
  const previousNavigate = globalThis.window.navigate;
  globalThis.window.navigate = route => { navigatedRoutes.push(route); };
  const navHandled = await runtime.handleAgentUserTurn('show my biology scores', { appendToChat: false });
  globalThis.window.navigate = previousNavigate;
  assert('agent user-turn handler executes navigation tools without data writes or confirmation',
    navHandled.handled === true
    && navHandled.result.policy.writeLevel === 'navigation'
    && navHandled.result.toolCalls.some(t => t.id === 'open_view' && t.route === 'biology-scores')
    && navHandled.result.assistantMessage.agentNavigation?.route === 'biology-scores'
    && navigatedRoutes[0] === 'biology-scores',
    JSON.stringify({ navHandled, navigatedRoutes }));

  const labPlanData = { entries: [], supplements: [], healthGoals: [], changeHistory: [] };
  const labPlanDraft = tools.draftLabPlan('build me a lab plan for insulin resistance and low testosterone', { importedData: labPlanData });
  assert('lab-plan tool drafts structured marker bundles without mutating data',
    labPlanDraft?.surface === 'labPlan'
    && labPlanDraft.requiresConfirmation === false
    && labPlanDraft.writeLevel === 'draft-only'
    && labPlanDraft.bundles.some(b => b.id === 'insulin-resistance' && b.markers.includes('Fasting insulin') && b.markers.includes('HbA1c'))
    && labPlanDraft.bundles.some(b => b.id === 'androgen-axis' && b.markers.includes('Total testosterone') && b.markers.includes('SHBG') && b.markers.includes('LH'))
    && labPlanData.changeHistory.length === 0,
    JSON.stringify({ labPlanDraft, labPlanData }));

  const labPlanHandled = await runtime.handleAgentUserTurn('build me a lab plan for insulin resistance and low testosterone', {
    importedData: labPlanData,
    appendToChat: false,
  });
  assert('agent user-turn handler returns a draft-only lab-plan card message',
    labPlanHandled.handled === true
    && labPlanHandled.result.policy.writeLevel === 'draft-only'
    && labPlanHandled.result.toolCalls.some(t => t.id === 'draft_lab_plan')
    && labPlanHandled.result.assistantMessage.labPlanDraft?.bundles?.length >= 2
    && /draft lab plan/i.test(labPlanHandled.result.assistantMessage.content)
    && labPlanData.changeHistory.length === 0,
    JSON.stringify({ labPlanHandled, labPlanData }));

  const revised = tools.reviseSupplementChangeProposal(draft, {
    0: { dosage: '3 g', schedule: 'post-workout', startDate: '2026-06-20' },
    1: { endDate: '2026-06-21' },
  });
  assert('supplement proposal edits update only draft fields before applying',
    revised !== draft
    && revised.changes[0].dosage === '3 g'
    && revised.changes[0].schedule === 'post-workout'
    && revised.changes[0].startDate === '2026-06-20'
    && revised.changes[1].endDate === '2026-06-21'
    && draft.changes[0].dosage === '5g',
    JSON.stringify({ revised, original: draft }));

  const contextDraftData = { sleepRest: { duration: '7-8h', quality: 'good', note: 'old' }, healthGoals: [], changeHistory: [] };
  const contextDraft = tools.draftContextChangeProposal('I am sleeping badly lately and restarted training. Add goal: improve recovery. I have low sunlight right now.', {
    today: '2026-06-26',
    importedData: contextDraftData,
  });
  assert('context proposal drafts sleep, exercise, sunlight, and health goal changes without mutating data',
    contextDraft?.surface === 'context'
    && contextDraft.requiresConfirmation === true
    && contextDraft.changes.some(c => c.field === 'sleepRest' && c.patch.quality === 'poor')
    && contextDraft.changes.some(c => c.field === 'exercise' && c.patch.frequency === 'restarted')
    && contextDraft.changes.some(c => c.field === 'lightCircadian' && c.patch.uvExposure === 'low')
    && contextDraft.changes.some(c => c.field === 'healthGoals' && /improve recovery/i.test(c.item.text))
    && contextDraftData.sleepRest.quality === 'good'
    && contextDraftData.healthGoals.length === 0,
    JSON.stringify({ contextDraft, contextDraftData }));
  const richerContextDraft = tools.draftContextChangeProposal(richerContextText, { today: '2026-06-26', importedData: { healthGoals: [], changeHistory: [] } });
  assert('context proposal drafting uses router variants for sleep, exercise, sunlight, and goals',
    richerContextDraft?.changes.some(c => c.field === 'sleepRest' && c.patch.quality === 'poor')
    && richerContextDraft.changes.some(c => c.field === 'exercise' && c.patch.frequency === 'restarted')
    && richerContextDraft.changes.some(c => c.field === 'lightCircadian' && c.patch.uvExposure === 'low')
    && richerContextDraft.changes.some(c => c.field === 'healthGoals' && /lower inflammation/i.test(c.item.text)),
    JSON.stringify(richerContextDraft));

  const contextApplyData = { sleepRest: { duration: '7-8h', quality: 'good', note: 'old' }, healthGoals: [], changeHistory: [] };
  const contextApplied = await tools.applyContextChangeProposal(contextDraft, {
    importedData: contextApplyData,
    now: 1780000000000,
    save: false,
  });
  assert('applying confirmed context proposal updates context cards and records agent audit history',
    contextApplied.status === 'applied'
    && contextApplyData.sleepRest.quality === 'poor'
    && /poor sleep|sleeping badly/i.test(contextApplyData.sleepRest.note)
    && contextApplyData.exercise.frequency === 'restarted'
    && contextApplyData.lightCircadian.uvExposure === 'low'
    && contextApplyData.healthGoals.some(g => /improve recovery/i.test(g.text))
    && contextApplyData.changeHistory.some(h => h.source === 'agent' && h.surface === 'context' && h.confirmedByUser === true),
    JSON.stringify(contextApplyData));

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

  assert('chat renderer supports inline editable proposal fields and save-edits action',
    chatRenderSrc.includes('agent-proposal-edit-grid')
    && chatRenderSrc.includes('data-agent-proposal-field="dosage"')
    && chatRenderSrc.includes('data-agent-proposal-field="startDate"')
    && chatRenderSrc.includes('data-chat-message-action="save-agent-proposal-edits"'),
    'missing inline proposal edit controls');

  assert('chat renderer supports context proposal cards',
    chatRenderSrc.includes('renderAgentProposalChangeRow')
    && chatRenderSrc.includes("proposal.surface === 'context'")
    && chatRenderSrc.includes('Health goals'),
    'missing context proposal rendering');

  assert('chat renderer supports persisted lab-plan draft cards',
    chatRenderSrc.includes('renderLabPlanDraftCard')
    && chatRenderSrc.includes('msg.labPlanDraft')
    && chatRenderSrc.includes('agent-lab-plan-card')
    && chatRenderSrc.includes('data-chat-message-action="copy-lab-plan-draft"'),
    'missing lab-plan draft card rendering');

  const chatActions = await import('../js/chat-actions.js');
  assert('chat message copy helper includes lab-plan card contents',
    /Draft lab plan/.test(chatActions.buildMessageCopyText({ content: 'Here is the plan', labPlanDraft }))
    && /Fasting insulin/.test(chatActions.buildMessageCopyText({ content: 'Here is the plan', labPlanDraft }))
    && /Total testosterone/.test(chatActions.buildMessageCopyText({ content: 'Here is the plan', labPlanDraft })),
    chatActions.buildMessageCopyText({ content: 'Here is the plan', labPlanDraft }));

  const chatActionsSrc = fs.readFileSync('js/chat-actions.js', 'utf8');
  assert('chat actions wire apply/edit/dismiss agent proposal delegates',
    chatActionsSrc.includes("action === 'apply-agent-proposal'")
    && chatActionsSrc.includes("action === 'edit-agent-proposal'")
    && chatActionsSrc.includes("action === 'dismiss-agent-proposal'")
    && chatActionsSrc.includes("action === 'save-agent-proposal-edits'"),
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
