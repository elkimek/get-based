// @ts-check
// lab-context-cache.js — shared cache wrapper for assembled AI context.

import { getCachedLabContext, setCachedLabContext } from './lab-context-settings.js';
import { isDebugMode } from './utils.js';

export function getOrBuildLabContext(fingerprint, build) {
  const cached = getCachedLabContext(fingerprint);
  if (cached) {
    if (isDebugMode()) console.log('[AI] Lab context cache hit');
    return cached;
  }
  if (isDebugMode()) console.log('[AI] Lab context cache miss — rebuilding');
  const context = build();
  setCachedLabContext(fingerprint, context);
  return context;
}
