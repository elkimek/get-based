// sync-delta-planner-context.js - Shared dependency access for push-side delta planners.

import { createDeltaQueryAccess } from './sync-delta-observability-context.js';
import type { DeltaQueryOptions } from './sync-delta-observability-context.js';

const plannerQueryAccess = createDeltaQueryAccess();

export function configureSyncDeltaPlannerContext({ getEvolu, getItemRowQuery }: DeltaQueryOptions = {}) {
  plannerQueryAccess.configure({ getEvolu, getItemRowQuery });
}

export function getPlannerItemRows(profileId: unknown, arrayName: string) {
  const evolu = plannerQueryAccess.currentEvolu();
  const itemRowQuery = plannerQueryAccess.currentItemRowQuery();
  const allItemRows = (evolu && itemRowQuery) ? (evolu.getQueryRows(itemRowQuery) || []) : [];
  return allItemRows.filter(r => r.profileId === profileId && r.arrayName === arrayName);
}
