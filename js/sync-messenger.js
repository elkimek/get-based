// sync-messenger.js - Agent Access token and context gateway helpers.

import { state } from './state.js';

const MESSENGER_TOKEN_KEY = 'labcharts-messenger-token';
const MESSENGER_ENABLED_KEY = 'labcharts-messenger-enabled';

let _getSyncRelay = () => 'wss://sync.getbased.health';
let _debug = () => {};
let _contextPushTimer = null;

export function configureSyncMessenger({ getSyncRelay, debug } = {}) {
  if (typeof getSyncRelay === 'function') _getSyncRelay = getSyncRelay;
  if (typeof debug === 'function') _debug = debug;
}

function currentSyncRelay() {
  try { return _getSyncRelay?.() || 'wss://sync.getbased.health'; } catch { return 'wss://sync.getbased.health'; }
}

function dbg(...args) {
  try { _debug(...args); } catch {}
}

export function isMessengerEnabled() {
  return localStorage.getItem(MESSENGER_ENABLED_KEY) === 'true';
}

export function getMessengerToken() {
  return localStorage.getItem(MESSENGER_TOKEN_KEY) || null;
}

export function generateMessengerToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  localStorage.setItem(MESSENGER_TOKEN_KEY, token);
  localStorage.setItem(MESSENGER_ENABLED_KEY, 'true');
  return token;
}

export function revokeMessengerToken() {
  localStorage.removeItem(MESSENGER_TOKEN_KEY);
  localStorage.setItem(MESSENGER_ENABLED_KEY, 'false');
}

export function pushContextToGateway() {
  if (!isMessengerEnabled()) return;
  const token = getMessengerToken();
  if (!token) return;

  clearTimeout(_contextPushTimer);
  _contextPushTimer = setTimeout(async () => {
    try {
      const { buildLabContext, buildWearableSeriesSection, getAgentWearableSeriesDays } = await import('./lab-context.js');
      const baseContext = buildLabContext({ skipGroupFilter: true });
      // Optional wearable daily-series section - user picks 0 (off) / 7 /
      // 30 / 90 days in Settings -> Integrations -> Agent Access. Reads L1
      // IDB on the browser; the gateway only ever sees the rendered string.
      // Append AFTER the rest so the section parser treats it as a sibling.
      const seriesDays = getAgentWearableSeriesDays();
      const seriesBlock = seriesDays > 0
        ? await buildWearableSeriesSection(seriesDays).catch(() => '')
        : '';
      const context = seriesBlock ? `${baseContext}\n${seriesBlock}\n` : baseContext;
      const profileId = state.currentProfile || 'default';
      // The gateway only needs the active profileId - do not leak the full
      // profile-name list. Profile names can include real names; the relay
      // is unencrypted, and profile names are gratuitous PII here.
      const relay = currentSyncRelay().replace(/^wss:\/\//, 'https://').replace(/^ws:\/\//, 'http://');

      const res = await fetch(`${relay}/api/context`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ context, profileId }),
      });
      if (!res.ok) throw new Error(`Gateway returned ${res.status}`);
      dbg(`Context pushed to gateway (profile: ${profileId}, series: ${seriesBlock ? 'yes' : 'no'})`);
    } catch (e) {
      console.warn('[sync] Context push failed:', e);
    }
  }, 5000); // 5s debounce - less urgent than sync
}
