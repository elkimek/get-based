import { wearableMetricCardAnchors } from './wearable-strip-wearable-metric-card-anchors.js';
import { wearableStripHeaderAnchors } from './wearable-strip-wearable-strip-header-anchors.js';
import { wearableStripBodyAnchors } from './wearable-strip-wearable-strip-body-anchors.js';
export const wearableStripPresentationAnchors = {
  WearableMetricCard: wearableMetricCardAnchors,
  WearableStripHeader: wearableStripHeaderAnchors,
  WearableStripBody: wearableStripBodyAnchors,
} as const;
