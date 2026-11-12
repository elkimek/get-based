import type {DemoProfile, DemoSeries} from '../js/readonly-demo-model.js';
interface Fixture {
  _source: string;
  entries: {date: string; markers: Record<string, unknown>}[];
  genetics: {snps: Record<string, {gene: string; genotype: string; variant: string}>};
  biometrics: {weight: {date: string; value: number}[]; bp: {date: string; sys: number; dia: number}[]; pulse: {date: string; value: number}[]};
  sunSessions: {startedAt: number; durationMin: number; atmosphere?: {uvIndex?: number}}[];
  notes: {date: string; text: string}[];
}
interface MarkerCatalog { [category: string]: {markers: Record<string, {name: string; unit: string}>} }
const selected = ['biochemistry.glucose', 'diabetes.hba1c', 'lipids.ldl', 'iron.ferritin', 'thyroid.tsh', 'vitamins.vitaminD'];
/** Build-time only. The browser receives bounded sample views, never data APIs. */
export function projectDemoFixture(id: 'female' | 'male', fixture: Fixture, catalog: MarkerCatalog): DemoProfile {
  if (fixture._source !== 'demo') throw new Error('The public demo accepts only the committed fictional fixtures.');
  const draws = new Map<string, Record<string, unknown>>();
  for (const entry of fixture.entries) draws.set(entry.date, {...draws.get(entry.date), ...entry.markers});
  const entries = [...draws].sort(([a], [b]) => a.localeCompare(b));
  const labs: DemoSeries[] = selected.map(key => {
    const [category, marker] = key.split('.'), definition = catalog[category!]?.markers[marker!];
    if (!definition) throw new Error('Unknown demo marker: ' + key);
    return {id: key, label: definition.name, unit: definition.unit, points: entries.flatMap(([date, values]) => {
      const value = values[key]; return typeof value === 'number' && Number.isFinite(value) ? [{date, value}] : [];
    })};
  }).filter(series => series.points.length > 0);
  const {weight, bp, pulse} = fixture.biometrics;
  return {id, label: id === 'female' ? 'Female sample' : 'Male sample',
    description: id === 'female' ? 'Fictional profile · 34 years old' : 'Fictional profile · 38 years old',
    drawCount: draws.size, markerCount: new Set(entries.flatMap(([, markers]) => Object.keys(markers))).size, labs,
    body: [
      {id: 'weight', label: 'Weight', unit: 'kg', points: weight},
      {id: 'bp', label: 'Systolic blood pressure', unit: 'mmHg', points: bp.map(point => ({date: point.date, value: point.sys}))},
      {id: 'pulse', label: 'Resting pulse', unit: 'bpm', points: pulse},
    ],
    snps: Object.entries(fixture.genetics.snps).map(([rsid, value]) => ({rsid, ...value})),
    sessions: fixture.sunSessions.slice(0, 12).map(session => ({date: new Date(session.startedAt).toISOString().slice(0, 10), minutes: session.durationMin, uvIndex: session.atmosphere?.uvIndex ?? null})),
    notes: fixture.notes.slice(0, 8).map(note => ({date: note.date, text: note.text})),
  };
}
