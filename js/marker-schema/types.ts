/** Canonical units and reference policies for the built-in authoring catalog. */
export interface MarkerDefinition {
  name: string;
  unit: string;
  refMin: number | null;
  refMax: number | null;
  desc: string;
  refMin_f?: number;
  refMax_f?: number;
  rangePolicy?: 'contextual' | 'guidance' | 'target';
  hidden?: boolean;
}
export interface MarkerCategory {
  label: string;
  icon: string;
  markers: Record<string, MarkerDefinition>;
  group?: string;
  calculated?: boolean;
  singlePoint?: boolean;
}
export type MarkerIdentityRow = [
  identityKey: string, currentDotKey: string,
  legacyDotKeys?: string[], legacyIdentityKeys?: string[],
];
