import {escapeHTML} from './utils.js';

export interface SupplementImportIngredientChoice {
  readonly index: string;
  readonly name: string;
  readonly amount: string;
  readonly source: string;
}
export interface SupplementImportQualityChoice {
  readonly index: string;
  readonly categoryValue: string;
  readonly category: string;
  readonly analyte: string;
  readonly result: string;
  readonly selected: boolean;
}
export interface SupplementImportReviewView {
  readonly applied: boolean;
  readonly combined: boolean;
  readonly sources: readonly string[];
  readonly facts: readonly string[];
  readonly issues: readonly string[];
  readonly showFacts: boolean;
  readonly showIssues: boolean;
  readonly hasIngredients: boolean;
  readonly ingredients: readonly SupplementImportIngredientChoice[];
  readonly showInactive: boolean;
  readonly inactive: readonly Readonly<{index: string; name: string}>[];
  readonly showQuality: boolean;
  readonly quality: readonly SupplementImportQualityChoice[];
  readonly directions: string | null;
  readonly warnings: string | null;
  readonly editAction: 'Add supplement' | 'Save changes';
}

/** Observe the original escape helper's conversion, then give Svelte plain text. */
export function captureSupplementReviewText(value: unknown): string {
  if (value === null || value === undefined) {escapeHTML(value); return '';}
  let captured = '';
  escapeHTML({[Symbol.toPrimitive]() {captured = String(value); return captured;}});
  return captured;
}

/** Preserve native map/join visits and throws while retiring callback HTML returns. */
export function captureSupplementReviewRows<T, V>(rows: readonly T[], capture: (row: T, index: number) => V): readonly V[] {
  const result: V[] = [];
  void `${rows.map((row, index) => {result.push(capture(row, index)); return '';}).join('')}`;
  return result;
}
