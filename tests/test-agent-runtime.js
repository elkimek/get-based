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
  const actions = await import('../js/agent-actions/registry.js');
  const synthesis = await import('../js/agent-response-synthesis.js');
  const router = await import('../js/agent-intent-router.js');
  const artifacts = await import('../js/agent-artifacts.js');
  const accessProposals = await import('../js/agent-access-proposals.js');
  const proposalInbox = await import('../js/agent-proposal-inbox.js');
  const artifactLibrary = await import('../js/agent-artifact-library.js');
  const deltaSurfaces = await import('../js/sync-delta-surfaces.js');
  const deltaConfig = await import('../js/sync-delta-surface-config.js');
  const { state } = await import('../js/state.js');

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

  const registeredActions = actions.listAgentActions();
  assert('agent action registry exposes typed app actions with policy metadata',
    registeredActions.some(a => a.id === 'find-what-changed' && a.writeLevel === 'read-only' && a.mode === 'find-what-changed')
    && registeredActions.some(a => a.id === 'context.update' && a.writeLevel === 'draft-only' && a.requiresConfirmation === true)
    && registeredActions.some(a => a.id === 'supplement.update' && a.writeLevel === 'draft-only' && a.requiresConfirmation === true)
    && registeredActions.some(a => a.id === 'labPlan.create' && a.artifactType === 'labPlanDraft')
    && registeredActions.some(a => a.id === 'biologyScore.investigate' && a.writeLevel === 'read-only')
    && registeredActions.some(a => a.id === 'navigation.open' && a.writeLevel === 'navigation'),
    JSON.stringify(registeredActions));
  assert('agent action registry resolves legacy modes to shared typed actions',
    actions.resolveAgentActionForIntent({ intent: 'draft-lab-plan' })?.id === 'labPlan.create'
    && actions.resolveAgentActionForIntent({ intent: 'record-context-change' })?.id === 'context.update'
    && actions.resolveAgentActionForIntent({ intent: 'navigate' })?.id === 'navigation.open',
    JSON.stringify(registeredActions));

  const registryResult = await actions.runAgentAction('find-what-changed', { text: 'what changed?' }, {
    importedData: fixture,
    now: 1780000000000,
    executeActions: false,
  });
  assert('agent action registry executes find-what-changed as read-only app action',
    registryResult.mode === 'find-what-changed'
    && registryResult.policy.writeLevel === 'read-only'
    && registryResult.assistantMessage.agentMode === 'find-what-changed'
    && registryResult.cards.some(c => c.title === 'Lab changes'),
    JSON.stringify(registryResult));

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

  const contextAction = actions.getAgentAction('context.update');
  const supplementAction = actions.getAgentAction('supplement.update');
  assert('agent action registry owns proposal apply/revise policy for write actions',
    contextAction?.proposalSurface === 'context'
    && typeof contextAction.apply === 'function'
    && contextAction.appliedMessage === 'Your profile context was updated.'
    && contextAction.notification === 'Profile context updated'
    && contextAction.editable === false
    && supplementAction?.proposalSurface === 'supplements'
    && typeof supplementAction.apply === 'function'
    && typeof supplementAction.revise === 'function'
    && supplementAction.editable === true
    && supplementAction.appliedMessage === 'Your supplement log was updated.',
    JSON.stringify({ contextAction, supplementAction }));

  const proposalHandlers = runtime.getAgentProposalHandlers();
  assert('legacy proposal handler view is derived from typed action registry',
    proposalHandlers.supplements?.editable === true
    && proposalHandlers.supplements.apply === supplementAction.apply
    && proposalHandlers.supplements.revise === supplementAction.revise
    && proposalHandlers.context?.editable === false
    && proposalHandlers.context.apply === contextAction.apply,
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

  const scoreIntent = runtime.classifyAgentIntent('why is my hormone axis bad?');
  assert('agent intent classifier recognizes Biology Score investigation requests',
    scoreIntent.intent === 'investigate-score'
    && scoreIntent.entities.some(e => e.type === 'biologyScore' && e.scoreId === 'hormoneAxis'),
    JSON.stringify(scoreIntent));

  localStorage.setItem('labcharts-ai-provider', 'openrouter');
  localStorage.setItem('labcharts-agent-router-mode', 'openrouter');
  localStorage.setItem('labcharts-agent-router-openrouter-model', 'google/gemini-3.5-flash');
  localStorage.setItem('labcharts-openrouter-router-models', JSON.stringify([{ id: 'google/gemini-3.5-flash', name: 'Gemini Flash' }]));
  localStorage.setItem('labcharts-openrouter-models-meta', JSON.stringify({ provider: 'openrouter', source: 'provider-api', endpoint: 'https://openrouter.ai/api/v1/models' }));
  localStorage.setItem('labcharts-openrouter-key', 'sk-or');
  let seenRouterRequest = null;
  let seenRouterProvider = null;
  const aiRouterResult = await router.classifyAmbiguousAgentIntent('Should I test insulin and testosterone next?', {
    hasAI: () => true,
    callAI: async (request, provider) => {
      seenRouterRequest = request;
      seenRouterProvider = provider;
      return {
        text: request.messages[0].content.includes('Should I test insulin and testosterone next?')
          ? '{"intent":"draft-lab-plan","confidence":"high","reason":"The user is asking which markers to test next."}'
          : '{"intent":"chat","confidence":"low"}',
      };
    },
  });
  assert('AI router can classify ambiguous testing questions as draft lab-plan intent',
    aiRouterResult.intent === 'draft-lab-plan'
    && aiRouterResult.confidence === 'high'
    && aiRouterResult.usedAI === true,
    JSON.stringify(aiRouterResult));
  assert('AI router uses the configured fast router model override',
    seenRouterProvider === 'openrouter'
    && seenRouterRequest?.modelId === 'google/gemini-3.5-flash',
    JSON.stringify({ seenRouterProvider, seenRouterRequest }));

  const rejectedRouterResult = await router.classifyAmbiguousAgentIntent('Delete my profile data now', {
    hasAI: () => true,
    callAI: async () => ({ text: '{"intent":"delete-data","confidence":"high"}' }),
  });
  assert('AI router rejects unsupported or unsafe intents back to normal chat',
    rejectedRouterResult.intent === 'chat'
    && rejectedRouterResult.usedAI === true
    && /unsupported/i.test(rejectedRouterResult.reason || ''),
    JSON.stringify(rejectedRouterResult));

  let deterministicBypassCalled = false;
  const deterministicBypass = await runtime.resolveAgentIntent('build me a lab plan for insulin resistance', {
    classifyAgentIntentAI: async () => { deterministicBypassCalled = true; return { intent: 'chat' }; },
  });
  assert('agent router bypasses AI for deterministic high-signal app intents',
    deterministicBypass.intent === 'draft-lab-plan' && deterministicBypassCalled === false,
    JSON.stringify({ deterministicBypass, deterministicBypassCalled }));

  const aiRoutedHandled = await runtime.handleAgentUserTurn('Should I test insulin and testosterone next?', {
    importedData: { entries: [], supplements: [], healthGoals: [], changeHistory: [] },
    appendToChat: false,
    synthesizeAgentResponse: false,
    classifyAgentIntentAI: async () => ({ intent: 'draft-lab-plan', confidence: 'high', reason: 'testing question' }),
  });
  assert('agent runtime uses AI router result to execute app tool for ambiguous lab questions',
    aiRoutedHandled.handled === true
    && aiRoutedHandled.intent.intent === 'draft-lab-plan'
    && aiRoutedHandled.result.assistantMessage.labPlanDraft?.bundles?.some(b => b.id === 'insulin-resistance')
    && aiRoutedHandled.result.assistantMessage.labPlanDraft?.bundles?.some(b => b.id === 'androgen-axis'),
    JSON.stringify(aiRoutedHandled));

  const aiRoutedChat = await runtime.handleAgentUserTurn('Tell me a gentle story about mitochondria', {
    appendToChat: false,
    classifyAgentIntentAI: async () => ({ intent: 'chat', confidence: 'high', reason: 'ordinary conversation' }),
  });
  assert('agent runtime leaves ordinary AI-routed chat for the main chat model',
    aiRoutedChat.handled === false && aiRoutedChat.intent.intent === 'chat',
    JSON.stringify(aiRoutedChat));

  const educationalContextHandled = await runtime.handleAgentUserTurn('tell me a story about gut feelings and appetite in evolution', {
    appendToChat: false,
    synthesizeAgentResponse: false,
    classifyAgentIntentAI: async () => ({ intent: 'chat', confidence: 'low' }),
    hasAIProvider: () => true,
    extractContextChangeProposal: async () => ({ changes: [{ field: 'diet', patch: { appetite: 'variable' } }] }),
  });
  assert('structured context extractor does not hijack ordinary educational symptom-word chat',
    educationalContextHandled.handled === false && educationalContextHandled.intent.intent === 'chat',
    JSON.stringify(educationalContextHandled));

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
  const applied = await actions.applyAgentAction('supplement.update', draft, {
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

  const labModifyAction = actions.getAgentAction('labPlan.modify');
  assert('agent action registry exposes lab-plan modification as draft-only artifact action',
    labModifyAction?.id === 'labPlan.modify'
    && labModifyAction.mode === 'modify-lab-plan'
    && labModifyAction.artifactType === 'labPlanDraft'
    && labModifyAction.writeLevel === 'draft-only'
    && labModifyAction.requiresConfirmation === true,
    JSON.stringify(labModifyAction));

  const methylationPlan = tools.draftLabPlan('what labs for methylation?', { importedData: labPlanData });
  const addedPlanResult = await actions.runAgentAction('labPlan.modify', {
    text: 'add C-peptide',
    labPlanDraft: methylationPlan,
  }, { synthesizeAgentResponse: false, save: false });
  assert('labPlan.modify can add a requested marker while preserving the prior authoritative plan',
    addedPlanResult?.mode === 'modify-lab-plan'
    && addedPlanResult.labPlanDraft.revisionOf === methylationPlan.id
    && addedPlanResult.labPlanDraft.bundles.some(b => b.id === 'one-carbon' && b.markers.includes('Homocysteine'))
    && addedPlanResult.labPlanDraft.bundles.some(b => b.markers.includes('C-peptide'))
    && addedPlanResult.assistantMessage.labPlanDraft.id === addedPlanResult.labPlanDraft.id,
    JSON.stringify(addedPlanResult));
  const serializedModifiedPlan = synthesis.serializeAgentToolResult('modify-lab-plan', addedPlanResult.labPlanDraft);
  assert('agent synthesis serializes lab-plan modification lineage for follow-up grounding',
    serializedModifiedPlan.intent === 'modify-lab-plan'
    && serializedModifiedPlan.revisionOf === methylationPlan.id
    && serializedModifiedPlan.modification?.addedMarkers?.includes('C-peptide')
    && serializedModifiedPlan.bundles.some(b => b.markers.includes('C-peptide')),
    JSON.stringify(serializedModifiedPlan));

  const removedPlanResult = await actions.runAgentAction('labPlan.modify', {
    text: 'remove SHBG',
    labPlanDraft,
  }, { synthesizeAgentResponse: false, save: false });
  assert('labPlan.modify removes requested markers without dropping unrelated prior markers',
    removedPlanResult?.labPlanDraft.bundles.some(b => b.id === 'androgen-axis' && b.markers.includes('Total testosterone'))
    && !removedPlanResult.labPlanDraft.bundles.some(b => b.markers.includes('SHBG'))
    && removedPlanResult.labPlanDraft.modification?.removedMarkers?.includes('SHBG'),
    JSON.stringify(removedPlanResult?.labPlanDraft));

  const cheaperPlanResult = await actions.runAgentAction('labPlan.modify', {
    text: 'make it cheaper',
    labPlanDraft,
  }, { synthesizeAgentResponse: false, save: false });
  assert('labPlan.modify can make a plan cheaper by trimming each bundle to core markers',
    cheaperPlanResult?.labPlanDraft.bundles.every(b => b.markers.length <= 3)
    && cheaperPlanResult.labPlanDraft.modification?.operation === 'cheaper'
    && cheaperPlanResult.labPlanDraft.bundles.some(b => b.id === 'insulin-resistance' && b.markers.includes('Fasting insulin')),
    JSON.stringify(cheaperPlanResult?.labPlanDraft));

  const labPlanHandled = await runtime.handleAgentUserTurn('build me a lab plan for insulin resistance and low testosterone', {
    importedData: labPlanData,
    appendToChat: false,
    save: false,
  });
  assert('agent user-turn handler returns a draft-only lab-plan card message',
    labPlanHandled.handled === true
    && labPlanHandled.result.policy.writeLevel === 'draft-only'
    && labPlanHandled.result.toolCalls.some(t => t.id === 'draft_lab_plan')
    && labPlanHandled.result.assistantMessage.labPlanDraft?.bundles?.length >= 2
    && /drafted 2 marker bundles/i.test(labPlanHandled.result.assistantMessage.content)
    && !/Draft lab plan/.test(labPlanHandled.result.assistantMessage.content)
    && !/Fasting insulin/.test(labPlanHandled.result.assistantMessage.content)
    && labPlanData.changeHistory.length === 0,
    JSON.stringify({ labPlanHandled, labPlanData }));

  state.chatHistory = [{ role: 'assistant', content: 'Drafted plan', labPlanDraft, auto: true }];
  const labPlanFollowupHandled = await runtime.handleAgentUserTurn('add ApoB to that list', {
    importedData: labPlanData,
    appendToChat: false,
    synthesizeAgentResponse: false,
    save: false,
  });
  assert('agent user-turn handler routes lab-plan follow-ups through active structured artifact',
    labPlanFollowupHandled.handled === true
    && labPlanFollowupHandled.intent.intent === 'modify-lab-plan'
    && labPlanFollowupHandled.result.toolCalls.some(t => t.id === 'modify_lab_plan')
    && labPlanFollowupHandled.result.assistantMessage.labPlanDraft.revisionOf === labPlanDraft.id
    && labPlanFollowupHandled.result.assistantMessage.labPlanDraft.bundles.some(b => b.markers.includes('ApoB'))
    && labPlanData.changeHistory.length === 0,
    JSON.stringify(labPlanFollowupHandled));
  state.chatHistory = [];

  const artifactData = { entries: [], supplements: [], healthGoals: [], changeHistory: [] };
  const storedLabPlan = await artifacts.persistLabPlanArtifact(labPlanDraft, { importedData: artifactData, save: false, source: 'chat' });
  assert('lab-plan drafts persist as first-class profile artifacts',
    storedLabPlan.id === labPlanDraft.id
    && artifactData.agentArtifacts?.labPlans?.[0]?.id === labPlanDraft.id
    && artifactData.agentArtifacts.labPlans[0].source === 'chat'
    && artifacts.getLatestLabPlanArtifact({ importedData: artifactData })?.id === labPlanDraft.id,
    JSON.stringify(artifactData.agentArtifacts));

  const scoreInvestigationFixture = tools.investigateBiologyScore('why is my hormone axis bad?', {
    importedData: labPlanData,
    biologyScores: [{
      id: 'hormoneAxis',
      title: 'Hormone Axis',
      score: 42,
      coverage: 0.4,
      scoreConfidenceLabel: 'Low confidence',
      missing: [{ label: 'SHBG' }, { label: 'LH' }, { label: 'FSH' }],
      available: [{ label: 'Total testosterone' }],
      flags: ['Missing pituitary/binding markers'],
    }],
  });
  const scorePlanResult = await actions.runAgentAction('labPlan.fromScoreInvestigation', {
    text: 'what should I test to improve confidence?',
    scoreInvestigation: scoreInvestigationFixture,
  }, { synthesizeAgentResponse: false, save: false });
  assert('score investigation can hand off missing markers into a draft lab plan',
    scorePlanResult?.mode === 'draft-lab-plan'
    && scorePlanResult.labPlanDraft.sourceScoreInvestigationId === scoreInvestigationFixture.id
    && scorePlanResult.labPlanDraft.bundles.some(b => b.id === 'score-hormoneAxis' && b.markers.includes('SHBG') && b.markers.includes('LH'))
    && scorePlanResult.assistantMessage.labPlanDraft.id === scorePlanResult.labPlanDraft.id,
    JSON.stringify(scorePlanResult));

  state.chatHistory = [{ role: 'assistant', content: 'Score checked', scoreInvestigation: scoreInvestigationFixture, auto: true }];
  const scoreFollowupHandled = await runtime.handleAgentUserTurn('what should I test to improve confidence?', {
    importedData: labPlanData,
    appendToChat: false,
    synthesizeAgentResponse: false,
    save: false,
  });
  assert('agent user-turn handler routes score follow-ups into lab-plan handoff',
    scoreFollowupHandled.handled === true
    && scoreFollowupHandled.intent.intent === 'draft-lab-plan-from-score'
    && scoreFollowupHandled.result.assistantMessage.labPlanDraft.sourceScoreInvestigationId === scoreInvestigationFixture.id,
    JSON.stringify(scoreFollowupHandled));
  state.chatHistory = [];

  const externalData = { entries: [], supplements: [], healthGoals: [], changeHistory: [] };
  const externalProposal = await accessProposals.proposeAgentAction('context.update', {
    text: 'I am sleeping badly lately',
  }, { importedData: externalData, save: false, source: 'hermes' });
  assert('Agent Access bridge stores external write proposals without applying them',
    externalProposal.status === 'pending'
    && externalProposal.source === 'hermes'
    && externalProposal.actionId === 'context.update'
    && externalProposal.agentProposal?.surface === 'context'
    && externalData.agentProposals?.[0]?.id === externalProposal.id
    && externalData.sleepRest == null,
    JSON.stringify({ externalProposal, externalData }));
  const appliedExternal = await accessProposals.applyStoredAgentProposal(externalProposal.id, { importedData: externalData, save: false });
  assert('Agent Access bridge applies confirmed stored proposals through registry write boundaries',
    appliedExternal?.status === 'applied'
    && externalData.sleepRest?.quality === 'poor'
    && externalData.changeHistory?.some(row => row.source === 'agent' && row.confirmedByUser === true),
    JSON.stringify({ appliedExternal, externalData }));

  const inboxData = {
    agentProposals: [{ ...externalProposal, id: 'pending-inbox', status: 'pending' }, { ...externalProposal, id: 'dismissed', status: 'dismissed' }],
  };
  const inboxHtml = proposalInbox.renderAgentProposalInbox({ importedData: inboxData });
  assert('generic proposal inbox renders pending proposal actions and hides dismissed entries by default',
    /Agent proposals/.test(inboxHtml)
    && /data-agent-proposal-inbox-action="apply"/.test(inboxHtml)
    && /context\.update/.test(inboxHtml)
    && !/dismissed/.test(inboxHtml),
    inboxHtml);

  const endpointData = { entries: [], supplements: [], healthGoals: [], changeHistory: [] };
  const endpointApi = accessProposals.getAgentAccessProposalApi({ importedData: endpointData, save: false, source: 'hermes', notify: false });
  const endpointContext = await endpointApi.propose_context_update({ text: 'I am sleeping badly lately' });
  const endpointSupplement = await endpointApi.propose_supplement_update({ text: 'I started magnesium 200 mg daily' });
  const endpointPlan = await endpointApi.propose_lab_plan({ text: 'build me a lab plan for insulin resistance' });
  assert('Agent Access endpoint helpers expose proposal-only MCP-style surface',
    endpointContext.actionId === 'context.update'
    && endpointSupplement.actionId === 'supplement.update'
    && endpointPlan.actionId === 'labPlan.create'
    && endpointApi.list_pending_agent_proposals().length === 3
    && endpointData.sleepRest == null
    && endpointData.supplements?.length !== 1
    && (endpointData.agentArtifacts?.labPlans?.length || 0) === 0
    && endpointData.agentProposals.every(item => item.status === 'pending'),
    JSON.stringify(endpointData));

  const scrubbedExternalData = { entries: [], supplements: [], healthGoals: [], changeHistory: [] };
  const scrubbedExternal = await accessProposals.proposeAgentAction('labPlan.create', {
    text: 'raw private marker sentence about insulin',
  }, { importedData: scrubbedExternalData, save: false, source: 'hermes', notify: false });
  assert('Agent Access stored records scrub raw source text from proposal artifacts and do not pre-persist lab plans',
    scrubbedExternal.labPlanDraft?.sourceText === undefined
    && !JSON.stringify(scrubbedExternal).includes('raw private marker sentence')
    && (scrubbedExternalData.agentArtifacts?.labPlans?.length || 0) === 0,
    JSON.stringify({ scrubbedExternal, scrubbedExternalData }));

  let proposalNotice = '';
  await accessProposals.proposeAgentAction('context.update', { text: 'I have low sunlight lately' }, {
    importedData: { entries: [], supplements: [], healthGoals: [], changeHistory: [] },
    save: false,
    source: 'hermes',
    notify: true,
    showNotification: (msg) => { proposalNotice = msg; },
  });
  assert('Agent Access proposal creation can notify when external proposals arrive',
    /drafted 1 action/i.test(proposalNotice),
    proposalNotice);

  const inboxHistoryHtml = proposalInbox.renderAgentProposalInbox({ importedData: inboxData, showHistory: true });
  assert('proposal inbox renders count badge, dismissed history, and structured details on demand',
    /agent-proposal-count/.test(inboxHistoryHtml)
    && /1 pending/.test(inboxHistoryHtml)
    && /data-agent-proposal-inbox-action="toggle-history"/.test(inboxHistoryHtml)
    && /dismissed/.test(inboxHistoryHtml)
    && /<details/.test(inboxHistoryHtml)
    && /Profile context update/.test(inboxHistoryHtml),
    inboxHistoryHtml);

  const libraryData = { agentArtifacts: { labPlans: [storedLabPlan] } };
  const libraryHtml = artifactLibrary.renderAgentArtifactLibrary({ importedData: libraryData });
  assert('agent artifact library renders durable lab-plan drafts with copy and prelab actions',
    /Agent drafts/.test(libraryHtml)
    && /Draft lab plan/.test(libraryHtml)
    && /data-agent-artifact-action="copy-lab-plan"/.test(libraryHtml)
    && /data-agent-artifact-action="create-prelab-checklist"/.test(libraryHtml),
    libraryHtml);

  const checklist = await artifacts.createPrelabChecklistFromLabPlan(storedLabPlan.id, { importedData: libraryData, save: false, now: 1780000000000 });
  assert('lab-plan drafts can become prelab checklists without ordering anything',
    checklist?.artifactType === 'prelabChecklist'
    && checklist.status === 'draft'
    && checklist.items.some(item => item.marker === 'Fasting insulin' && item.status === 'unmapped')
    && libraryData.agentArtifacts.prelabChecklists?.[0]?.id === checklist.id,
    JSON.stringify({ checklist, artifacts: libraryData.agentArtifacts }));

  const syncLocal = { agentArtifacts: { labPlans: [{ id: 'local-plan', updatedAt: 20, title: 'Local' }], prelabChecklists: [] }, agentProposals: [{ id: 'p1', status: 'dismissed', updatedAt: 30 }] };
  const syncRemote = { agentArtifacts: { labPlans: [{ id: 'remote-plan', updatedAt: 10, title: 'Remote' }, { id: 'local-plan', updatedAt: 5, title: 'Old local' }] }, agentProposals: [{ id: 'p1', status: 'pending', updatedAt: 5 }, { id: 'p2', status: 'pending', updatedAt: 10 }] };
  const mergedAgentState = accessProposals.mergeAgentProposalState(syncLocal, syncRemote);
  artifacts.mergeAgentArtifacts(syncLocal, syncRemote);
  assert('agent artifact/proposal sync merge keeps independent drafts and newest proposal status',
    syncLocal.agentArtifacts.labPlans.some(item => item.id === 'local-plan' && item.title === 'Local')
    && syncLocal.agentArtifacts.labPlans.some(item => item.id === 'remote-plan')
    && mergedAgentState.agentProposals.some(item => item.id === 'p1' && item.status === 'dismissed')
    && mergedAgentState.agentProposals.some(item => item.id === 'p2' && item.status === 'pending'),
    JSON.stringify(syncLocal));
  assert('agent artifacts and proposals are registered for delta sync with stable ids',
    deltaSurfaces.DELTA_ARRAYS.includes('agentArtifacts.labPlans')
    && deltaSurfaces.DELTA_ARRAYS.includes('agentArtifacts.prelabChecklists')
    && deltaSurfaces.DELTA_ARRAYS.includes('agentProposals')
    && deltaConfig.DELTA_ARRAY_CONFIG['agentArtifacts.labPlans'].itemIdFn({ id: 'plan-1' }) === 'plan-1'
    && deltaConfig.DELTA_ARRAY_CONFIG['agentArtifacts.prelabChecklists'].itemIdFn({ id: 'check-1' }) === 'check-1'
    && deltaConfig.DELTA_ARRAY_CONFIG.agentProposals.itemIdFn({ id: 'proposal-1' }) === 'proposal-1',
    JSON.stringify({ arrays: deltaSurfaces.DELTA_ARRAYS, configKeys: Object.keys(deltaConfig.DELTA_ARRAY_CONFIG) }));

  const raceData = { entries: [], supplements: [], healthGoals: [], changeHistory: [] };
  const raceProposal = await accessProposals.proposeAgentAction('context.update', { text: 'I am sleeping badly lately' }, { importedData: raceData, save: false, notify: false });
  const firstRaceApply = await accessProposals.applyStoredAgentProposal(raceProposal.id, { importedData: raceData, save: false, now: 1780000000000 });
  const secondRaceApply = await accessProposals.applyStoredAgentProposal(raceProposal.id, { importedData: raceData, save: false, now: 1780000000001 });
  assert('Agent Access apply path is single-flight and refuses already handled proposals',
    firstRaceApply?.status === 'applied'
    && secondRaceApply === null
    && raceData.changeHistory.length === 1,
    JSON.stringify({ firstRaceApply, secondRaceApply, raceData }));

  const badData = { agentProposals: [{ id: 'bad1', status: 'pending', actionId: 'context.update', agentProposal: { surface: 'supplements', changes: [] } }] };
  let badApplyRejected = false;
  try { await accessProposals.applyStoredAgentProposal('bad1', { importedData: badData, save: false }); }
  catch { badApplyRejected = true; }
  assert('Agent Access apply path revalidates action surface and rejects smuggled proposals',
    badApplyRejected === true && badData.agentProposals[0].status === 'pending',
    JSON.stringify(badData));

  const noPayloadData = { agentProposals: [{ id: 'empty-payload', status: 'pending', actionId: 'future.action', updatedAt: 1 }] };
  let noPayloadRejected = false;
  try { await accessProposals.applyStoredAgentProposal('empty-payload', { importedData: noPayloadData, save: false }); }
  catch { noPayloadRejected = true; }
  assert('Agent Access apply path refuses payload-less future records without marking applied',
    noPayloadRejected === true && noPayloadData.agentProposals[0].status === 'pending',
    JSON.stringify(noPayloadData));

  const labApplyData = { agentArtifacts: { labPlans: [], prelabChecklists: [] }, agentProposals: [{ id: 'lab-apply', status: 'pending', actionId: 'labPlan.create', labPlanDraft: { ...scrubbedExternal.labPlanDraft, sourceText: 'must not persist' } }] };
  const labApplied = await accessProposals.applyStoredAgentProposal('lab-apply', { importedData: labApplyData, save: false });
  assert('Agent Access lab-plan apply persists only after confirmation and keeps raw source text scrubbed',
    labApplied?.status === 'applied'
    && labApplyData.agentArtifacts.labPlans.length === 1
    && labApplyData.agentArtifacts.labPlans[0].sourceText === undefined
    && !JSON.stringify(labApplyData.agentArtifacts.labPlans[0]).includes('must not persist'),
    JSON.stringify(labApplyData));

  const fallbackLabPlanText = synthesis.buildAgentFallbackContent('draft-lab-plan', labPlanDraft);
  assert('agent synthesis fallback stays concise and leaves markers to card',
    /drafted 2 marker bundles/i.test(fallbackLabPlanText)
    && !/Fasting insulin/.test(fallbackLabPlanText)
    && !/Total testosterone/.test(fallbackLabPlanText),
    fallbackLabPlanText);

  const serializedToolResult = synthesis.serializeAgentToolResult('draft-lab-plan', labPlanDraft);
  assert('agent synthesis serializes structured tool facts for LLM synthesis',
    serializedToolResult.intent === 'draft-lab-plan'
    && serializedToolResult.surface === 'labPlan'
    && serializedToolResult.bundles.some(b => b.label === 'Insulin resistance / glucose control' && b.markers.includes('Fasting insulin'))
    && serializedToolResult.safety === 'Draft only — nothing is ordered, saved, or sent anywhere.',
    JSON.stringify(serializedToolResult));

  const synthesizedLabPlanText = await synthesis.synthesizeAgentToolResponse({
    userText: 'build me a lab plan for insulin resistance and low testosterone',
    intent: 'draft-lab-plan',
    toolResult: labPlanDraft,
    hasAI: () => true,
    callAI: async (request) => {
      return {
        text: request.messages[0].content.includes('Fasting insulin')
          ? 'Yep — I would split this into glucose handling and androgen-axis context. I drafted the exact marker set below; nothing is ordered or saved yet.'
          : 'bad prompt',
      };
    },
  });
  assert('agent synthesis uses AI to produce conversational prose from tool facts',
    /glucose handling/i.test(synthesizedLabPlanText.content)
    && /androgen-axis/i.test(synthesizedLabPlanText.content)
    && synthesizedLabPlanText.usedAI === true
    && !/bad prompt/.test(synthesizedLabPlanText.content),
    JSON.stringify(synthesizedLabPlanText));

  const synthesizedHandled = await runtime.handleAgentUserTurn('build me a lab plan for insulin resistance and low testosterone', {
    importedData: { entries: [], supplements: [], healthGoals: [], changeHistory: [] },
    appendToChat: false,
    synthesizeAgentResponse: async () => 'Natural AI response: I drafted the marker set below and kept it as a draft.',
    save: false,
  });
  assert('agent runtime can use synthesized AI prose while keeping the structured lab-plan card',
    synthesizedHandled.handled === true
    && /Natural AI response/.test(synthesizedHandled.result.assistantMessage.content)
    && synthesizedHandled.result.assistantMessage.labPlanDraft?.bundles?.some(b => b.markers.includes('Fasting insulin')),
    JSON.stringify(synthesizedHandled));

  const scoreInvestigationData = { changeHistory: [] };
  const scoreInvestigation = tools.investigateBiologyScore('why is my hormone axis bad?', {
    importedData: scoreInvestigationData,
    biologyScores: [
      {
        id: 'hormoneAxis',
        title: 'Hormone Axis',
        score: 42,
        tone: 'poor',
        scoreConfidenceLabel: 'Low confidence',
        coverage: 0.38,
        available: [{ label: 'Total testosterone' }, { label: 'SHBG' }],
        missing: [{ label: 'LH', core: true }, { label: 'FSH', core: true }, { label: 'Prolactin', core: true }],
        flags: ['Missing core markers: LH, FSH, Prolactin. Treat the number as provisional.', 'Low testosterone signal needs pituitary context.'],
      },
    ],
  });
  assert('Biology Score investigation tool returns a read-only deterministic score summary',
    scoreInvestigation?.surface === 'biologyScoreInvestigation'
    && scoreInvestigation.writeLevel === 'read-only'
    && scoreInvestigation.scoreId === 'hormoneAxis'
    && scoreInvestigation.scoreValue === 42
    && scoreInvestigation.missingMarkers.includes('LH')
    && scoreInvestigation.flags.some(f => /pituitary/i.test(f))
    && scoreInvestigationData.changeHistory.length === 0,
    JSON.stringify({ scoreInvestigation, scoreInvestigationData }));

  const scoreHandled = await runtime.handleAgentUserTurn('why is my hormone axis bad?', {
    importedData: scoreInvestigationData,
    biologyScores: [scoreInvestigation.sourceScore],
    appendToChat: false,
  });
  assert('agent user-turn handler returns a read-only Biology Score investigation card message',
    scoreHandled.handled === true
    && scoreHandled.result.policy.writeLevel === 'read-only'
    && scoreHandled.result.toolCalls.some(t => t.id === 'investigate_biology_score')
    && scoreHandled.result.assistantMessage.scoreInvestigation?.scoreId === 'hormoneAxis'
    && /Hormone Axis/.test(scoreHandled.result.assistantMessage.content)
    && scoreHandled.result.assistantMessage.scoreInvestigation?.missingMarkers?.includes('LH')
    && !/LH/.test(scoreHandled.result.assistantMessage.content)
    && scoreInvestigationData.changeHistory.length === 0,
    JSON.stringify({ scoreHandled, scoreInvestigationData }));

  const revised = actions.reviseAgentActionProposal('supplement.update', draft, {
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
    && contextDraft.changes.some(c => c.field === 'exercise' && /restarting training/i.test(c.patch.note || ''))
    && contextDraft.changes.some(c => c.field === 'lightCircadian' && /low sunlight/i.test(c.patch.note || ''))
    && contextDraft.changes.some(c => c.field === 'healthGoals' && /improve recovery/i.test(c.item.text))
    && contextDraftData.sleepRest.quality === 'good'
    && contextDraftData.healthGoals.length === 0,
    JSON.stringify({ contextDraft, contextDraftData }));
  const richerContextDraft = tools.draftContextChangeProposal(richerContextText, { today: '2026-06-26', importedData: { healthGoals: [], changeHistory: [] } });
  assert('context proposal drafting uses router variants for sleep, exercise, sunlight, and goals',
    richerContextDraft?.changes.some(c => c.field === 'sleepRest' && c.patch.quality === 'poor')
    && richerContextDraft.changes.some(c => c.field === 'exercise' && /restarting training/i.test(c.patch.note || ''))
    && richerContextDraft.changes.some(c => c.field === 'lightCircadian' && /low sunlight/i.test(c.patch.note || ''))
    && richerContextDraft.changes.some(c => c.field === 'healthGoals' && /lower inflammation/i.test(c.item.text)),
    JSON.stringify(richerContextDraft));

  const digestionText = 'My digestion got worse this week: bloating is severe, stools are loose, reflux is frequent, and dairy seems bad.';
  const digestionSignals = tools.detectAgentContextSignals(digestionText);
  assert('agent context signal router recognizes digestion as the real Diet & Digestion card',
    digestionSignals.some(e => e.type === 'context' && e.field === 'diet' && e.label === 'Diet & Digestion'),
    JSON.stringify(digestionSignals));
  const digestionDraftData = { diet: { type: 'paleo', pattern: '2 meals/day', note: 'old diet note' }, changeHistory: [] };
  const constipationText = 'im having constipation for three days now';
  const constipationIntent = runtime.classifyAgentIntent(constipationText);
  assert('constipation phrasing is intercepted as a Diet & Digestion context proposal, not sent to normal LLM chat',
    constipationIntent.intent === 'record-context-change'
    && constipationIntent.entities.some(e => e.type === 'context' && e.field === 'diet'),
    JSON.stringify(constipationIntent));
  const constipationDraft = tools.draftContextChangeProposal(constipationText, { today: '2026-06-26', importedData: { diet: null, changeHistory: [] } });
  const constipationChange = constipationDraft?.changes.find(c => c.field === 'diet');
  assert('constipation proposal maps to existing bowel/stool fields and note',
    constipationChange?.patch.stoolConsistency === 'hard/pellets'
    && constipationChange.patch.bowelFrequency === 'every other day'
    && constipationChange.patch.note.includes('constipation')
    && constipationDraft.summary === 'Diet & Digestion'
    && !('digestion' in constipationChange.patch),
    JSON.stringify(constipationDraft));

  const localizedContext = await runtime.handleAgentUserTurn('Mám tři dny zácpu a nafouklé břicho', {
    importedData: { diet: null, changeHistory: [] },
    appendToChat: false,
    classifyAgentIntentAI: async () => ({ intent: 'chat', confidence: 'low', reason: 'router missed localized context' }),
    extractContextChangeProposal: async () => ({
      changes: [
        {
          field: 'diet',
          patch: {
            digestion: 'worse',
            bowelFrequency: 'irregular',
            bloating: 'moderate',
            note: 'User reported context: Mám tři dny zácpu a nafouklé břicho.',
          },
        },
      ],
    }),
  });
  const localizedDietChange = localizedContext.result?.assistantMessage?.agentProposal?.changes?.find(c => c.field === 'diet');
  assert('AI structured context extractor handles localized wording through schema validation',
    localizedContext.handled === true
    && localizedContext.intent.intent === 'record-context-change'
    && localizedContext.intent.extractedFromChatFallback === true
    && localizedDietChange?.patch.bowelFrequency === 'irregular'
    && localizedDietChange.patch.stoolConsistency === 'hard/pellets'
    && localizedDietChange.patch.bloating === 'moderate'
    && localizedDietChange.patch.note === 'Mám tři dny zácpu a nafouklé břicho.'
    && !/I think you want|### Proposed update|digestive context/i.test(localizedContext.result.assistantMessage.content || '')
    && !('digestion' in localizedDietChange.patch),
    JSON.stringify(localizedContext));

  const rejectedStructured = tools.buildContextChangeProposalFromStructured({
    changes: [
      { field: 'diet', patch: { digestion: 'worse', bowelFrequency: 'blocked for 3 days' } },
      { field: 'notARealCard', patch: { anything: 'x' } },
    ],
  }, { sourceText: 'localized wording that only produced fake fields' });
  assert('structured context validator rejects fake fields/options instead of inventing schema',
    rejectedStructured === null,
    JSON.stringify(rejectedStructured));

  const digestionDraft = tools.draftContextChangeProposal(digestionText, { today: '2026-06-26', importedData: digestionDraftData });
  const dietChange = digestionDraft?.changes.find(c => c.field === 'diet');
  assert('digestion proposal uses existing Diet & Digestion fields/options, not invented keys',
    digestionDraft?.surface === 'context'
    && dietChange?.patch.stoolConsistency === 'loose'
    && dietChange.patch.bloating === 'severe'
    && dietChange.patch.acidReflux === 'frequent'
    && Array.isArray(dietChange.patch.foodSensitivities)
    && dietChange.patch.foodSensitivities.includes('dairy')
    && dietChange.patch.note.includes('digestive context')
    && !('digestion' in dietChange.patch)
    && digestionDraftData.diet.note === 'old diet note',
    JSON.stringify({ digestionDraft, digestionDraftData }));
  const digestionApplyData = { diet: { type: 'paleo', pattern: '2 meals/day', note: 'old diet note' }, changeHistory: [] };
  await actions.applyAgentAction('context.update', digestionDraft, { importedData: digestionApplyData, now: 1780000000001, save: false });
  assert('applying digestion proposal preserves existing diet fields and appends note',
    digestionApplyData.diet.type === 'paleo'
    && digestionApplyData.diet.pattern === '2 meals/day'
    && digestionApplyData.diet.stoolConsistency === 'loose'
    && digestionApplyData.diet.bloating === 'severe'
    && digestionApplyData.diet.acidReflux === 'frequent'
    && digestionApplyData.diet.note.includes('old diet note')
    && digestionApplyData.diet.note.includes('digestive context')
    && !('digestion' in digestionApplyData.diet),
    JSON.stringify(digestionApplyData));

  const contextApplyData = { sleepRest: { duration: '7-8h', quality: 'good', note: 'old' }, healthGoals: [], changeHistory: [] };
  const contextApplied = await actions.applyAgentAction('context.update', contextDraft, {
    importedData: contextApplyData,
    now: 1780000000000,
    save: false,
  });
  assert('applying confirmed context proposal updates context cards and records agent audit history',
    contextApplied.status === 'applied'
    && contextApplyData.sleepRest.quality === 'poor'
    && /poor sleep|sleeping badly/i.test(contextApplyData.sleepRest.note)
    && /restarting training/i.test(contextApplyData.exercise.note)
    && /low sunlight/i.test(contextApplyData.lightCircadian.note)
    && contextApplyData.healthGoals.some(g => /improve recovery/i.test(g.text))
    && contextApplyData.changeHistory.some(h => h.source === 'agent' && h.surface === 'context' && h.confirmedByUser === true),
    JSON.stringify(contextApplyData));

  const handlersForRollback = runtime.getAgentProposalHandlers();
  const originalContextApply = handlersForRollback.context.apply;
  state.importedData = { diet: { note: 'before failed save' }, changeHistory: [] };
  state.chatHistory = [{
    role: 'assistant',
    content: 'pending proposal',
    agentProposal: { id: 'failed_save_regression', surface: 'context', status: 'pending', requiresConfirmation: true, changes: [] },
  }];
  handlersForRollback.context.apply = async () => {
    state.importedData.diet.note = 'mutated before failed save';
    throw new Error('simulated storage failure');
  };
  const failedApply = await runtime.applyAgentProposalFromChat(0);
  handlersForRollback.context.apply = originalContextApply;
  assert('failed proposal persistence leaves card pending and restores in-memory data',
    failedApply === null
    && state.chatHistory[0].agentProposal.status === 'pending'
    && state.importedData.diet.note === 'before failed save'
    && !/Applied/.test(state.chatHistory[0].content),
    JSON.stringify({ failedApply, msg: state.chatHistory[0], data: state.importedData }));

  let dismissedApplied = false;
  state.chatHistory = [{
    role: 'assistant',
    content: 'dismissed proposal',
    agentProposal: { id: 'dismissed_apply_regression', surface: 'context', status: 'dismissed', requiresConfirmation: true, changes: [] },
  }];
  handlersForRollback.context.apply = async () => { dismissedApplied = true; return { status: 'applied' }; };
  const dismissedApply = await runtime.applyAgentProposalFromChat(0);
  handlersForRollback.context.apply = originalContextApply;
  assert('proposal apply path refuses dismissed/non-pending proposals',
    dismissedApply === null && dismissedApplied === false && state.chatHistory[0].agentProposal.status === 'dismissed',
    JSON.stringify({ dismissedApply, dismissedApplied, msg: state.chatHistory[0] }));

  state.chatHistory = [{
    role: 'assistant',
    content: 'pending proposal',
    agentProposal: { id: 'dismiss_scrub_regression', surface: 'context', status: 'pending', requiresConfirmation: true, sourceText: 'very sensitive symptom text', changes: [] },
  }];
  await runtime.dismissAgentProposalFromChat(0);
  assert('dismissed proposals scrub raw sourceText from serialized chat proposal',
    state.chatHistory[0].agentProposal.status === 'dismissed'
    && !('sourceText' in state.chatHistory[0].agentProposal)
    && state.chatHistory[0].excludeFromAI === true,
    JSON.stringify(state.chatHistory[0]));

  const tamperedApplyData = { diet: { note: 'safe' }, changeHistory: [] };
  let tamperedRejected = false;
  try {
    await actions.applyAgentAction('context.update', {
      surface: 'context',
      mode: 'record-context-change',
      changes: [
        { field: 'diet', patch: { digestion: 'worse', bowelFrequency: 'blocked for 3 days' } },
        { field: 'notARealCard', patch: { arbitrary: 'write' } },
      ],
    }, { importedData: tamperedApplyData, now: 1780000000002, save: false });
  } catch { tamperedRejected = true; }
  assert('context proposal apply boundary revalidates fields/options before writing',
    tamperedRejected === true
    && tamperedApplyData.diet.note === 'safe'
    && !('notARealCard' in tamperedApplyData)
    && tamperedApplyData.changeHistory.length === 0,
    JSON.stringify(tamperedApplyData));

  const agentRuntimeSrc = fs.readFileSync('js/agent-runtime.js', 'utf8');
  const agentToolsSrc = fs.readFileSync('js/agent-tools.js', 'utf8');
  assert('proposal apply path does not mark applied after failed storage',
    agentRuntimeSrc.includes('rollbackData')
    && agentRuntimeSrc.includes('Could not save the proposed update')
    && agentToolsSrc.includes('Could not save context proposal')
    && agentToolsSrc.includes('Could not save supplement proposal'),
    'missing storage-failure rollback guard');

  const chatEmptySrc = fs.readFileSync('js/chat-empty-state.js', 'utf8');
  assert('chat empty state exposes Find what changed agent mode as a button, not a form submit',
    chatEmptySrc.includes('data-chat-empty-action="run-agent-mode"')
    && chatEmptySrc.includes('data-agent-mode="find-what-changed"')
    && /<button type="button"[^>]+data-chat-empty-action="run-agent-mode"/.test(chatEmptySrc),
    'missing run-agent-mode button');

  const chatSendSrc = fs.readFileSync('js/chat-send.js', 'utf8');
  assert('chat send path gives agent first refusal on context-change messages after persisting user turn',
    chatSendSrc.includes('handleAgentUserTurn')
    && /await saveChatHistory\(\);[\s\S]{0,1200}handleAgentUserTurn\(text/.test(chatSendSrc)
    && /handleAgentUserTurn\(text[\s\S]{0,1200}if \(!hasAIProvider\(\)\)/.test(chatSendSrc),
    'sendChatMessage does not call handleAgentUserTurn after saving user turn and before no-provider fallback');

  assert('chat send path shows a transient agent routing status before proposal extraction',
    chatSendSrc.includes('Checking whether this should use an app action…')
    && chatSendSrc.includes('agentPending: true')
    && chatSendSrc.includes('excludeFromAI: true')
    && chatSendSrc.includes('appendToChat: false'),
    'missing transient agent routing placeholder');
  assert('chat send path makes agent preflight abortable before normal chat begins',
    chatSendSrc.includes('_chatAbortController = new AbortController();')
    && /handleAgentUserTurn\(text,[\s\S]{0,160}signal: _chatAbortController/.test(chatSendSrc)
    && chatSendSrc.includes("setSendButtonMode(sendBtn, 'streaming')"),
    'missing abortable agent preflight');

  assert('chat send path can continue a dismissed proposal as normal chat without re-triggering the agent',
    chatSendSrc.includes('continueChatAfterAgentProposalDismissed')
    && chatSendSrc.includes('reuseUserText')
    && chatSendSrc.includes('skipAgent: true'),
    'missing dismissed-proposal normal-chat continuation');

  const chatRenderSrc = fs.readFileSync('js/chat-render.js', 'utf8');
  assert('chat renderer mounts agent proposal cards with explicit button types',
    chatRenderSrc.includes('renderAgentProposalCard')
    && chatRenderSrc.includes('data-chat-message-action="apply-agent-proposal"')
    && /<button type="button"[^>]+data-chat-message-action="apply-agent-proposal"/.test(chatRenderSrc)
    && chatRenderSrc.includes('Dismiss &amp; answer'),
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

  assert('chat renderer supports persisted Biology Score investigation cards',
    chatRenderSrc.includes('renderScoreInvestigationCard')
    && chatRenderSrc.includes('msg.scoreInvestigation')
    && chatRenderSrc.includes('agent-score-investigation-card'),
    'missing score investigation card rendering');

  const chatActions = await import('../js/chat-actions.js');
  assert('chat message copy helper includes lab-plan card contents',
    /Draft lab plan/.test(chatActions.buildMessageCopyText({ content: 'Here is the plan', labPlanDraft }))
    && /Fasting insulin/.test(chatActions.buildMessageCopyText({ content: 'Here is the plan', labPlanDraft }))
    && /Total testosterone/.test(chatActions.buildMessageCopyText({ content: 'Here is the plan', labPlanDraft })),
    chatActions.buildMessageCopyText({ content: 'Here is the plan', labPlanDraft }));

  assert('chat message copy helper includes Biology Score investigation card contents',
    /Hormone Axis/.test(chatActions.buildMessageCopyText({ content: 'Here is the score', scoreInvestigation }))
    && /LH/.test(chatActions.buildMessageCopyText({ content: 'Here is the score', scoreInvestigation }))
    && /pituitary/.test(chatActions.buildMessageCopyText({ content: 'Here is the score', scoreInvestigation })),
    chatActions.buildMessageCopyText({ content: 'Here is the score', scoreInvestigation }));

  const chatActionsSrc = fs.readFileSync('js/chat-actions.js', 'utf8');
  assert('chat actions wire apply/edit/dismiss agent proposal delegates',
    chatActionsSrc.includes("action === 'apply-agent-proposal'")
    && chatActionsSrc.includes("action === 'edit-agent-proposal'")
    && chatActionsSrc.includes("action === 'dismiss-agent-proposal'")
    && chatActionsSrc.includes("action === 'save-agent-proposal-edits'")
    && chatActionsSrc.includes('continueChatAfterAgentProposalDismissed'),
    'missing agent proposal action delegates');

  const promptContext = await import('../js/chat-prompt-context.js');
  const artifactMessages = promptContext.buildTaggedChatMessages([
    { role: 'user', content: 'Should I test insulin and testosterone next?' },
    { role: 'assistant', content: 'I drafted the marker set below.', labPlanDraft },
    { role: 'user', content: 'Are these all markers?' },
  ], 'House');
  assert('normal chat prompt context serializes prior lab-plan artifacts for follow-up grounding',
    artifactMessages[1]?.content.includes('[AUTHORITATIVE STRUCTURED RESULT FROM PREVIOUS ASSISTANT MESSAGE]')
    && artifactMessages[1].content.includes('Type: lab_plan')
    && artifactMessages[1].content.includes('Fasting insulin')
    && artifactMessages[1].content.includes('Total testosterone')
    && artifactMessages[1].content.includes('Do not invent a different list')
    && artifactMessages[2]?.content === 'Are these all markers?',
    JSON.stringify(artifactMessages));

  const artifactWithOtherPersona = promptContext.buildTaggedChatMessages([
    { role: 'assistant', personalityName: 'Analyst', content: 'Different persona made this card', labPlanDraft },
  ], 'House');
  assert('artifact grounding survives multi-persona assistant tagging',
    artifactWithOtherPersona[0]?.content.startsWith('[Response from Analyst]')
    && artifactWithOtherPersona[0].content.includes('Type: lab_plan')
    && artifactWithOtherPersona[0].content.includes('HbA1c'),
    JSON.stringify(artifactWithOtherPersona));

  const proposalArtifact = promptContext.serializeChatArtifact({
    agentProposal: { surface: 'context', status: 'pending', requiresConfirmation: true, sourceText: 'raw sensitive phrase', summary: 'Diet & Digestion', changes: [{ field: 'diet', patch: { note: 'kept note' }, sourceText: 'nested raw phrase' }] },
  });
  assert('agent proposal artifact context excludes raw proposal source text but keeps structured patch',
    proposalArtifact.includes('agent_proposal')
    && proposalArtifact.includes('Diet & Digestion')
    && proposalArtifact.includes('kept note')
    && !proposalArtifact.includes('raw sensitive phrase')
    && !proposalArtifact.includes('nested raw phrase'),
    proposalArtifact);

  const promptContextSrc = fs.readFileSync('js/chat-prompt-context.js', 'utf8');
  assert('dismissed/pending agent proposal messages are excluded from normal chat model context',
    promptContextSrc.includes('!message.excludeFromAI')
    && promptContextSrc.includes('serializeChatArtifact')
    && promptContextSrc.includes('messageContentWithArtifacts'),
    'buildTaggedChatMessages should skip excludeFromAI messages and serialize structured artifacts');

  const proposalInboxSrc = fs.readFileSync('js/agent-proposal-inbox.js', 'utf8');
  assert('proposal inbox keeps apply/dismiss module-private and rerenders real profile/context surfaces',
    proposalInboxSrc.includes('renderProfileContextCards')
    && proposalInboxSrc.includes('context-hub-overlay')
    && proposalInboxSrc.includes('buildSidebar')
    && proposalInboxSrc.includes("classList.contains('show')")
    && proposalInboxSrc.includes("typeof window !== 'undefined'")
    && !proposalInboxSrc.includes('proposalInboxWindow.applyStoredAgentProposal')
    && !proposalInboxSrc.includes('proposalInboxWindow.dismissStoredAgentProposal'),
    'proposal inbox should not expose write primitives globally and should refresh Context hub when mounted there');

  const contextHubSrc = fs.readFileSync('js/context-card-dashboard-ai.js', 'utf8');
  const navSrc = fs.readFileSync('js/nav.js', 'utf8');
  assert('Context hub and sidebar expose pending Agent proposals as a discoverable inbox',
    contextHubSrc.includes("import { renderAgentProposalInbox }")
    && contextHubSrc.includes('agentProposalInboxHtml')
    && contextHubSrc.includes('context-hub-dialog')
    && navSrc.includes('getPendingAgentProposalCount')
    && navSrc.includes('nav-agent-proposal-count')
    && navSrc.includes('has-agent-proposals')
    && navSrc.includes("_iconSvg(pendingAgentProposals > 0 ? 'inbox' : 'knowledge')"),
    'Context nav/modal should surface pending Agent proposals');

  const swSrc = fs.readFileSync('service-worker.js', 'utf8');
  assert('service worker caches new agent modules',
    swSrc.includes('/js/agent-tools.js') && swSrc.includes('/js/agent-context-schema.js') && swSrc.includes('/js/agent-response-synthesis.js') && swSrc.includes('/js/agent-artifacts.js') && swSrc.includes('/js/agent-access-proposals.js') && swSrc.includes('/js/agent-proposal-inbox.js') && swSrc.includes('/js/agent-artifact-library.js') && swSrc.includes('/js/agent-intent-router.js') && swSrc.includes('/js/agent-actions/registry.js') && swSrc.includes('/js/agent-runtime.js'),
    'agent modules missing from cache list');

} catch (err) {
  fail++;
  console.error('  FAIL: agent runtime tests threw');
  console.error(err && err.stack ? err.stack : err);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
if (process.argv[1] && process.argv[1].endsWith('test-agent-runtime.js')) process.exit(0);
