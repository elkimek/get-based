export function validComparisonDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z'); return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export interface CompareDatePatch { firstDate?: unknown; secondDate?: unknown; swapDates?: boolean }
export function validateComparisonNavigation(request: { view: string; firstDate?: string; secondDate?: string; swapDates?: boolean; snapshotId?: string }) {
  const supplied = ['firstDate', 'secondDate', 'swapDates'].some(key => Object.hasOwn(request, key)) || request.view === 'compare' && Object.hasOwn(request, 'snapshotId');
  if (!supplied) return;
  if (request.view !== 'compare') throw new Error('Comparison dates and snapshotId apply only to the compare destination.');
  if (!request.snapshotId || !/^[A-Za-z0-9_-]{1,128}$/.test(request.snapshotId)) throw new Error('Read labs.comparison for a fresh snapshotId before selecting or swapping dates.');
  if (Object.hasOwn(request, 'swapDates') && request.swapDates !== true) throw new Error('swapDates must be true when supplied.');
  if (request.swapDates && (request.firstDate !== undefined || request.secondDate !== undefined)) throw new Error('Swap is a separate command from selecting dates.');
  if (!request.swapDates && request.firstDate === undefined && request.secondDate === undefined) throw new Error('Select at least one date or request swapDates:true.');
  if (request.firstDate !== undefined && !validComparisonDate(request.firstDate) || request.secondDate !== undefined && !validComparisonDate(request.secondDate)) throw new Error('Use exact recorded YYYY-MM-DD comparison dates.');
}
