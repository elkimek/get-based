import { describe, expect, it, vi } from 'vitest';

import { state } from '../js/state.js';
import {
  configureWearableSummary,
  persistWearableSummary,
} from '../js/wearables-summary.js';

describe('wearable summary persistence', () => {
  it('uses the configured imported-data saver', () => {
    const previousImportedData = state.importedData;
    const saveImportedData = vi.fn();
    const previousDeps = configureWearableSummary({ saveImportedData });
    state.importedData = { changeHistory: [] };

    try {
      const summary = { summaryUpdatedAt: '2026-07-22T00:00:00.000Z', metrics: {}, sources: {} };

      expect(persistWearableSummary(summary, [])).toBe(true);
      expect(state.importedData.wearableSummary).toBe(summary);
      expect(saveImportedData).toHaveBeenCalledOnce();
    } finally {
      state.importedData = previousImportedData;
      configureWearableSummary(previousDeps);
    }
  });
});
