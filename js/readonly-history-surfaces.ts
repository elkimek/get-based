// Only first-party history constructors register authority to replace a read-only modal.
type Surface = 'nutritionHistory' | 'wearableDetail';
interface OwnedSurface { current: () => boolean; metricId?: string }
const surfaces = new Map<Surface, OwnedSurface>();
export function registerReadonlyHistorySurface(surface: Surface, current: () => boolean, metricId?: string) {
  const owner: OwnedSurface = { current, ...(metricId ? { metricId } : {}) }; surfaces.set(surface, owner); return () => { if (surfaces.get(surface) === owner) surfaces.delete(surface); };
}
export function ownsReadonlyHistorySurface(surface: string): boolean {
  try { return surfaces.get(surface as Surface)?.current() === true; } catch { return false; }
}
export function captureReadonlyHistorySurface(surface: Surface) {
  const owner = surfaces.get(surface); if (!owner || !ownsReadonlyHistorySurface(surface)) return null;
  return { metricId: owner.metricId, current: () => surfaces.get(surface) === owner && ownsReadonlyHistorySurface(surface) };
}
