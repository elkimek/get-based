// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  AGENT_PROPOSAL_AAD_PREFIX,
  applyStoredAgentProposal,
  configureAgentAccessProposalDeps,
  dismissStoredAgentProposal,
  pollAgentAccessProposals,
  resolveAgentProposalGateway,
} from '../js/agent-access-proposals.js';
import { configureAgentActionDeps } from '../js/agent-actions/registry.js';
import { mergeImportedData } from '../js/data-merge.js';
import {
  configureAgentProposalInboxDeps,
  installAgentProposalInboxActions,
  renderAgentProposalInbox,
} from '../js/agent-proposal-inbox.js';
import {
  configureAgentProposalPollingDeps,
  startAgentProposalPolling,
  stopAgentProposalPolling,
} from '../js/agent-proposal-polling.js';
import { state } from '../js/state.js';

const KEY_BYTES = Uint8Array.from({ length: 32 }, (_, index) => index);
const CONTEXT_KEY = `gbctx_v1_${btoa(String.fromCharCode(...KEY_BYTES)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '')}`;
const originalImportedData = structuredClone(state.importedData);
const defaultProposalDeps = configureAgentAccessProposalDeps();
const defaultActionDeps = configureAgentActionDeps();
const defaultInboxDeps = configureAgentProposalInboxDeps();
const defaultPollingDeps = configureAgentProposalPollingDeps();

function bytesToBase64(bytes) {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

async function proposalEnvelope(overrides = {}) {
  const proposal = {
    id: 'proposal_external_1',
    actionId: 'sun.session.log',
    arguments: {
      durationMinutes: 60,
      endedAt: '2026-09-01T10:30:00.000Z',
      notes: 'Sunbathing',
    },
    profileId: 'default',
    capability: 'sun.sessions:write:propose',
    source: { type: 'external-agent', client: 'getbased-mcp' },
    issuedAt: '2026-09-01T10:35:00.000Z',
    expiresAt: '2026-09-01T11:05:00.000Z',
    ...overrides,
  };
  const cryptoKey = await crypto.subtle.importKey('raw', KEY_BYTES, { name: 'AES-GCM' }, false, ['encrypt']);
  const iv = Uint8Array.from({ length: 12 }, (_, index) => index + 1);
  const aad = new TextEncoder().encode(`${AGENT_PROPOSAL_AAD_PREFIX}:${proposal.id}`);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: aad },
    cryptoKey,
    new TextEncoder().encode(JSON.stringify({ version: 1, proposal })),
  );
  const keyIdDigest = await crypto.subtle.digest('SHA-256', KEY_BYTES);
  return {
    version: 1,
    alg: 'AES-256-GCM',
    keyDerivation: 'raw-256-bit-key',
    keyId: bytesToBase64(new Uint8Array(keyIdDigest).slice(0, 12)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, ''),
    proposalId: proposal.id,
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
  };
}

afterEach(() => {
  configureAgentAccessProposalDeps(defaultProposalDeps);
  configureAgentActionDeps(defaultActionDeps);
  configureAgentProposalInboxDeps(defaultInboxDeps);
  stopAgentProposalPolling();
  configureAgentProposalPollingDeps(defaultPollingDeps);
  state.importedData = structuredClone(originalImportedData);
  state.currentProfile = 'default';
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('external proposal polling lifecycle', () => {
  it('polls immediately, refreshes navigation after ingestion, and remains single-start', async () => {
    vi.useFakeTimers();
    const poll = vi.fn(async () => ({ ingested: 1, rejected: 0 }));
    const refreshNavigation = vi.fn(async () => {});
    configureAgentProposalPollingDeps({ poll, refreshNavigation, intervalMs: 15_000 });

    startAgentProposalPolling();
    startAgentProposalPolling();
    await vi.runAllTicks();
    await vi.advanceTimersByTimeAsync(1);

    expect(poll).toHaveBeenCalledOnce();
    expect(refreshNavigation).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(15_000);
    expect(poll).toHaveBeenCalledTimes(2);
  });

  it('does not refresh navigation for an ingest completed after the profile changed', async () => {
    vi.useFakeTimers();
    const poll = vi.fn(async () => ({
      ingested: 1,
      rejected: 0,
      profileStillActive: false,
    }));
    const refreshNavigation = vi.fn(async () => {});
    configureAgentProposalPollingDeps({ poll, refreshNavigation, intervalMs: 15_000 });

    startAgentProposalPolling();
    await vi.runAllTicks();
    await vi.advanceTimersByTimeAsync(1);

    expect(poll).toHaveBeenCalledOnce();
    expect(refreshNavigation).not.toHaveBeenCalled();
  });
});

describe('external proposal inbox UI', () => {
  it('renders a human review card with non-submitting Apply and Dismiss controls', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-01T10:40:00.000Z'));
    state.importedData = {
      entries: [],
      agentProposals: [{
        id: 'proposal_external_1',
        actionId: 'sun.session.log',
        arguments: {
          durationMinutes: 60,
          endedAt: '2026-09-01T10:30:00.000Z',
          notes: '<script>bad</script>',
        },
        status: 'pending',
        sourceClient: 'getbased-mcp',
        issuedAt: '2026-09-01T10:35:00.000Z',
        expiresAt: '2026-09-01T11:05:00.000Z',
      }],
    };

    const html = renderAgentProposalInbox();

    expect(html).toContain('Agent proposals');
    expect(html).toContain('Log 60 minutes of sunlight');
    expect(html).toContain('getbased-mcp');
    expect(html).toContain('Session ended');
    expect(html).toContain('datetime="2026-09-01T10:30:00.000Z"');
    expect(html).toContain('&lt;script&gt;bad&lt;/script&gt;');
    expect(html).not.toContain('<script>bad</script>');
    expect(html).toMatch(/<button[^>]+type="button"[^>]+data-agent-proposal-action="apply"/u);
    expect(html).toMatch(/<button[^>]+type="button"[^>]+data-agent-proposal-action="dismiss"/u);
  });

  it('single-flights button clicks through inbox actions without navigating', async () => {
    const apply = vi.fn(async () => ({ ok: true }));
    const refresh = vi.fn();
    configureAgentProposalInboxDeps({ apply, dismiss: vi.fn(), refresh, notify: vi.fn() });
    document.body.innerHTML = '<button type="button" data-agent-proposal-action="apply" data-proposal-id="proposal_external_1">Apply</button>';
    installAgentProposalInboxActions();
    const href = location.href;

    const button = document.querySelector('button');
    button.click();
    button.click();
    await vi.waitFor(() => expect(apply).toHaveBeenCalledOnce());

    expect(location.href).toBe(href);
    expect(apply).toHaveBeenCalledWith('proposal_external_1');
    expect(refresh).toHaveBeenCalled();
  });
});

describe('external Agent Access proposals', () => {
  it('allows a relative proposal gateway override only on a loopback preview origin', () => {
    expect(resolveAgentProposalGateway(
      'wss://sync.getbased.health',
      'http://localhost:8198/app?agentProposalGateway=/api',
    )).toBe('http://localhost:8198/api');
    expect(resolveAgentProposalGateway(
      'wss://sync.getbased.health',
      'https://app.getbased.health/app?agentProposalGateway=https://evil.example',
    )).toBe('https://sync.getbased.health');
  });

  it('appends the proposal route only once when a loopback gateway already ends in /api', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ proposals: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    configureAgentAccessProposalDeps({
      fetchImpl,
      getAgentAccessState: () => ({ enabled: true, token: 'test-token', contextKey: CONTEXT_KEY }),
      getRelayUrl: () => resolveAgentProposalGateway(
        'wss://sync.getbased.health',
        'http://localhost:8198/app?agentProposalGateway=/api',
      ),
    });

    await expect(pollAgentAccessProposals()).resolves.toMatchObject({ ingested: 0, rejected: 0 });

    expect(fetchImpl).toHaveBeenCalledWith(
      'http://localhost:8198/api/agent-proposals',
      expect.any(Object),
    );
  });

  it('decrypts, validates, persists, then acknowledges a current-profile proposal', async () => {
    const envelope = await proposalEnvelope();
    const persistImportedData = vi.fn(async () => true);
    const fetchImpl = vi.fn(async (url, init = {}) => {
      if (init.method === 'DELETE') return new Response(JSON.stringify({ ok: true, deleted: true }), { status: 200 });
      return new Response(JSON.stringify({
        proposals: [{ proposalId: envelope.proposalId, createdAt: '2026-09-01T10:35:00.000Z', envelope }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    configureAgentAccessProposalDeps({
      fetchImpl,
      getAgentAccessState: () => ({ enabled: true, token: 'test-token', contextKey: CONTEXT_KEY }),
      getRelayUrl: () => 'https://gateway.test',
      now: () => Date.parse('2026-09-01T10:40:00.000Z'),
      persistImportedData,
      notify: vi.fn(),
    });
    state.importedData = { entries: [], sunSessions: [], agentProposals: [] };

    await expect(pollAgentAccessProposals()).resolves.toMatchObject({ ingested: 1, rejected: 0 });

    expect(state.importedData.agentProposals).toEqual([
      expect.objectContaining({
        id: 'proposal_external_1',
        actionId: 'sun.session.log',
        arguments: expect.objectContaining({ durationMinutes: 60, notes: 'Sunbathing' }),
        status: 'pending',
        profileId: 'default',
        sourceClient: 'getbased-mcp',
      }),
    ]);
    expect(persistImportedData).toHaveBeenCalledOnce();
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://gateway.test/api/agent-proposals/proposal_external_1',
      expect.objectContaining({ method: 'DELETE' }),
    );
    expect(JSON.stringify(fetchImpl.mock.calls[0])).not.toContain('Sunbathing');
  });

  it('persists and acknowledges without profile-facing UI after the profile changed', async () => {
    const envelope = await proposalEnvelope({ profileId: 'profile-a' });
    let resolvePersist;
    const persistImportedData = vi.fn(() => new Promise((resolve) => { resolvePersist = resolve; }));
    const notify = vi.fn();
    const changed = vi.fn();
    const fetchImpl = vi.fn(async (url, init = {}) => {
      if (init.method === 'DELETE') {
        return new Response(JSON.stringify({ ok: true, deleted: true }), { status: 200 });
      }
      return new Response(JSON.stringify({
        proposals: [{ proposalId: envelope.proposalId, createdAt: '2026-09-01T10:35:00.000Z', envelope }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    const profileA = { entries: [], sunSessions: [], agentProposals: [] };
    const profileB = { entries: [], sunSessions: [], agentProposals: [] };
    configureAgentAccessProposalDeps({
      fetchImpl,
      getAgentAccessState: () => ({ enabled: true, token: 'test-token', contextKey: CONTEXT_KEY }),
      getRelayUrl: () => 'https://gateway.test',
      now: () => Date.parse('2026-09-01T10:40:00.000Z'),
      persistImportedData,
      notify,
    });
    state.currentProfile = 'profile-a';
    state.importedData = profileA;
    document.addEventListener('getbased-agent-proposals-changed', changed);

    try {
      const polling = pollAgentAccessProposals();
      await vi.waitFor(() => expect(persistImportedData).toHaveBeenCalledOnce());
      state.currentProfile = 'profile-b';
      state.importedData = profileB;
      resolvePersist(true);

      await expect(polling).resolves.toMatchObject({
        ingested: 1,
        rejected: 0,
        profileStillActive: false,
      });
      expect(profileA.agentProposals).toEqual([
        expect.objectContaining({ id: 'proposal_external_1', profileId: 'profile-a' }),
      ]);
      expect(profileB.agentProposals).toEqual([]);
      expect(fetchImpl).toHaveBeenCalledWith(
        'https://gateway.test/api/agent-proposals/proposal_external_1',
        expect.objectContaining({ method: 'DELETE' }),
      );
      expect(notify).not.toHaveBeenCalled();
      expect(changed).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener('getbased-agent-proposals-changed', changed);
    }
  });

  it('reconciles into same-profile replacement data before emitting profile-facing UI', async () => {
    const envelope = await proposalEnvelope({ profileId: 'profile-a' });
    let resolvePersist;
    const persistImportedData = vi.fn()
      .mockImplementationOnce(() => new Promise((resolve) => { resolvePersist = resolve; }))
      .mockResolvedValue(true);
    const notify = vi.fn();
    const changed = vi.fn();
    const fetchImpl = vi.fn(async (_url, init = {}) => {
      if (init.method === 'DELETE') {
        return new Response(JSON.stringify({ ok: true, deleted: true }), { status: 200 });
      }
      return new Response(JSON.stringify({
        proposals: [{ proposalId: envelope.proposalId, createdAt: '2026-09-01T10:35:00.000Z', envelope }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    const profileA = { entries: [], sunSessions: [], agentProposals: [] };
    const refreshedProfileA = {
      entries: [],
      sunSessions: [{ id: 'fresh-session-from-sync' }],
      agentProposals: [],
    };
    configureAgentAccessProposalDeps({
      fetchImpl,
      getAgentAccessState: () => ({ enabled: true, token: 'test-token', contextKey: CONTEXT_KEY }),
      getRelayUrl: () => 'https://gateway.test',
      now: () => Date.parse('2026-09-01T10:40:00.000Z'),
      persistImportedData,
      notify,
    });
    state.currentProfile = 'profile-a';
    state.importedData = profileA;
    document.addEventListener('getbased-agent-proposals-changed', changed);

    try {
      const polling = pollAgentAccessProposals();
      await vi.waitFor(() => expect(persistImportedData).toHaveBeenCalledOnce());
      state.importedData = refreshedProfileA;
      resolvePersist(true);

      await expect(polling).resolves.toMatchObject({
        ingested: 1,
        rejected: 0,
        profileStillActive: true,
      });
      expect(refreshedProfileA.sunSessions).toEqual([{ id: 'fresh-session-from-sync' }]);
      expect(refreshedProfileA.agentProposals).toEqual([
        expect.objectContaining({ id: 'proposal_external_1', profileId: 'profile-a' }),
      ]);
      expect(persistImportedData).toHaveBeenCalledTimes(2);
      expect(persistImportedData).toHaveBeenLastCalledWith(
        'profile-a',
        refreshedProfileA,
        expect.objectContaining({ immediate: true, reason: 'agent-proposal-ingest-reconcile' }),
      );
      expect(notify).toHaveBeenCalledOnce();
      expect(changed).toHaveBeenCalledOnce();
    } finally {
      document.removeEventListener('getbased-agent-proposals-changed', changed);
    }
  });

  it('rechecks same-profile data after acknowledgement before emitting UI', async () => {
    const envelope = await proposalEnvelope({ profileId: 'profile-a' });
    const profileA = { entries: [], sunSessions: [], agentProposals: [] };
    const refreshedProfileA = {
      entries: [],
      sunSessions: [{ id: 'session-arrived-during-ack' }],
      agentProposals: [],
    };
    const persistImportedData = vi.fn(async () => true);
    const notify = vi.fn();
    const changed = vi.fn();
    const fetchImpl = vi.fn(async (_url, init = {}) => {
      if (init.method === 'DELETE') {
        state.importedData = refreshedProfileA;
        return new Response(JSON.stringify({ ok: true, deleted: true }), { status: 200 });
      }
      return new Response(JSON.stringify({
        proposals: [{ proposalId: envelope.proposalId, createdAt: '2026-09-01T10:35:00.000Z', envelope }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    configureAgentAccessProposalDeps({
      fetchImpl,
      getAgentAccessState: () => ({ enabled: true, token: 'test-token', contextKey: CONTEXT_KEY }),
      getRelayUrl: () => 'https://gateway.test',
      now: () => Date.parse('2026-09-01T10:40:00.000Z'),
      persistImportedData,
      notify,
    });
    state.currentProfile = 'profile-a';
    state.importedData = profileA;
    document.addEventListener('getbased-agent-proposals-changed', changed);

    try {
      await expect(pollAgentAccessProposals()).resolves.toMatchObject({
        ingested: 1,
        rejected: 0,
        profileStillActive: true,
      });
      expect(refreshedProfileA.sunSessions).toEqual([{ id: 'session-arrived-during-ack' }]);
      expect(refreshedProfileA.agentProposals).toEqual([
        expect.objectContaining({ id: 'proposal_external_1', profileId: 'profile-a' }),
      ]);
      expect(persistImportedData).toHaveBeenCalledTimes(2);
      expect(notify).toHaveBeenCalledOnce();
      expect(changed).toHaveBeenCalledOnce();
    } finally {
      document.removeEventListener('getbased-agent-proposals-changed', changed);
    }
  });

  it('withholds acknowledgement and UI when same-profile reconciliation cannot persist', async () => {
    const envelope = await proposalEnvelope({ profileId: 'profile-a' });
    let resolvePersist;
    const persistImportedData = vi.fn()
      .mockImplementationOnce(() => new Promise((resolve) => { resolvePersist = resolve; }))
      .mockResolvedValue(false);
    const notify = vi.fn();
    const changed = vi.fn();
    const fetchImpl = vi.fn(async (_url, init = {}) => {
      if (init.method === 'DELETE') {
        return new Response(JSON.stringify({ ok: true, deleted: true }), { status: 200 });
      }
      return new Response(JSON.stringify({
        proposals: [{ proposalId: envelope.proposalId, createdAt: '2026-09-01T10:35:00.000Z', envelope }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    const profileA = { entries: [], sunSessions: [], agentProposals: [] };
    const refreshedProfileA = { entries: [], sunSessions: [], agentProposals: [] };
    configureAgentAccessProposalDeps({
      fetchImpl,
      getAgentAccessState: () => ({ enabled: true, token: 'test-token', contextKey: CONTEXT_KEY }),
      getRelayUrl: () => 'https://gateway.test',
      now: () => Date.parse('2026-09-01T10:40:00.000Z'),
      persistImportedData,
      notify,
    });
    state.currentProfile = 'profile-a';
    state.importedData = profileA;
    document.addEventListener('getbased-agent-proposals-changed', changed);

    try {
      const polling = pollAgentAccessProposals();
      await vi.waitFor(() => expect(persistImportedData).toHaveBeenCalledOnce());
      state.importedData = refreshedProfileA;
      resolvePersist(true);

      await expect(polling).resolves.toMatchObject({
        ingested: 0,
        rejected: 0,
        persistenceFailed: true,
        profileStillActive: false,
      });
      expect(refreshedProfileA.agentProposals).toEqual([]);
      expect(persistImportedData).toHaveBeenCalledTimes(2);
      expect(fetchImpl).not.toHaveBeenCalledWith(
        'https://gateway.test/api/agent-proposals/proposal_external_1',
        expect.objectContaining({ method: 'DELETE' }),
      );
      expect(notify).not.toHaveBeenCalled();
      expect(changed).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener('getbased-agent-proposals-changed', changed);
    }
  });

  it('leaves relay items unacknowledged when the pending inbox is full', async () => {
    const envelope = await proposalEnvelope();
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      proposals: [{
        proposalId: envelope.proposalId,
        createdAt: '2026-09-01T10:35:00.000Z',
        envelope,
      }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    const persistImportedData = vi.fn(async () => true);
    configureAgentAccessProposalDeps({
      fetchImpl,
      getAgentAccessState: () => ({ enabled: true, token: 'test-token', contextKey: CONTEXT_KEY }),
      getRelayUrl: () => 'https://gateway.test',
      now: () => Date.parse('2026-09-01T10:40:00.000Z'),
      persistImportedData,
    });
    state.importedData = {
      entries: [],
      sunSessions: [],
      agentProposals: Array.from({ length: 50 }, (_, index) => ({
        id: `proposal_pending_${index}`,
        status: 'pending',
        updatedAt: '2026-09-01T10:00:00.000Z',
      })),
    };

    await expect(pollAgentAccessProposals()).resolves.toMatchObject({ ingested: 0, rejected: 1 });
    expect(state.importedData.agentProposals).toHaveLength(50);
    expect(persistImportedData).not.toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('bounds retained terminal proposal history while ingesting a new proposal', async () => {
    const envelope = await proposalEnvelope();
    const fetchImpl = vi.fn(async (_url, init = {}) => {
      if (init.method === 'DELETE') {
        return new Response(JSON.stringify({ ok: true, deleted: true }), { status: 200 });
      }
      return new Response(JSON.stringify({
        proposals: [{
          proposalId: envelope.proposalId,
          createdAt: '2026-09-01T10:35:00.000Z',
          envelope,
        }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    configureAgentAccessProposalDeps({
      fetchImpl,
      getAgentAccessState: () => ({ enabled: true, token: 'test-token', contextKey: CONTEXT_KEY }),
      getRelayUrl: () => 'https://gateway.test',
      now: () => Date.parse('2026-09-01T10:40:00.000Z'),
      persistImportedData: vi.fn(async () => true),
    });
    state.importedData = {
      entries: [],
      sunSessions: [],
      agentProposals: Array.from({ length: 100 }, (_, index) => ({
        id: `proposal_dismissed_${index}`,
        status: 'dismissed',
        updatedAt: new Date(Date.parse('2025-01-01T00:00:00.000Z') + index * 1000).toISOString(),
      })),
    };

    await expect(pollAgentAccessProposals()).resolves.toMatchObject({ ingested: 1, rejected: 0 });
    expect(state.importedData.agentProposals).toHaveLength(100);
    expect(state.importedData.agentProposals.some(({ id }) => id === envelope.proposalId)).toBe(true);
  });

  it('rejects expired, cross-profile, and scope-confused proposals before persistence', async () => {
    const envelopes = await Promise.all([
      proposalEnvelope({ id: 'proposal_expired', expiresAt: '2026-09-01T10:39:00.000Z' }),
      proposalEnvelope({ id: 'proposal_cross_profile', profileId: 'private' }),
      proposalEnvelope({ id: 'proposal_wrong_scope', capability: 'profile.raw:write' }),
    ]);
    const persistImportedData = vi.fn(async () => true);
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      proposals: envelopes.map((envelope) => ({ proposalId: envelope.proposalId, envelope })),
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    configureAgentAccessProposalDeps({
      fetchImpl,
      getAgentAccessState: () => ({ enabled: true, token: 'test-token', contextKey: CONTEXT_KEY }),
      getRelayUrl: () => 'https://gateway.test',
      now: () => Date.parse('2026-09-01T10:40:00.000Z'),
      persistImportedData,
    });
    state.importedData = { entries: [], sunSessions: [], agentProposals: [] };

    await expect(pollAgentAccessProposals()).resolves.toMatchObject({ ingested: 0, rejected: 3 });
    expect(state.importedData.agentProposals).toEqual([]);
    expect(persistImportedData).not.toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('single-flights Apply and executes exactly once through the shared registry', async () => {
    let resolveAction;
    const logCompletedSunSession = vi.fn(() => new Promise((resolve) => { resolveAction = resolve; }));
    const persistImportedData = vi.fn(async () => true);
    configureAgentActionDeps({
      logCompletedSunSession,
      now: () => Date.parse('2026-09-01T10:40:00.000Z'),
    });
    configureAgentAccessProposalDeps({
      persistImportedData,
      now: () => Date.parse('2026-09-01T10:40:00.000Z'),
    });
    state.importedData = {
      entries: [],
      sunSessions: [],
      agentProposals: [{
        id: 'proposal_external_1',
        actionId: 'sun.session.log',
        arguments: { durationMinutes: 60, endedAt: '2026-09-01T10:30:00.000Z' },
        profileId: 'default',
        capability: 'sun.sessions:write:propose',
        sourceClient: 'getbased-mcp',
        status: 'pending',
        issuedAt: '2026-09-01T10:35:00.000Z',
        expiresAt: '2026-09-01T11:05:00.000Z',
        createdAt: '2026-09-01T10:35:00.000Z',
        updatedAt: '2026-09-01T10:35:00.000Z',
      }],
    };

    const first = applyStoredAgentProposal('proposal_external_1');
    const second = applyStoredAgentProposal('proposal_external_1');
    await vi.waitFor(() => expect(logCompletedSunSession).toHaveBeenCalledOnce());
    resolveAction('sun_external_1');

    await expect(Promise.all([first, second])).resolves.toEqual([
      expect.objectContaining({ ok: true }),
      expect.objectContaining({ ok: true }),
    ]);
    expect(logCompletedSunSession).toHaveBeenCalledOnce();
    expect(logCompletedSunSession).toHaveBeenCalledWith(
      expect.objectContaining({
        createdBy: expect.objectContaining({
          actorId: 'external-agent:getbased-mcp',
          idempotencyKey: 'proposal_external_1',
        }),
      }),
      expect.objectContaining({
        profileId: 'default',
        importedData: state.importedData,
      }),
    );
    expect(state.importedData.agentProposals[0]).toMatchObject({
      status: 'applied',
      result: { sessionId: 'sun_external_1' },
    });
    expect(persistImportedData).toHaveBeenCalledOnce();
  });

  it('persists Apply metadata to the profile captured before the async action', async () => {
    let resolveAction;
    const runAction = vi.fn(() => new Promise((resolve) => { resolveAction = resolve; }));
    const persistImportedData = vi.fn(async () => true);
    const profileA = {
      entries: [],
      sunSessions: [],
      agentProposals: [{
        id: 'proposal_profile_race',
        actionId: 'sun.session.log',
        arguments: { durationMinutes: 60, endedAt: '2026-09-01T10:30:00.000Z' },
        profileId: 'profile-a',
        capability: 'sun.sessions:write:propose',
        sourceClient: 'getbased-mcp',
        status: 'pending',
        issuedAt: '2026-09-01T10:35:00.000Z',
        expiresAt: '2026-09-01T11:05:00.000Z',
      }],
    };
    const profileB = { entries: [], sunSessions: [], agentProposals: [] };
    configureAgentAccessProposalDeps({
      runAction,
      persistImportedData,
      now: () => Date.parse('2026-09-01T10:40:00.000Z'),
    });
    state.currentProfile = 'profile-a';
    state.importedData = profileA;

    const applying = applyStoredAgentProposal('proposal_profile_race');
    await vi.waitFor(() => expect(runAction).toHaveBeenCalledOnce());
    expect(runAction).toHaveBeenCalledWith(
      'sun.session.log',
      expect.objectContaining({ durationMinutes: 60 }),
      expect.objectContaining({ profileId: 'profile-a', importedData: profileA }),
    );
    state.currentProfile = 'profile-b';
    state.importedData = profileB;
    resolveAction({ ok: true, result: { sessionId: 'sun_profile_a' } });

    await expect(applying).resolves.toMatchObject({ ok: true });
    expect(profileA.agentProposals[0].status).toBe('applied');
    expect(profileB.agentProposals).toEqual([]);
    expect(persistImportedData).toHaveBeenCalledWith(
      'profile-a',
      profileA,
      expect.objectContaining({ reason: 'agent-proposal-applied' }),
    );
  });

  it('rejects a stored proposal when the active profile changed before Apply', async () => {
    const runAction = vi.fn(async () => ({ ok: true }));
    configureAgentAccessProposalDeps({
      runAction,
      now: () => Date.parse('2026-09-01T10:40:00.000Z'),
    });
    state.currentProfile = 'profile-b';
    state.importedData = {
      entries: [],
      sunSessions: [],
      agentProposals: [{
        id: 'proposal_external_1',
        actionId: 'sun.session.log',
        arguments: { durationMinutes: 60 },
        profileId: 'profile-a',
        capability: 'sun.sessions:write:propose',
        sourceClient: 'getbased-mcp',
        status: 'pending',
        issuedAt: '2026-09-01T10:35:00.000Z',
        expiresAt: '2026-09-01T11:05:00.000Z',
      }],
    };

    await expect(applyStoredAgentProposal('proposal_external_1')).resolves.toMatchObject({
      ok: false,
      code: 'wrong_profile',
    });
    expect(runAction).not.toHaveBeenCalled();
  });

  it('rejects Dismiss when the active profile and proposal profile disagree', async () => {
    const persistImportedData = vi.fn(async () => {});
    configureAgentAccessProposalDeps({ persistImportedData });
    state.currentProfile = 'profile-b';
    state.importedData = {
      entries: [],
      sunSessions: [{
        id: 'sun_profile_mismatch_dismiss',
        createdBy: {
          type: 'agent',
          actionId: 'sun.session.log',
          idempotencyKey: 'proposal_profile_mismatch_dismiss_000000',
        },
      }],
      agentProposals: [{
        id: 'proposal_profile_mismatch_dismiss_000000',
        actionId: 'sun.session.log',
        arguments: { durationMinutes: 60 },
        profileId: 'profile-a',
        capability: 'sun.sessions:write:propose',
        sourceClient: 'getbased-mcp',
        status: 'pending',
        issuedAt: '2026-09-01T10:35:00.000Z',
        expiresAt: '2026-09-01T11:05:00.000Z',
      }],
    };

    await expect(dismissStoredAgentProposal('proposal_profile_mismatch_dismiss_000000')).resolves.toEqual({
      ok: false,
      code: 'wrong_profile',
    });
    expect(persistImportedData).not.toHaveBeenCalled();
    expect(state.importedData.agentProposals[0].status).toBe('pending');
  });

  it('rejects tampered capability and arguments before Apply', async () => {
    const runAction = vi.fn(async () => ({ ok: true }));
    configureAgentAccessProposalDeps({
      runAction,
      now: () => Date.parse('2026-09-01T10:40:00.000Z'),
    });
    const proposal = {
      id: 'proposal_external_1',
      actionId: 'sun.session.log',
      arguments: { durationMinutes: 60 },
      profileId: 'default',
      capability: 'profile.raw:write',
      sourceClient: 'getbased-mcp',
      status: 'pending',
      issuedAt: '2026-09-01T10:35:00.000Z',
      expiresAt: '2026-09-01T11:05:00.000Z',
    };
    state.importedData = { entries: [], sunSessions: [], agentProposals: [proposal] };

    await expect(applyStoredAgentProposal(proposal.id)).resolves.toMatchObject({
      ok: false,
      code: 'capability_mismatch',
    });
    proposal.capability = 'sun.sessions:write:propose';
    proposal.arguments = { durationMinutes: 0 };
    await expect(applyStoredAgentProposal(proposal.id)).resolves.toMatchObject({
      ok: false,
      code: 'invalid_action_arguments',
    });
    expect(runAction).not.toHaveBeenCalled();
  });

  it('converges concurrent cross-device Apply records to one logical session', () => {
    const createdBy = {
      type: 'agent',
      actorId: 'external-agent:getbased-mcp',
      actionId: 'sun.session.log',
      idempotencyKey: 'proposal_external_1',
    };
    const local = {
      sunSessions: [{
        id: 'sun_local', startedAt: 1, endedAt: 2, updatedAt: 3, createdBy,
      }],
    };
    const remote = {
      sunSessions: [{
        id: 'sun_remote', startedAt: 1, endedAt: 2, updatedAt: 4, createdBy,
      }],
    };

    const merged = mergeImportedData(local, remote);

    expect(merged.sunSessions).toHaveLength(1);
    expect(merged.sunSessions[0].id).toBe('sun_remote');
  });

  it('rolls a Dismiss back when proposal-state persistence fails', async () => {
    const persistImportedData = vi.fn(async () => false);
    configureAgentAccessProposalDeps({ persistImportedData });
    state.importedData = {
      entries: [],
      sunSessions: [],
      agentProposals: [{
        id: 'proposal_external_1',
        actionId: 'sun.session.log',
        arguments: { durationMinutes: 60 },
        profileId: 'default',
        status: 'pending',
      }],
    };

    await expect(dismissStoredAgentProposal('proposal_external_1')).resolves.toMatchObject({
      ok: false,
      code: 'persistence_failed',
    });
    expect(state.importedData.agentProposals[0].status).toBe('pending');
  });
});
