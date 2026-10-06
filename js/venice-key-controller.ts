import { createProviderKeyController, type ProviderKeyServices } from './provider-key-controller.js';
import type { VeniceSettingsSnapshot, VeniceSettingsView } from './venice-settings-contract.js';

export type VeniceKeyServices = ProviderKeyServices<VeniceSettingsSnapshot>;
const controller = createProviderKeyController<VeniceSettingsSnapshot>('venice');
export function isVeniceKeySavePending(): boolean { return controller.isPending(); }
export function saveVeniceSettingsKey(view: VeniceSettingsView | null, services: VeniceKeyServices): Promise<void> {
  return controller.save(view, services);
}
