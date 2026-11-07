import type { LabCollectionContext } from '../types/lab-data.js';

/** Ownership of the values selected by the date-wide lab projection on split dates. */
export interface LabViewCollection {
  index: number;
  context: LabCollectionContext;
}

export type LabViewCollections = Record<string, Record<string, LabViewCollection>>;

export function sameLabViewCollection(collections: LabViewCollections | undefined, date: string, keys: readonly string[]) {
  const day = collections?.[date];
  if (!day) return true;
  const first = day[keys[0] ?? ''];
  return first != null && keys.every(key => day[key]?.index === first.index);
}
