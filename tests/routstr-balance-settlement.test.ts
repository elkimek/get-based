// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  clearRoutstrBalanceSettlementTimers,
  installRoutstrBalanceSettlementRefresh,
  notifyRoutstrRequestSettled,
} from '../js/routstr-balance-settlement.js';

afterEach(() => {
  clearRoutstrBalanceSettlementTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('Routstr balance settlement refresh', () => {
  it('shows a temporary-reservation state and retries the visible balance on a bounded schedule', () => {
    vi.useFakeTimers();
    const balance = document.body.appendChild(document.createElement('span')); balance.id = 'routstr-node-balance';
    const refresh = vi.fn();
    installRoutstrBalanceSettlementRefresh(refresh);

    notifyRoutstrRequestSettled({ failed: true, modelId: 'tinfoil-glm-5-2' });

    expect(balance.textContent).toContain('releasing temporary reservation');
    vi.advanceTimersByTime(500);
    expect(refresh).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(2000);
    expect(refresh).toHaveBeenCalledTimes(2);
    clearRoutstrBalanceSettlementTimers();
    vi.runAllTimers();
    expect(refresh).toHaveBeenCalledTimes(2);
  });
});
