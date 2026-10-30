import { parseLabOverlayPatch, labOverlaySignature } from '../shared/lab-overlay-contract.js';
import type { LabOverlayControlIdentity, LabOverlayKey } from '../shared/lab-overlay-contract.js';
import { state } from './state.js';
import { isActiveProfileDataOwner } from './profile.js';
import { permittedLabOverlays, canDiscloseLabOverlays } from './lab-overlay-policy.js';
import { readLabOverlayPreferences, overlayConflict } from './lab-overlay-preferences.js';
interface Lease { profileId: string; threadId: string; root: typeof state.importedData; history: typeof state.chatHistory; values: ReturnType<typeof readLabOverlayPreferences>; allowed: ReturnType<typeof permittedLabOverlays>; signature?: string; used?: boolean }
const leases = new Map<string, Lease>();
const current = (lease: Lease) => state.currentProfile === lease.profileId && state.currentThreadId === lease.threadId && state.importedData === lease.root && state.chatHistory === lease.history && isActiveProfileDataOwner(lease.profileId, lease.root);
export function readLabOverlayControl(profileId: string) {
  const lease: Lease = { profileId, threadId: state.currentThreadId || '', root: state.importedData, history: state.chatHistory, values: readLabOverlayPreferences(profileId), allowed: permittedLabOverlays() };
  if (!lease.threadId || !current(lease)) overlayConflict('The originating overlay profile or chat changed.');
  const policy = permittedLabOverlays(), values = Object.fromEntries(Object.entries(lease.values).filter(([key]) => policy[key as LabOverlayKey]));
  if (!Object.keys(values).length) overlayConflict('Chart-layer tool controls are disabled by this profile’s context permissions. Use the native Layers menu; do not enable sources automatically.');
  const leaseId = crypto.randomUUID(); if (leases.size >= 100) leases.delete(leases.keys().next().value!); leases.set(leaseId, lease);
  return { leaseId, result: { action: 'labs.overlays', status: 'read_only', reviewCreated: false, saved: false, values,
    approval: 'Apply required after the reply', scope: 'saved chart layers in the active profile',
    notice: 'Only permitted switch settings are read, never whether matching records exist. Layers appear when matching records are present; cycle rendering also requires a female profile and recorded period/draw-phase context. This does not grant AI access or create records. Call getbased_request_app to create an explicitly requested review; this read creates no card.' } };
}
export function previewLabOverlayControl(leaseId: string, raw: unknown) {
  const lease = leases.get(leaseId), parameters = parseLabOverlayPatch(raw);
  if (!lease || !parameters || lease.used || !current(lease) || !canDiscloseLabOverlays({ profileId: lease.profileId, parameters })) overlayConflict('Read fresh permitted labs.overlays before requesting this review.');
  if (Object.keys(parameters).some(key => !lease.allowed[key as LabOverlayKey])) overlayConflict('Read this newly permitted overlay switch before requesting a change.');
  const values = readLabOverlayPreferences(lease.profileId), baseline = Object.fromEntries(Object.keys(parameters).map(key => [key, lease.values[key as LabOverlayKey]]));
  if (Object.entries(baseline).some(([key, value]) => values[key as LabOverlayKey] !== value)) overlayConflict('The overlay switches changed. Read a new snapshot.');
  return { parameters, baseline };
}
export function bindLabOverlayControl(record: LabOverlayControlIdentity) {
  const lease = leases.get(record.leaseId), preview = previewLabOverlayControl(record.leaseId, record.parameters);
  if (!lease || lease.signature || JSON.stringify(preview.baseline) !== JSON.stringify(record.baseline)) overlayConflict('Read a fresh overlay review.'); lease.signature = labOverlaySignature(record);
}
export function reviewedLabOverlayControl(record: LabOverlayControlIdentity) {
  const lease = leases.get(record.leaseId);
  if (!lease || lease.used || !current(lease) || lease.signature !== labOverlaySignature(record)) overlayConflict('This overlay review expired or changed. Read a fresh review.');
  lease.used = true;
}
