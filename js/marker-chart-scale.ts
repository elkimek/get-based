/** Chart framing only: never convert values or change range/status meaning. */
export function resolveMarkerChartScale(values: readonly number[], bounds: readonly (number | null | undefined)[], observedCount = values.length) {
  const readings = values.filter(Number.isFinite);
  if (!readings.length) return { min: 0, max: 1, focused: false };
  const dataMin = Math.min(...readings), dataMax = Math.max(...readings);
  const rangeBounds = bounds.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  const fullMin = Math.min(dataMin, ...rangeBounds), fullMax = Math.max(dataMax, ...rangeBounds);
  // A 10%-of-magnitude floor avoids overzooming small fluctuations in a
  // nearly flat series. Focus only when ranges exceed this span twentyfold.
  const dataSpan = Math.max(dataMax - dataMin, Math.max(Math.abs(dataMin), Math.abs(dataMax)) * 0.1);
  const focused = observedCount >= 2 && dataSpan > 0 && fullMax - fullMin > dataSpan * 20;
  const min = focused ? dataMin : fullMin, max = focused ? dataMax : fullMax;
  const padding = (max - min || dataSpan || 1) * 0.15;
  return { min: min >= 0 ? Math.max(0, min - padding) : min - padding, max: max + padding, focused };
}
