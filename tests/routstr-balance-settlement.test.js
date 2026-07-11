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
});

describe('Routstr balance settlement refresh', () => {
  it('shows a temporary-reservation state and retries the visible balance on a bounded schedule', () => {
    vi.useFakeTimers();
    const balance = { textContent: '' };
    vi.spyOn(document, 'getElementById').mockImplementation(id => id === 'routstr-node-balance' ? balance : null);
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
