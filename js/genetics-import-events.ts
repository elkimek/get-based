import type { ProfileData } from '../types/app-state.js';

/** A successful import announces saved data; presentation decides whether it still owns that profile. */
export const GENETICS_IMPORTED = 'labcharts-genetics-imported';
export interface GeneticsImported {
  profileId: string;
  previousData: ProfileData;
  data: ProfileData;
  source: string;
  kind: 'snps' | 'mtdna';
}
export function publishGeneticsImport(detail: GeneticsImported): void {
  globalThis.dispatchEvent(new CustomEvent<GeneticsImported>(GENETICS_IMPORTED, { detail }));
}
