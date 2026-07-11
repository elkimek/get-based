// @ts-check
// routstr-balance-settlement.js - Refresh visible node balances after billing reservations settle.

const ROUTSTR_REQUEST_SETTLED_EVENT = 'labcharts-routstr-request-settled';
const BALANCE_REFRESH_DELAYS_MS = [500, 2500, 8000, 20000];

/** @type {ReturnType<typeof setTimeout>[]} */
let refreshTimers = [];
let listenerInstalled = false;

/** @param {{failed?: boolean, modelId?: string}} [detail] */
export function notifyRoutstrRequestSettled(detail = {}) {
  if (typeof globalThis.dispatchEvent !== 'function' || typeof CustomEvent === 'undefined') return;
  globalThis.dispatchEvent(new CustomEvent(ROUTSTR_REQUEST_SETTLED_EVENT, { detail }));
}

export function clearRoutstrBalanceSettlementTimers() {
  for (const timer of refreshTimers) clearTimeout(timer);
  refreshTimers = [];
}

/** @param {() => void} refresh */
export function installRoutstrBalanceSettlementRefresh(refresh) {
  if (listenerInstalled || typeof globalThis.addEventListener !== 'function') return;
  listenerInstalled = true;
  globalThis.addEventListener(ROUTSTR_REQUEST_SETTLED_EVENT, (event) => {
    clearRoutstrBalanceSettlementTimers();
    const detail = /** @type {CustomEvent} */ (event).detail;
    const el = document.getElementById('routstr-node-balance') || document.getElementById('routstr-balance');
    if (!el) return;
    el.textContent = detail?.failed ? 'Balance: releasing temporary reservation…' : 'Balance: updating…';
    refreshTimers = BALANCE_REFRESH_DELAYS_MS.map(delay => setTimeout(refresh, delay));
  });
}
