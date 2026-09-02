// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  configureAgentActionDeps,
  getAgentActionManifest,
  runAgentAction,
  validateAgentActionInput,
} from '../js/agent-actions/registry.js';
import {
  AGENT_PLANNER_SCHEMA,
  applyAgentProposal,
  configureAgentRuntimeDeps,
  dismissAgentProposal,
  handleAgentUserTurn,
  planAgentTurn,
} from '../js/agent-runtime.js';
import { renderAgentProposalCard } from '../js/agent-proposal-ui.js';
import { configureChatSendAgentDeps, sendChatMessage } from '../js/chat-send.js';
import {
  configureChatMessageActionDeps,
  installChatMessageActionDelegates,
} from '../js/chat-actions.js';
import { renderChatMessages } from '../js/chat-render.js';
import { state } from '../js/state.js';
import { configureSunSessionsStore, logCompletedSession } from '../js/sun-sessions-store.js';

const defaultDeps = configureAgentActionDeps();
const defaultRuntimeDeps = configureAgentRuntimeDeps();
const defaultChatActionDeps = configureChatMessageActionDeps();
const defaultChatSendAgentDeps = configureChatSendAgentDeps();
const defaultSunStoreDeps = configureSunSessionsStore();
const originalImportedData = structuredClone(state.importedData);

afterEach(() => {
  configureAgentActionDeps(defaultDeps);
  configureAgentRuntimeDeps(defaultRuntimeDeps);
  configureChatMessageActionDeps(defaultChatActionDeps);
  configureChatSendAgentDeps(defaultChatSendAgentDeps);
  state.chatHistory = [];
  state.importedData = structuredClone(originalImportedData);
  state.currentThreadId = null;
  configureSunSessionsStore(defaultSunStoreDeps);
  localStorage.clear();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('getbased agent action registry', () => {
  it('publishes a typed confirmation-gated sunlight-session capability', () => {
    const manifest = getAgentActionManifest();

    expect(manifest).toContainEqual(expect.objectContaining({
      id: 'sun.session.log',
      label: 'Log completed sunlight session',
      writeLevel: 'profile',
      confirmationPolicy: 'always',
      requiresConfirmation: true,
      scopes: ['sun.sessions:write'],
      inputSchema: expect.objectContaining({
        type: 'object',
        additionalProperties: false,
        required: ['durationMinutes'],
      }),
    }));
    expect(JSON.stringify(manifest)).not.toContain('function');
  });

  it('accepts only bounded semantic sunlight-session arguments', () => {
    expect(validateAgentActionInput('sun.session.log', {
      durationMinutes: 60,
      endedAt: '2026-09-01T10:30:00.000Z',
      notes: 'Sunbathing',
    })).toEqual({
      ok: true,
      value: {
        durationMinutes: 60,
        endedAt: '2026-09-01T10:30:00.000Z',
        notes: 'Sunbathing',
      },
      errors: [],
    });

    expect(validateAgentActionInput('sun.session.log', {
      durationMinutes: 0,
      digestion: 'worse',
    })).toMatchObject({
      ok: false,
      errors: expect.arrayContaining([
        'durationMinutes must be greater than 0 and at most 1440',
        'Unknown field: digestion',
      ]),
    });
  });

  it('rejects coerced durations and timezone-less session timestamps', () => {
    expect(validateAgentActionInput('sun.session.log', {
      durationMinutes: '60',
      endedAt: '2026-09-01T10:30:00.000Z',
    })).toMatchObject({ ok: false });
    expect(validateAgentActionInput('sun.session.log', {
      durationMinutes: true,
      endedAt: '2026-09-01T10:30:00.000Z',
    })).toMatchObject({ ok: false });
    expect(validateAgentActionInput('sun.session.log', {
      durationMinutes: 60,
      endedAt: '2026-09-01T10:30:00',
    })).toMatchObject({ ok: false });
  });

  it('rejects impossible calendar dates at the browser boundary', () => {
    expect(validateAgentActionInput('sun.session.log', {
      durationMinutes: 60,
      endedAt: '2026-02-31T08:00:00Z',
    })).toMatchObject({ ok: false });
    expect(validateAgentActionInput('sun.session.log', {
      durationMinutes: 60,
      endedAt: '2028-02-29T08:00:00Z',
    })).toMatchObject({ ok: true });
  });

  it('refuses an unconfirmed write and executes a confirmed write once through the domain primitive', async () => {
    const logCompletedSunSession = vi.fn(async () => 'sun_agent_1');
    configureAgentActionDeps({ logCompletedSunSession });
    const input = {
      durationMinutes: 60,
      endedAt: '2026-09-01T10:30:00.000Z',
      notes: 'Sunbathing',
    };

    await expect(runAgentAction('sun.session.log', input, {
      confirmed: false,
      actorId: 'in-app-chat',
    })).resolves.toMatchObject({ ok: false, code: 'confirmation_required' });
    expect(logCompletedSunSession).not.toHaveBeenCalled();

    await expect(runAgentAction('sun.session.log', input, {
      confirmed: true,
      actorId: 'in-app-chat',
      idempotencyKey: 'proposal_agent_1',
    })).resolves.toEqual({
      ok: true,
      actionId: 'sun.session.log',
      result: { sessionId: 'sun_agent_1' },
    });
    expect(logCompletedSunSession).toHaveBeenCalledOnce();
    expect(logCompletedSunSession).toHaveBeenCalledWith(expect.objectContaining({
      durationMin: 60,
      startedAt: Date.parse('2026-09-01T09:30:00.000Z'),
      endedAt: Date.parse('2026-09-01T10:30:00.000Z'),
      notes: 'Sunbathing',
      createdBy: {
        type: 'agent',
        actorId: 'in-app-chat',
        actionId: 'sun.session.log',
        idempotencyKey: 'proposal_agent_1',
      },
    }));
  });

  it('rejects a model-proposed sunlight session that ends materially in the future', async () => {
    const logCompletedSunSession = vi.fn();
    configureAgentActionDeps({
      logCompletedSunSession,
      now: () => Date.parse('2026-09-01T10:30:00.000Z'),
    });

    await expect(runAgentAction('sun.session.log', {
      durationMinutes: 60,
      endedAt: '2026-09-01T11:30:00.000Z',
    }, { confirmed: true, actorId: 'in-app-chat' })).resolves.toMatchObject({
      ok: false,
      code: 'invalid_input',
      errors: ['endedAt cannot be in the future'],
    });
    expect(logCompletedSunSession).not.toHaveBeenCalled();
  });

  it('rolls a completed sunlight session back when the persistence boundary refuses the save', async () => {
    const persistImportedData = vi.fn(async () => false);
    configureSunSessionsStore({ persistImportedData });
    state.importedData = { entries: [], sunSessions: [] };

    await expect(logCompletedSession({
      durationMin: 60,
      startedAt: Date.parse('2026-09-01T09:30:00.000Z'),
      endedAt: Date.parse('2026-09-01T10:30:00.000Z'),
    })).rejects.toThrow('Could not save completed sunlight session');

    expect(persistImportedData).toHaveBeenCalledOnce();
    expect(state.importedData.sunSessions).toEqual([]);
  });

  it('writes a completed sunlight session to an explicit profile target after the active profile changed', async () => {
    const persistImportedData = vi.fn(async () => true);
    const persistImportedDataForProfile = vi.fn(async () => true);
    const profileA = { entries: [], sunSessions: [] };
    const profileB = { entries: [], sunSessions: [] };
    configureSunSessionsStore({ persistImportedData, persistImportedDataForProfile });
    state.currentProfile = 'profile-b';
    state.importedData = profileB;

    await expect(logCompletedSession({
      durationMin: 60,
      startedAt: Date.parse('2026-09-01T09:30:00.000Z'),
      endedAt: Date.parse('2026-09-01T10:30:00.000Z'),
    }, {
      profileId: 'profile-a',
      importedData: profileA,
    })).resolves.toEqual(expect.any(String));

    expect(profileA.sunSessions).toHaveLength(1);
    expect(profileB.sunSessions).toEqual([]);
    expect(persistImportedDataForProfile).toHaveBeenCalledWith(
      'profile-a',
      profileA,
      expect.objectContaining({ forceProfileScope: true }),
    );
    expect(persistImportedData).not.toHaveBeenCalled();
  });

  it('writes an agent session into the latest durable inactive-profile snapshot', async () => {
    const persistImportedDataForProfile = vi.fn(async () => true);
    const capturedProfileA = { contextNotes: 'old', sunSessions: [] };
    const refreshedProfileA = { contextNotes: 'fresh', sunSessions: [] };
    const profileB = { contextNotes: 'profile-b', sunSessions: [] };
    const loadProfileData = vi.fn(async () => refreshedProfileA);
    configureSunSessionsStore({ loadProfileData, persistImportedDataForProfile });
    state.currentProfile = 'profile-b';
    state.importedData = profileB;

    await expect(logCompletedSession({
      durationMin: 30,
      startedAt: Date.parse('2026-09-01T10:00:00.000Z'),
      endedAt: Date.parse('2026-09-01T10:30:00.000Z'),
      createdBy: {
        type: 'agent',
        actionId: 'sun.session.log',
        idempotencyKey: 'proposal-inactive-domain',
      },
    }, {
      profileId: 'profile-a',
      importedData: capturedProfileA,
    })).resolves.toEqual(expect.any(String));

    expect(loadProfileData).toHaveBeenCalledWith('profile-a');
    expect(refreshedProfileA.contextNotes).toBe('fresh');
    expect(refreshedProfileA.sunSessions).toHaveLength(1);
    expect(capturedProfileA.sunSessions).toEqual([
      expect.objectContaining({
        createdBy: expect.objectContaining({ idempotencyKey: 'proposal-inactive-domain' }),
      }),
    ]);
    expect(profileB).toEqual({ contextNotes: 'profile-b', sunSessions: [] });
    expect(persistImportedDataForProfile).toHaveBeenCalledWith(
      'profile-a',
      refreshedProfileA,
      expect.objectContaining({ reason: 'agent-action-sun-session' }),
    );
  });
});

describe('AI-first agent turn planning', () => {
  it('asks the active model for a structured semantic action instead of phrase-matching locally', async () => {
    const callAI = vi.fn(async () => ({
      text: JSON.stringify({
        decision: 'propose_action',
        actionId: 'sun.session.log',
        arguments: {
          durationMinutes: 60,
          endedAt: '2026-09-01T10:30:00.000Z',
          notes: 'Sunbathing',
        },
        message: 'I understood this as a completed sunlight session.',
      }),
      usage: { inputTokens: 120, outputTokens: 45 },
    }));
    configureAgentRuntimeDeps({ callAI });

    const plan = await planAgentTurn('I just sunbathed for one hour', {
      provider: 'openrouter',
      now: '2026-09-01T10:30:00.000Z',
      timeZone: 'Europe/Prague',
    });

    expect(callAI).toHaveBeenCalledOnce();
    expect(callAI.mock.calls[0][0]).toMatchObject({
      jsonMode: true,
      jsonSchema: AGENT_PLANNER_SCHEMA,
      forceNonStream: true,
      reasoningEffort: 'none',
      temperature: 0,
      messages: [{ role: 'user', content: 'I just sunbathed for one hour' }],
    });
    expect(callAI.mock.calls[0][0].system).toContain('sun.session.log');
    expect(plan).toEqual({
      kind: 'propose_action',
      actionId: 'sun.session.log',
      arguments: {
        durationMinutes: 60,
        endedAt: '2026-09-01T10:30:00.000Z',
        notes: 'Sunbathing',
      },
      message: 'I understood this as a completed sunlight session.',
      usage: { inputTokens: 120, outputTokens: 45 },
    });
  });

  it('creates a private proposal message without mutating profile data', async () => {
    const before = JSON.stringify(state.importedData);
    configureAgentRuntimeDeps({
      callAI: vi.fn(async () => ({
        text: JSON.stringify({
          decision: 'propose_action',
          actionId: 'sun.session.log',
          arguments: { durationMinutes: 60, endedAt: '', notes: '' },
          message: 'I can log that sunlight session.',
        }),
        usage: { inputTokens: 5, outputTokens: 6 },
      })),
      createProposalId: () => 'proposal_1',
      now: () => Date.parse('2026-09-01T10:30:00.000Z'),
      timeZone: () => 'Europe/Prague',
    });

    const turn = await handleAgentUserTurn('I spent one hour in the sun', { provider: 'ppq' });

    expect(turn).toMatchObject({
      handled: true,
      kind: 'proposal',
      content: 'I can log that sunlight session.',
      proposal: {
        id: 'proposal_1',
        actionId: 'sun.session.log',
        status: 'pending',
        arguments: {
          durationMinutes: 60,
          endedAt: '2026-09-01T10:30:00.000Z',
        },
        createdAt: '2026-09-01T10:30:00.000Z',
      },
    });
    expect(turn.proposal).not.toHaveProperty('sourceText');
    expect(JSON.stringify(state.importedData)).toBe(before);
  });

  it('routes the public chat send path through the AI planner before normal chat', async () => {
    const handleAgentUserTurn = vi.fn(async () => ({
      handled: true,
      kind: 'proposal',
      content: 'I can log that sunlight session.',
      usage: { inputTokens: 8, outputTokens: 4 },
      proposal: {
        id: 'proposal_send_1',
        actionId: 'sun.session.log',
        status: 'pending',
        arguments: { durationMinutes: 60 },
        createdAt: '2026-09-01T10:30:00.000Z',
        updatedAt: '2026-09-01T10:30:00.000Z',
      },
    }));
    configureChatSendAgentDeps({ handleAgentUserTurn });
    localStorage.setItem('labcharts-ai-provider', 'ollama');
    localStorage.setItem('labcharts-ai-transparency-acknowledgement', JSON.stringify({
      version: '2026-08-31',
      acknowledged: true,
    }));
    document.body.innerHTML = `
      <div id="chat-panel">
        <div id="chat-messages"></div>
        <textarea id="chat-input">I was sunbathing for one hour</textarea>
        <button id="chat-send-btn" type="button">Send</button>
        <div id="chat-stream-status"></div>
      </div>`;
    state.currentThreadId = 'thread-agent-send';
    state.chatHistory = [];

    await sendChatMessage();

    expect(handleAgentUserTurn).toHaveBeenCalledWith('I was sunbathing for one hour', expect.objectContaining({
      provider: 'ollama',
      signal: expect.any(AbortSignal),
    }));
    expect(state.chatHistory).toHaveLength(2);
    expect(state.chatHistory[1]).toMatchObject({
      role: 'assistant',
      content: 'I can log that sunlight session.',
      agentProposal: { id: 'proposal_send_1', status: 'pending' },
    });
    expect(document.querySelector('.agent-proposal-card')?.textContent).toContain('Review before anything is saved');
  });
});

describe('sunlight-session proposal UI and lifecycle', () => {
  const pendingProposal = {
    id: 'proposal_1',
    actionId: 'sun.session.log',
    status: 'pending',
    arguments: {
      durationMinutes: 60,
      endedAt: '2026-09-01T10:30:00.000Z',
      notes: 'Sunbathing',
    },
    createdAt: '2026-09-01T10:30:00.000Z',
  };

  it('renders a clear review card with non-submit Apply and Cancel controls', () => {
    const html = renderAgentProposalCard(pendingProposal, 3);

    expect(html).toContain('Log completed sunlight session');
    expect(html).toContain('60 minutes');
    expect(html).toContain('Sunbathing');
    expect(html).toContain('Review before anything is saved');
    expect(html).toContain('type="button"');
    expect(html).toContain('data-chat-message-action="apply-agent-proposal"');
    expect(html).toContain('data-chat-message-action="dismiss-agent-proposal"');
    expect(html).toContain('data-chat-message-index="3"');
  });

  it('renders the persisted proposal in the real chat transcript and delegates its controls', () => {
    const applyProposal = vi.fn();
    const dismissProposal = vi.fn();
    configureChatMessageActionDeps({ applyAgentProposal: applyProposal, dismissAgentProposal: dismissProposal });
    document.body.innerHTML = '<div id="chat-panel"><div id="chat-messages"></div></div>';
    installChatMessageActionDelegates(document);
    state.currentThreadId = 'thread-agent';
    state.chatHistory = [{
      role: 'assistant',
      content: 'I can log that sunlight session.',
      personalityName: 'AI',
      agentProposal: structuredClone(pendingProposal),
    }];

    renderChatMessages();
    const card = document.querySelector('.agent-proposal-card');
    expect(card?.textContent).toContain('Log completed sunlight session');
    card.querySelector('[data-chat-message-action="apply-agent-proposal"]').click();
    card.querySelector('[data-chat-message-action="dismiss-agent-proposal"]').click();

    expect(applyProposal).toHaveBeenCalledWith(0);
    expect(dismissProposal).toHaveBeenCalledWith(0);
  });

  it('single-flights repeated Apply calls and persists the final status', async () => {
    let resolveAction;
    const runAction = vi.fn(() => new Promise(resolve => { resolveAction = resolve; }));
    const saveChatHistory = vi.fn(async () => {});
    const renderChatMessages = vi.fn();
    configureAgentRuntimeDeps({ runAction, saveChatHistory, renderChatMessages });
    state.chatHistory = [{ role: 'assistant', content: 'Review it.', agentProposal: structuredClone(pendingProposal) }];

    const first = applyAgentProposal(0);
    const second = applyAgentProposal(0);

    expect(runAction).toHaveBeenCalledOnce();
    expect(state.chatHistory[0].agentProposal.status).toBe('applying');
    resolveAction({ ok: true, actionId: 'sun.session.log', result: { sessionId: 'sun_1' } });
    await Promise.all([first, second]);

    expect(state.chatHistory[0].agentProposal).toMatchObject({
      status: 'applied',
      result: { sessionId: 'sun_1' },
    });
    expect(saveChatHistory).toHaveBeenCalled();
    expect(renderChatMessages).toHaveBeenCalled();
  });

  it('keeps an action applied when only the follow-up chat-status save fails', async () => {
    const runAction = vi.fn(async () => ({
      ok: true,
      actionId: 'sun.session.log',
      result: { sessionId: 'sun_committed_1' },
    }));
    configureAgentRuntimeDeps({
      runAction,
      saveChatHistory: vi.fn(async () => { throw new Error('chat storage unavailable'); }),
      renderChatMessages: vi.fn(),
      showNotification: vi.fn(),
    });
    state.chatHistory = [{ role: 'assistant', content: 'Review it.', agentProposal: structuredClone(pendingProposal) }];

    const first = await applyAgentProposal(0);
    const second = await applyAgentProposal(0);

    expect(first).toMatchObject({ ok: true, statusPersistenceFailed: true });
    expect(second).toMatchObject({ ok: false, code: 'proposal_unavailable' });
    expect(runAction).toHaveBeenCalledOnce();
    expect(state.chatHistory[0].agentProposal).toMatchObject({
      status: 'applied',
      result: { sessionId: 'sun_committed_1' },
    });
    expect(renderAgentProposalCard(state.chatHistory[0].agentProposal, 0))
      .toContain('The session is saved, but this confirmation may disappear after reload.');
  });

  it('does not duplicate a committed session when a stale pending card is retried after reload', async () => {
    const persistImportedData = vi.fn(async () => true);
    const saveChatHistory = vi.fn()
      .mockRejectedValueOnce(new Error('chat storage unavailable'))
      .mockResolvedValue(undefined);
    configureSunSessionsStore({ persistImportedData });
    configureAgentRuntimeDeps({
      saveChatHistory,
      renderChatMessages: vi.fn(),
      showNotification: vi.fn(),
      now: () => Date.parse('2026-09-01T10:30:00.000Z'),
    });
    state.importedData = { entries: [], sunSessions: [] };
    state.chatHistory = [{ role: 'assistant', content: 'Review it.', agentProposal: structuredClone(pendingProposal) }];

    const first = await applyAgentProposal(0);
    expect(first).toMatchObject({ ok: true, statusPersistenceFailed: true });
    expect(state.importedData.sunSessions).toHaveLength(1);
    const committedSessionId = state.importedData.sunSessions[0].id;

    // Simulate reload from the stale chat record whose applied status could not be stored.
    state.chatHistory[0].agentProposal.status = 'pending';
    delete state.chatHistory[0].agentProposal.result;
    delete state.chatHistory[0].agentProposal.appliedAt;
    const second = await applyAgentProposal(0);

    expect(second).toMatchObject({ ok: true, result: { sessionId: committedSessionId } });
    expect(state.importedData.sunSessions).toHaveLength(1);
    expect(persistImportedData).toHaveBeenCalledOnce();
    expect(state.chatHistory[0].agentProposal.status).toBe('applied');
  });

  it('dismisses a pending proposal without executing it', async () => {
    const runAction = vi.fn();
    const saveChatHistory = vi.fn(async () => {});
    configureAgentRuntimeDeps({ runAction, saveChatHistory, renderChatMessages: vi.fn() });
    state.chatHistory = [{ role: 'assistant', content: 'Review it.', agentProposal: structuredClone(pendingProposal) }];

    await dismissAgentProposal(0);

    expect(runAction).not.toHaveBeenCalled();
    expect(state.chatHistory[0].agentProposal.status).toBe('dismissed');
    expect(saveChatHistory).toHaveBeenCalledOnce();
  });
});
