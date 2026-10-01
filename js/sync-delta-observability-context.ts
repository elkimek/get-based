// sync-delta-observability-context.js - Shared Evolu query access for delta observability.

import type { DeltaItemRow } from './sync-delta-row-codec.js';

export interface DeltaQueryClient {
  getQueryRows(query: unknown): readonly DeltaItemRow[] | null | undefined;
}
export interface DeltaMutationClient extends DeltaQueryClient {
  insert(table: 'itemRow', args: unknown): unknown;
  update(table: 'itemRow', args: unknown): unknown;
}
export interface DeltaQueryOptions<Client extends DeltaQueryClient = DeltaQueryClient> {
  getEvolu?: (() => Client | null | undefined) | undefined;
  getItemRowQuery?: (() => unknown) | undefined;
}

/** Independent provider slots with the same validated overrides and guarded reads. */
export function createDeltaQueryAccess<Client extends DeltaQueryClient = DeltaQueryClient>() {
  let _getEvolu: NonNullable<DeltaQueryOptions<Client>['getEvolu']> = () => null;
  let _getItemRowQuery: NonNullable<DeltaQueryOptions['getItemRowQuery']> = () => null;

  function configure({ getEvolu, getItemRowQuery }: DeltaQueryOptions<Client> = {}) {
    if (typeof getEvolu === 'function') _getEvolu = getEvolu;
    if (typeof getItemRowQuery === 'function') _getItemRowQuery = getItemRowQuery;
  }

  function currentEvolu() {
    try { return _getEvolu?.() || null; } catch { return null; }
  }

  function currentItemRowQuery() {
    try { return _getItemRowQuery?.() || null; } catch { return null; }
  }
  function providers() {
    return { getEvolu: _getEvolu, getItemRowQuery: _getItemRowQuery };
  }
  return { configure, currentEvolu, currentItemRowQuery, providers };
}

const observabilityQueryAccess = createDeltaQueryAccess();

export function configureSyncDeltaObservabilityContext({ getEvolu, getItemRowQuery }: DeltaQueryOptions = {}) {
  observabilityQueryAccess.configure({ getEvolu, getItemRowQuery });
}

export function currentDeltaEvolu() {
  return observabilityQueryAccess.currentEvolu();
}

export function currentDeltaItemRowQuery() {
  return observabilityQueryAccess.currentItemRowQuery();
}
