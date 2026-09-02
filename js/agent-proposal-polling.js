// @ts-check
// agent-proposal-polling.js — bounded background fetch for Agent Access proposals.

import { pollAgentAccessProposals } from './agent-access-proposals.js';

const pollingDeps = {
  intervalMs: 15_000,
  poll: pollAgentAccessProposals,
  refreshNavigation: async () => {},
};

/** @param {Partial<typeof pollingDeps>} [deps] */
export function configureAgentProposalPollingDeps(deps = {}) {
  const previous = { ...pollingDeps };
  if (Number.isFinite(deps.intervalMs) && Number(deps.intervalMs) >= 1000) pollingDeps.intervalMs = Number(deps.intervalMs);
  if (typeof deps.poll === 'function') pollingDeps.poll = deps.poll;
  if (typeof deps.refreshNavigation === 'function') pollingDeps.refreshNavigation = deps.refreshNavigation;
  return previous;
}

let pollingTimer = null;
let pollInFlight = null;

async function runPoll() {
  if (pollInFlight) return pollInFlight;
  pollInFlight = (async () => {
    const result = await pollingDeps.poll();
    if (result?.ingested > 0 && result?.profileStillActive !== false) {
      await pollingDeps.refreshNavigation();
    }
    return result;
  })().finally(() => { pollInFlight = null; });
  return pollInFlight;
}

export function startAgentProposalPolling() {
  if (pollingTimer !== null) return;
  void runPoll();
  pollingTimer = setInterval(() => { void runPoll(); }, pollingDeps.intervalMs);
}

export function stopAgentProposalPolling() {
  if (pollingTimer !== null) clearInterval(pollingTimer);
  pollingTimer = null;
  pollInFlight = null;
}
