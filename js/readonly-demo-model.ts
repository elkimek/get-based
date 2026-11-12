/** Public, fictional fixture projections. No application storage or services. */
export interface DemoPoint {date: string; value: number}
export interface DemoSeries {id: string; label: string; unit: string; points: DemoPoint[]}
export interface DemoProfile {
  id: 'female' | 'male'; label: string; description: string;
  drawCount: number; markerCount: number; labs: DemoSeries[]; body: DemoSeries[];
  snps: {rsid: string; gene: string; genotype: string; variant: string}[];
  sessions: {date: string; minutes: number; uvIndex: number | null}[];
  notes: {date: string; text: string}[];
}
export function sparkline(points: readonly DemoPoint[]): string {
  const values = points.map(point => point.value), low = Math.min(...values), high = Math.max(...values);
  const span = high - low || Math.max(Math.abs(high) * 0.1, 1);
  return points.map((point, index) => `${16 + index * 568 / Math.max(points.length - 1, 1)},${126 - (point.value - low) / span * 100}`).join(' ');
}
