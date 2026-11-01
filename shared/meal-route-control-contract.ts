// Finite native preference command; no model-supplied provider URLs or storage values.
export function validateMealRouteNavigation(request: { view: string; mealRoute?: string; snapshotId?: string; undoId?: string }) {
  const supplied = request.mealRoute !== undefined || request.view === 'aiSettings' && (request.snapshotId !== undefined || request.undoId !== undefined);
  if (!supplied) return;
  if (request.view !== 'aiSettings' || !request.snapshotId || !/^[A-Za-z0-9_-]{1,128}$/.test(request.snapshotId)) throw new Error('Read nutrition.route for a fresh snapshotId and use the aiSettings destination.');
  if ((request.mealRoute !== undefined) === (request.undoId !== undefined)) throw new Error('Use either a returned mealRoute choice ID or a current undoId.');
  for (const value of [request.mealRoute, request.undoId]) if (value !== undefined && !/^[A-Za-z0-9_-]{1,128}$/.test(value)) throw new Error('Use an exact current nutrition.route choice or Undo ID.');
}
