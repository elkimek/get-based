import { expect, test } from '@playwright/test';

const FIXED_NOW = '2026-09-01T10:30:00.000Z';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('labcharts-default-emptyTour', 'completed');
    localStorage.setItem('labcharts-default-tour', 'completed');
    localStorage.setItem('labcharts-ai-provider', 'ollama');
    localStorage.setItem('labcharts-ollama-model', 'agent-e2e-model');
    localStorage.setItem('labcharts-ai-transparency-acknowledgement', JSON.stringify({
      version: '2026-08-31',
      acknowledged: true,
      acknowledgedAt: '2026-09-01T10:00:00.000Z',
    }));
    localStorage.setItem('labcharts-legal-acceptance', JSON.stringify({
      accepted: true,
      termsVersion: '2026-08-22',
      privacyVersion: '2026-08-22',
      policyScope: 'self-hosted-notice',
      acceptedAt: '2026-09-01T10:00:00.000Z',
      appVersion: 'agent-e2e-test',
      location: 'agent-e2e-test',
    }));
  });
  await page.goto('/app', { waitUntil: 'load' });
});

async function prepareSunProposal(page, { profileId, proposalId }) {
  const consoleErrors = [];
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await page.evaluate(async ({ fixedNow, profileId: activeProfileId, proposalId: activeProposalId }) => {
    const [{ state }, agentRuntime, { openChatPanel }] = await Promise.all([
      import('/js/state.js'),
      import('/js/agent-runtime.js'),
      import('/js/chat-panel.js'),
    ]);
    state.currentProfile = activeProfileId;
    state.profiles = [{
      id: state.currentProfile,
      name: 'Agent Harness E2E',
      createdAt: Date.parse(fixedNow),
      lastUpdated: Date.parse(fixedNow),
      tags: [],
      notes: '',
      status: 'active',
      pinned: false,
    }];
    state.importedData = {
      entries: [],
      notes: [],
      supplements: [],
      healthGoals: [],
      changeHistory: [],
      sunSessions: [],
    };
    state.currentThreadId = `thread-${activeProposalId}`;
    state.chatHistory = [];
    agentRuntime.configureAgentRuntimeDeps({
      callAI: async () => ({
        text: JSON.stringify({
          decision: 'propose_action',
          actionId: 'sun.session.log',
          arguments: { durationMinutes: 60, endedAt: '', notes: 'Sunbathing' },
          message: 'I understood this as a completed sunlight session.',
        }),
        usage: { inputTokens: 12, outputTokens: 9 },
      }),
      createProposalId: () => activeProposalId,
      now: () => Date.parse(fixedNow),
      timeZone: () => 'Europe/Prague',
    });
    await openChatPanel();
  }, { fixedNow: FIXED_NOW, profileId, proposalId });

  const originalUrl = page.url();
  const input = page.locator('#chat-input');
  await input.fill('I was sunbathing for one hour');
  await page.locator('#chat-send-btn').click();

  const card = page.locator('.agent-proposal-card');
  await expect(card).toBeVisible();
  return { card, consoleErrors, originalUrl };
}

test('chat proposes and applies a completed sunlight session through real app persistence', async ({ page }) => {
  const { card, consoleErrors, originalUrl } = await prepareSunProposal(page, {
    profileId: 'agent-harness-e2e-apply',
    proposalId: 'proposal_agent_e2e_apply',
  });

  await expect(card).toContainText('Log completed sunlight session');
  await expect(card).toContainText('60 minutes');
  await expect(card).toContainText('Review before anything is saved');
  await expect(page.locator('.agent-proposal-apply')).toHaveAttribute('type', 'button');
  await expect(page.locator('.agent-proposal-dismiss')).toHaveAttribute('type', 'button');
  expect(page.url()).toBe(originalUrl);

  const beforeApply = await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    return {
      sessionCount: state.importedData.sunSessions?.length || 0,
      changeHistoryCount: state.importedData.changeHistory?.length || 0,
    };
  });
  expect(beforeApply).toEqual({ sessionCount: 0, changeHistoryCount: 0 });

  await page.locator('.agent-proposal-apply').click();
  await expect(card).toHaveAttribute('data-agent-proposal-status', 'applied');
  await expect(card).toContainText('Saved to Sun sessions');
  expect(page.url()).toBe(originalUrl);

  const outcome = await page.evaluate(async () => {
    const [{ state }, { encryptedGetItem }, { profileStorageKey }] = await Promise.all([
      import('/js/state.js'),
      import('/js/crypto.js'),
      import('/js/profile-storage-key.js'),
    ]);
    const stored = JSON.parse(await encryptedGetItem(profileStorageKey(state.currentProfile, 'imported')) || '{}');
    const session = state.importedData.sunSessions?.[0];
    const storedSession = stored.sunSessions?.[0];
    return {
      stateCount: state.importedData.sunSessions?.length || 0,
      storedCount: stored.sunSessions?.length || 0,
      durationMin: session?.durationMin,
      startedAt: session?.startedAt,
      endedAt: session?.endedAt,
      calculationStatus: session?.calculationStatus,
      createdBy: session?.createdBy,
      storedIdMatches: Boolean(session?.id && storedSession?.id === session.id),
    };
  });
  expect(outcome).toMatchObject({
    stateCount: 1,
    storedCount: 1,
    durationMin: 60,
    startedAt: Date.parse('2026-09-01T09:30:00.000Z'),
    endedAt: Date.parse(FIXED_NOW),
    calculationStatus: 'needs-location',
    createdBy: {
      type: 'agent',
      actorId: 'in-app-chat',
      actionId: 'sun.session.log',
    },
    storedIdMatches: true,
  });
  expect(consoleErrors).toEqual([]);
});

test('Cancel dismisses the proposal without changing profile data or navigating', async ({ page }) => {
  const { card, consoleErrors, originalUrl } = await prepareSunProposal(page, {
    profileId: 'agent-harness-e2e-cancel',
    proposalId: 'proposal_agent_e2e_cancel',
  });

  await page.locator('.agent-proposal-dismiss').click();
  await expect(card).toHaveAttribute('data-agent-proposal-status', 'dismissed');
  await expect(card).toContainText('Cancelled — nothing was saved');
  expect(page.url()).toBe(originalUrl);

  const stateAfterCancel = await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    return {
      sessionCount: state.importedData.sunSessions?.length || 0,
      changeHistoryCount: state.importedData.changeHistory?.length || 0,
      proposalStatus: state.chatHistory[1]?.agentProposal?.status,
    };
  });
  expect(stateAfterCancel).toEqual({
    sessionCount: 0,
    changeHistoryCount: 0,
    proposalStatus: 'dismissed',
  });
  expect(consoleErrors).toEqual([]);
});
