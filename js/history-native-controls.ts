import { commitHistoryViewPreferences } from './history-view-preferences.js';
import { captureReadonlyHistorySurface } from './readonly-history-surfaces.js';
import { WEARABLE_VIEW_RANGES } from '../shared/history-view-contract.js';
import { showNotification } from './utils.js';
export async function changeWearableDetailRange(metricId: string, rangeKey: unknown) {
  const surface = captureReadonlyHistorySurface('wearableDetail');
  if (!surface || surface.metricId !== metricId || !WEARABLE_VIEW_RANGES.includes(rangeKey as typeof WEARABLE_VIEW_RANGES[number])) return;
  try { await commitHistoryViewPreferences({ wearableRange: rangeKey as typeof WEARABLE_VIEW_RANGES[number] }, { canCommit: surface.current }); }
  catch { if (surface.current()) showNotification('The wearable history range could not be saved. Try again.', 'error'); return; }
  const detail = await import('./wearables-detail-modal.js');
  if (surface.current()) await detail.openWearableDetail(metricId, { fromRangeToggle: true, isCurrent: surface.current });
}
