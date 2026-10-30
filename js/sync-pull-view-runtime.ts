// Shell callbacks are wired without loading the inbound transport and merge graph.
import { configureRuntimeDependencies } from './runtime-callbacks.js';
import type { RuntimeDependencyUpdates } from './runtime-callbacks.js';

interface SyncPullViewDeps {
  renderProfileButton: () => void;
  reconcilePulledManualWearables: (profileId: string, imported: unknown) => Promise<unknown>;
}
const deps: SyncPullViewDeps = {
  renderProfileButton: () => {},
  reconcilePulledManualWearables: async () => false,
};
export function configureSyncPullViewDeps(update: RuntimeDependencyUpdates<SyncPullViewDeps> = {}) {
  return configureRuntimeDependencies(deps, update);
}
export const renderProfileButtonAfterSync = () => deps.renderProfileButton();
export const reconcileManualWearablesAfterSync = (profileId: string, imported: unknown) => deps.reconcilePulledManualWearables(profileId, imported);
