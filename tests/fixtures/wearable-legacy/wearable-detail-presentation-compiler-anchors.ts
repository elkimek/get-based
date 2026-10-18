import { wearableManualEntriesAnchors } from './wearable-detail-wearable-manual-entries-anchors.js';
import { wearableDetailChromeAnchors } from './wearable-detail-wearable-detail-chrome-anchors.js';
import { wearableDetailStatsAnchors } from './wearable-detail-wearable-detail-stats-anchors.js';
import { wearableDetailFeedbackAnchors } from './wearable-detail-wearable-detail-feedback-anchors.js';
export const wearableDetailPresentationAnchors = {
  WearableManualEntries: wearableManualEntriesAnchors,
  WearableDetailChrome: wearableDetailChromeAnchors,
  WearableDetailStats: wearableDetailStatsAnchors,
  WearableDetailFeedback: wearableDetailFeedbackAnchors,
} as const;
