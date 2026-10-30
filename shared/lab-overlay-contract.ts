export const LAB_OVERLAY_LABELS = { notes: 'Notes', supplements: 'Supplements', cycle: 'Cycle phase at blood draw' } as const;
export type LabOverlayKey = keyof typeof LAB_OVERLAY_LABELS;
export type LabOverlayPatch = Partial<Record<LabOverlayKey, boolean>>;
export function parseLabOverlayPatch(value: unknown): LabOverlayPatch | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const entries = Object.entries(value);
  return entries.length > 0 && entries.every(([key, value]) => Object.hasOwn(LAB_OVERLAY_LABELS, key) && typeof value === 'boolean') ? { ...value } as LabOverlayPatch : null;
}
export interface LabOverlayControlIdentity {
  id: string; action: 'labs.overlays'; profileId: string; threadId: string; leaseId: string;
  parameters: LabOverlayPatch; baseline: LabOverlayPatch; reason: string; evidence: string;
}
export function labOverlaySignature(record: LabOverlayControlIdentity) {
  return JSON.stringify({ id: record.id, action: record.action, profileId: record.profileId, threadId: record.threadId, leaseId: record.leaseId,
    parameters: record.parameters, baseline: record.baseline, reason: record.reason.trim(), evidence: record.evidence.trim() },
  (_key, value: unknown) => value && typeof value === 'object' && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))) : value);
}
