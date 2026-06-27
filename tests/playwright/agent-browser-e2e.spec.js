import { expect, test } from './coverage-fixture.js';

async function collectConsole(page) {
  const messages = [];
  page.on('console', msg => {
    if (msg.type() === 'error') messages.push(msg.text());
  });
  page.on('pageerror', err => messages.push(err.message));
  return messages;
}

async function prepareAgentApp(page, viewport = null) {
  if (viewport) await page.setViewportSize(viewport);
  await page.goto('/app?agent-e2e=1', { waitUntil: 'load' });
  await page.waitForSelector('#chat-input', { state: 'attached' });
  await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    state.currentProfile = 'agent_browser_e2e';
    state.profileSex = 'male';
    state.profiles = [{ id: 'agent_browser_e2e', name: 'Agent Browser E2E' }];
    state.currentThreadId = 'agent_browser_thread';
    state.chatHistory = [];
    state.importedData = {
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
      supplements: [{ name: 'Zinc', dosage: '15 mg', startDate: '2026-01-01' }],
      healthGoals: [],
      changeHistory: [],
    };
    window.endTour?.();
    document.getElementById('tour-overlay')?.remove();
    document.getElementById('tour-spotlight')?.remove();
    document.getElementById('tour-tooltip')?.remove();
    await window.openChatPanel?.();
  });
}

test('browser-local agent flows route, render cards, gate writes, and keep URL stable', async ({ page }) => {
  const consoleErrors = await collectConsole(page);
  await prepareAgentApp(page);

  const results = await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const beforeUrl = location.href;
    const stableProfileData = () => {
      const data = state.importedData;
      return JSON.stringify({
        entries: data.entries || [],
        supplements: data.supplements || [],
        healthGoals: data.healthGoals || [],
        changeHistory: data.changeHistory || [],
      });
    };
    const beforeRouterData = stableProfileData();
    const outcomes = {};

    let routerCalled = 0;
    const routed = await window.handleAgentUserTurn('Should I test insulin and testosterone next?', {
      appendToChat: true,
      classifyAgentIntentAI: async () => {
        routerCalled += 1;
        return { intent: 'draft-lab-plan', confidence: 'high', reason: 'ambiguous testing question' };
      },
      synthesizeAgentResponse: false,
    });
    await new Promise(resolve => setTimeout(resolve, 100));
    let chatText = document.querySelector('#chat-messages')?.innerText || '';
    outcomes.aiRouterRoutesAmbiguousLabPlan = routed.handled === true
      && routed.intent.intent === 'draft-lab-plan'
      && routerCalled === 1
      && !!document.querySelector('.agent-lab-plan-card')
      && /Insulin resistance \/ glucose control/.test(chatText)
      && /Low testosterone \/ androgen axis/.test(chatText)
      && (chatText.match(/Fasting insulin/g) || []).length === 1
      && stableProfileData() === beforeRouterData
      && location.href === beforeUrl;

    let deterministicRouterCalled = false;
    const deterministic = await window.resolveAgentIntent('build me a lab plan for insulin resistance', {
      classifyAgentIntentAI: async () => {
        deterministicRouterCalled = true;
        return { intent: 'chat', confidence: 'low' };
      },
    });
    outcomes.deterministicIntentBypassesAIRouter = deterministic.intent === 'draft-lab-plan'
      && deterministicRouterCalled === false;

    const nav = await window.handleAgentUserTurn('show my biology scores', { appendToChat: true });
    outcomes.navigationIsSafeAndStable = nav.handled === true
      && nav.result.policy.writeLevel === 'navigation'
      && state.currentView === 'biology-scores'
      && location.href === beforeUrl
      && state.importedData.changeHistory.length === 0;

    const changed = await window.runGetbasedAgentMode('find-what-changed', { appendToChat: true });
    chatText = document.querySelector('#chat-messages')?.innerText || '';
    outcomes.findWhatChangedRendersComparison = changed.status === 'completed'
      && /What changed/.test(chatText)
      && /CRP/.test(chatText)
      && /Ferritin/.test(chatText)
      && state.importedData.changeHistory.length === 0;

    const score = await window.handleAgentUserTurn('why is my hormone axis bad?', {
      appendToChat: true,
      biologyScores: [{
        id: 'hormoneAxis',
        title: 'Hormone Axis',
        score: 42,
        tone: 'poor',
        scoreConfidenceLabel: 'Low confidence',
        coverage: 0.38,
        available: [{ label: 'Total testosterone' }, { label: 'SHBG' }],
        missing: [{ label: 'LH', core: true }, { label: 'FSH', core: true }, { label: 'Prolactin', core: true }],
        flags: ['Missing core markers: LH, FSH, Prolactin. Treat the number as provisional.', 'Low testosterone signal needs pituitary context.'],
      }],
      synthesizeAgentResponse: false,
    });
    const scoreMsg = state.chatHistory.at(-1);
    chatText = document.querySelector('#chat-messages')?.innerText || '';
    outcomes.scoreInvestigationIsReadOnlyCard = score.handled === true
      && !!document.querySelector('.agent-score-investigation-card')
      && scoreMsg.scoreInvestigation?.missingMarkers?.includes('LH')
      && !/LH/.test(scoreMsg.content)
      && /Hormone Axis/.test(chatText)
      && state.importedData.changeHistory.length === 0;

    const beforeProposalData = JSON.stringify(state.importedData);
    const proposal = await window.handleAgentUserTurn('I started creatine 5g daily and stopped zinc last week', {
      appendToChat: true,
      today: '2026-06-26',
    });
    const proposalIndex = state.chatHistory.length - 1;
    const afterDraftData = JSON.stringify(state.importedData);
    const applied = await window.applyAgentProposalFromChat(proposalIndex);
    outcomes.contextWriteIsConfirmationGated = proposal.handled === true
      && !!proposal.result.assistantMessage.agentProposal
      && beforeProposalData === afterDraftData
      && applied?.status === 'applied'
      && state.importedData.supplements.some(item => item.name === 'Creatine' && item.dosage === '5g')
      && state.importedData.supplements.some(item => item.name === 'Zinc' && item.endDate === '2026-06-19')
      && state.importedData.changeHistory.some(item => item.source === 'agent' && item.confirmedByUser === true);

    state.importedData.diet = { type: 'paleo', pattern: '2 meals/day', note: 'old diet note' };
    const beforeConstipationProposal = JSON.stringify(state.importedData.diet);
    const constipationProposal = await window.handleAgentUserTurn('im having constipation for three days now', {
      appendToChat: true,
      today: '2026-06-26',
    });
    const constipationProposalIndex = state.chatHistory.length - 1;
    await new Promise(resolve => setTimeout(resolve, 100));
    const constipationDraftText = document.querySelector('#chat-messages')?.innerText || '';
    const afterConstipationDraft = JSON.stringify(state.importedData.diet);
    await window.applyAgentProposalFromChat(constipationProposalIndex);
    outcomes.constipationDoesNotFallThroughToLLM = constipationProposal.handled === true
      && constipationProposal.intent.intent === 'record-context-change'
      && constipationProposal.result.assistantMessage.agentProposal?.changes?.some(change => change.field === 'diet' && !('digestion' in change.patch))
      && beforeConstipationProposal === afterConstipationDraft
      && /Diet & Digestion/.test(constipationDraftText)
      && /Stool consistency: hard\/pellets/.test(constipationDraftText)
      && /Bowel frequency: every other day/.test(constipationDraftText)
      && !/consult a physician promptly/i.test(constipationDraftText)
      && state.importedData.diet.stoolConsistency === 'hard/pellets'
      && state.importedData.diet.bowelFrequency === 'every other day'
      && state.importedData.diet.note.includes('constipation')
      && !('digestion' in state.importedData.diet);

    state.importedData.diet = { type: 'paleo', pattern: '2 meals/day', note: 'old diet note' };
    const beforeLocalizedProposal = JSON.stringify(state.importedData.diet);
    const localizedProposal = await window.handleAgentUserTurn('Mám tři dny zácpu a nafouklé břicho', {
      appendToChat: true,
      today: '2026-06-26',
      classifyAgentIntentAI: async () => ({ intent: 'chat', confidence: 'low', reason: 'router missed localized context' }),
      extractContextChangeProposal: async () => ({
        changes: [{
          field: 'diet',
          patch: {
            digestion: 'worse',
            bowelFrequency: 'irregular',
            bloating: 'moderate',
            note: 'User reported context: Mám tři dny zácpu a nafouklé břicho.',
          },
        }],
      }),
    });
    const localizedProposalIndex = state.chatHistory.length - 1;
    await new Promise(resolve => setTimeout(resolve, 100));
    const localizedDraftText = document.querySelector('#chat-messages .chat-msg:last-child')?.innerText || '';
    const afterLocalizedDraft = JSON.stringify(state.importedData.diet);
    await window.applyAgentProposalFromChat(localizedProposalIndex);
    outcomes.localizedContextUsesAIExtractorAndSchema = localizedProposal.handled === true
      && localizedProposal.result.assistantMessage.agentProposal?.changes?.some(change => change.field === 'diet' && !('digestion' in change.patch))
      && beforeLocalizedProposal === afterLocalizedDraft
      && /Diet & Digestion/.test(localizedDraftText)
      && /Bowel frequency: irregular/.test(localizedDraftText)
      && /Stool consistency: hard\/pellets/.test(localizedDraftText)
      && /Bloating: moderate/.test(localizedDraftText)
      && !/I think you want|digestive context|User reported context/i.test(localizedDraftText)
      && state.importedData.diet.bowelFrequency === 'irregular'
      && state.importedData.diet.stoolConsistency === 'hard/pellets'
      && state.importedData.diet.bloating === 'moderate'
      && state.importedData.diet.note.includes('old diet note')
      && state.importedData.diet.note.includes('Mám tři dny zácpu a nafouklé břicho.')
      && !/User reported context/i.test(state.importedData.diet.note)
      && !('digestion' in state.importedData.diet);

    state.importedData.diet = { type: 'paleo', pattern: '2 meals/day', note: 'old diet note' };
    const beforeDietProposal = JSON.stringify(state.importedData.diet);
    const dietProposal = await window.handleAgentUserTurn('My digestion got worse this week: bloating is severe, stools are loose, reflux is frequent, and dairy seems bad.', {
      appendToChat: true,
      today: '2026-06-26',
    });
    const dietProposalIndex = state.chatHistory.length - 1;
    await new Promise(resolve => setTimeout(resolve, 100));
    const dietDraftText = document.querySelector('#chat-messages')?.innerText || '';
    const afterDietDraft = JSON.stringify(state.importedData.diet);
    const dietApplied = await window.applyAgentProposalFromChat(dietProposalIndex);
    outcomes.digestionContextUsesRealDietFields = dietProposal.handled === true
      && dietProposal.result.assistantMessage.agentProposal?.changes?.some(change => change.field === 'diet' && !('digestion' in change.patch))
      && beforeDietProposal === afterDietDraft
      && /Diet & Digestion/.test(dietDraftText)
      && /Stool consistency: loose/.test(dietDraftText)
      && /Bloating: severe/.test(dietDraftText)
      && /Acid reflux: frequent/.test(dietDraftText)
      && dietApplied?.status === 'applied'
      && state.importedData.diet.type === 'paleo'
      && state.importedData.diet.pattern === '2 meals/day'
      && state.importedData.diet.stoolConsistency === 'loose'
      && state.importedData.diet.bloating === 'severe'
      && state.importedData.diet.acidReflux === 'frequent'
      && state.importedData.diet.foodSensitivities?.includes('dairy')
      && state.importedData.diet.note.includes('old diet note')
      && state.importedData.diet.note.includes('digestive context')
      && !('digestion' in state.importedData.diet)
      && state.importedData.changeHistory.some(item => item.source === 'agent' && item.surface === 'context' && item.confirmedByUser === true);

    const normalChat = await window.handleAgentUserTurn('Tell me a gentle story about mitochondria', {
      appendToChat: true,
      classifyAgentIntentAI: async () => ({ intent: 'chat', confidence: 'high', reason: 'ordinary conversation' }),
    });
    outcomes.normalChatFallsThrough = normalChat.handled === false && normalChat.intent.intent === 'chat';

    return outcomes;
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
  expect(consoleErrors, 'browser console errors').toEqual([]);
});

test('agent chat cards remain usable on narrow mobile viewport', async ({ page }) => {
  const consoleErrors = await collectConsole(page);
  await prepareAgentApp(page, { width: 390, height: 844 });

  const results = await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    await window.handleAgentUserTurn('build me a lab plan for insulin resistance and low testosterone', {
      appendToChat: true,
      synthesizeAgentResponse: false,
    });
    await new Promise(resolve => setTimeout(resolve, 100));
    const card = document.querySelector('.agent-lab-plan-card');
    const copyButton = Array.from(document.querySelectorAll('[data-chat-message-action="copy-lab-plan-draft"]'))
      .find(button => {
        const r = button.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });
    const rect = card?.getBoundingClientRect();
    const btnRect = copyButton?.getBoundingClientRect();
    const text = document.querySelector('#chat-messages')?.innerText || '';
    return {
      cardVisible: !!card && rect.width > 0 && rect.height > 0,
      cardFitsViewport: !!rect && rect.left >= -1 && rect.right <= window.innerWidth + 1,
      actionButtonUsable: !!copyButton && btnRect.width >= 40 && btnRect.height >= 28,
      markerNotDuplicatedInIntro: (text.match(/Fasting insulin/g) || []).length === 1,
      noWrites: state.importedData.changeHistory.length === 0,
    };
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
  expect(consoleErrors, 'browser console errors').toEqual([]);
});
