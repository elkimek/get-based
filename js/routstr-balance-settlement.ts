import { presentProviderStatus } from './provider-status-component.js';
// routstr-balance-settlement.js - Refresh visible node balances after billing reservations settle.

const ROUTSTR_REQUEST_SETTLED_EVENT = 'labcharts-routstr-request-settled';
const BALANCE_REFRESH_DELAYS_MS = [500, 2500, 8000, 20000];

let refreshTimers: ReturnType<typeof setTimeout>[] = [];
let listenerInstalled = false;

export function notifyRoutstrRequestSettled(detail: { failed?: boolean; modelId?: string } = {}) {
  if (typeof globalThis.dispatchEvent !== 'function' || typeof CustomEvent === 'undefined') return;
  globalThis.dispatchEvent(new CustomEvent(ROUTSTR_REQUEST_SETTLED_EVENT, { detail }));
}

export function clearRoutstrBalanceSettlementTimers() {
  for (const timer of refreshTimers) clearTimeout(timer);
  refreshTimers = [];
}

export function installRoutstrBalanceSettlementRefresh(refresh: () => void, present?: (status: string) => boolean, canRefresh?: () => boolean) {
  if (listenerInstalled || typeof globalThis.addEventListener !== 'function') return;
  listenerInstalled = true;
  globalThis.addEventListener(ROUTSTR_REQUEST_SETTLED_EVENT, (event) => {
    clearRoutstrBalanceSettlementTimers();
    if (canRefresh && !canRefresh()) return;
    const detail = (event as CustomEvent<{ failed?: boolean; modelId?: string }>).detail;
    const status = detail?.failed ? 'Balance: releasing temporary reservation…' : 'Balance: updating…';
    const owned = present?.(status) || false;
    const el = document.getElementById('routstr-node-balance') || document.getElementById('routstr-balance');
    if (!owned && !el) return;
    if (!owned && el) presentProviderStatus(el, { text: status, tone: 'secondary' });
    refreshTimers = BALANCE_REFRESH_DELAYS_MS.map(delay => setTimeout(refresh, delay));
  });
}
