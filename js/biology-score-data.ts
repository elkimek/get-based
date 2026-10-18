// Preserve the native range-filter/snapshot boundary shared by Dashboard and the Biology page.
import { filterDatesByRange } from './data.js';
import type { BiologyContext } from '../types/biology-scores.js';

export function contextScoreData(ctx: unknown) {
  if (!ctx) return {};
  return filterDatesByRange((ctx as BiologyContext).data || {}, { fallbackToAll: false });
}

export function contextForScores(ctx: unknown) {
  return ctx ? { ...(ctx as Record<string, unknown>), data: contextScoreData(ctx) } : ctx;
}

