// Pure session selection owner shared by native selectors, Swap and chat navigation.
import { state } from './state.js';
import { validComparisonDate } from '../shared/comparison-view-contract.js';
import type { CompareDatePatch } from '../shared/comparison-view-contract.js';
import type { CompareDateState } from '../types/compare-correlations.js';
/** Keep the public native setters' unknown-input contract; tool callers validate first. */
export function commitNativeCompareDates(firstDate: unknown, secondDate: unknown) {
  const before = { firstDate: state.compareDate1, secondDate: state.compareDate2 };
  (state as CompareDateState).compareDate1 = firstDate; (state as CompareDateState).compareDate2 = secondDate;
  return { before, changed: before.firstDate !== firstDate || before.secondDate !== secondDate };
}
export function nativeComparePair(dates: readonly unknown[]) {
  const catalog = dates.filter(validComparisonDate);
  return { firstDate: catalog.includes(state.compareDate1 || '') ? state.compareDate1! : catalog[0] ?? null,
    secondDate: catalog.includes(state.compareDate2 || '') ? state.compareDate2! : catalog.at(-1) ?? null };
}
export function selectNativeCompareDates(dates: readonly unknown[], patch: CompareDatePatch) {
  const current = nativeComparePair(dates);
  const after = patch.swapDates ? { firstDate: current.secondDate, secondDate: current.firstDate }
    : { firstDate: patch.firstDate === undefined ? current.firstDate : patch.firstDate, secondDate: patch.secondDate === undefined ? current.secondDate : patch.secondDate };
  if (!validComparisonDate(after.firstDate) || !validComparisonDate(after.secondDate) || !dates.includes(after.firstDate) || !dates.includes(after.secondDate)) return null;
  const committed = commitNativeCompareDates(after.firstDate, after.secondDate);
  return { ...committed, after: { firstDate: after.firstDate, secondDate: after.secondDate } };
}
