import assert from 'node:assert/strict';

export const BENCHMARK_NOW = '2026-10-16T12:00:00.000Z';
export const CASE_NAMES = ['empty', 'control', 'lab40', 'lab120', 'meal1460', 'meal7300', 'wearable1', 'wearable3', 'combined'] as const;
export type BenchmarkCaseName = typeof CASE_NAMES[number];
export interface BenchmarkOptions {
  baseline: string; candidate: string; output: string;
  cases: BenchmarkCaseName[]; pairs: number; device: 'desktop' | 'mobile';
}
export function parseBenchmarkOptions(args: readonly string[]): BenchmarkOptions {
  const values = new Map<string, string>();
  const allowed = new Set(['--baseline', '--candidate', '--output', '--cases', '--pairs', '--device']);
  for (let index = 0; index < args.length; index++) {
    const key = args[index]!;
    assert(allowed.has(key), `Unknown option: ${key}`); assert(!values.has(key), `Duplicate option: ${key}`);
    const value = args[++index]; assert(value && !value.startsWith('--'), `Missing value: ${key}`); values.set(key, value);
  }
  const baseline = values.get('--baseline'), candidate = values.get('--candidate');
  assert(typeof baseline === 'string' && baseline.trim(), 'Explicit --baseline artifact is required');
  assert(typeof candidate === 'string' && candidate.trim(), 'Explicit --candidate artifact is required');
  const cases = (values.get('--cases') ?? 'empty,control,combined').split(',').map(value => value.trim().toLowerCase());
  assert(cases.length && cases.every(value => CASE_NAMES.includes(value as BenchmarkCaseName)), 'Unknown or empty benchmark case');
  assert.equal(new Set(cases).size, cases.length, 'Duplicate benchmark case');
  const count = values.get('--pairs') ?? '3'; assert(/^[1-5]$/.test(count), '--pairs must be an integer from 1 through 5');
  const device = (values.get('--device') ?? 'mobile').trim().toLowerCase(); assert(device === 'desktop' || device === 'mobile', 'Device must be desktop or mobile');
  const output = values.get('--output') ?? '.local-notes/benchmarks'; assert(output.trim(), 'Output directory cannot be empty');
  return {baseline, candidate, output, cases: cases as BenchmarkCaseName[], pairs: Number(count), device};
}

type LabEntry = Record<string, unknown> & {date: string; markers: Record<string, number | null>; markerSources?: Record<string, unknown>};
export type SyntheticProfile = Record<string, unknown> & {entries: LabEntry[]};
function assertProfile(value: unknown): asserts value is SyntheticProfile {
  assert(value && typeof value === 'object' && Array.isArray((value as {entries?: unknown}).entries), 'Demo profile must contain entries');
  const entries = (value as SyntheticProfile).entries; assert(entries.length, 'Demo profile has no measured entries');
  for (const entry of entries) {
    assert(typeof entry.date === 'string' && entry.markers && typeof entry.markers === 'object', 'Invalid demo entry');
    for (const result of Object.values(entry.markers)) assert(result === null || typeof result === 'number' && Number.isFinite(result), 'Unexpected demo marker value');
  }
}
/** Laboratory fixture, deliberately not a full demo import or Light-history benchmark. */
export const LABORATORY_SEED_FIELDS = ['entries', 'customMarkers', 'refOverrides'] as const;
export function makeLaboratorySeed(input: unknown): SyntheticProfile {
  assertProfile(input);
  const selected: SyntheticProfile = {entries: structuredClone(input.entries)};
  for (const key of LABORATORY_SEED_FIELDS) if (key !== 'entries' && input[key] !== undefined) selected[key] = structuredClone(input[key]);
  return selected;
}
/** Sparse real-demo values with annual full panels; no invented clinical ratios. */
export function makeLabProfile(input: unknown, count: 40 | 120): SyntheticProfile {
  assertProfile(input);
  const profile = structuredClone(input), templates = [...profile.entries].sort((a, b) => a.date.localeCompare(b.date));
  const latest = new Map<string, {value: number | null; source: unknown}>();
  for (const entry of templates) for (const [key, value] of Object.entries(entry.markers)) latest.set(key, {value, source: structuredClone(entry.markerSources?.[key])});
  const paths = [...latest.keys()].sort(); assert(paths.length, 'No measured demo markers');
  const routineCategories = new Set(['biochemistry', 'hematology', 'lipids', 'thyroid', 'diabetes', 'electrolytes', 'inflammation', 'vitamins']);
  const routine = paths.filter(key => routineCategories.has(key.split('.')[0]!));
  const core = routine.slice(0, count === 40 ? 64 : 48), other = paths.filter(key => !core.includes(key));
  const rotating = count === 40 ? 16 : 12, stride = count === 40 ? 3 : 1, every = count === 40 ? 4 : 12;
  const collection = new Date(Date.parse(BENCHMARK_NOW) - 14 * 86400000);
  profile.entries = Array.from({length: count}, (_, index) => {
    const date = new Date(Date.UTC(collection.getUTCFullYear(), collection.getUTCMonth() - index * stride, collection.getUTCDate()));
    const full = index === 0 || index % every === 0;
    const selected = full ? paths : [...new Set([...core, ...Array.from({length: Math.min(rotating, other.length)}, (_, offset) => other[(index * rotating + offset) % other.length]!)])].sort();
    const entry = structuredClone(templates[(count - 1 - index) % templates.length]!);
    entry.date = date.toISOString().slice(0, 10); entry.markers = {}; entry.markerSources = {};
    for (const key of selected) {
      const measured = latest.get(key)!; entry.markers[key] = measured.value;
      if (measured.source !== undefined) {
        const source = structuredClone(measured.source);
        if (source && typeof source === 'object') (source as Record<string, unknown>)['at'] = date.getTime();
        entry.markerSources[key] = source;
      }
    }
    return entry;
  }).sort((a, b) => a.date.localeCompare(b.date));
  assert.equal(new Set(profile.entries.map(entry => entry.date)).size, count);
  assert.equal(Object.keys(profile.entries.at(-1)!.markers).length, paths.length);
  return profile;
}
export function makeMeals(days: number) {
  assert(Number.isInteger(days) && days >= 0 && days <= 1825, 'Synthetic meal days outside finite benchmark scope');
  return Array.from({length: days * 4}, (_, index) => {
    const day = Math.floor(index / 4), slot = index % 4, date = new Date(BENCHMARK_NOW);
    date.setUTCDate(date.getUTCDate() - day); date.setUTCHours([8, 12, 18, 15][slot]!, 0, 0, 0);
    const stamp = date.toISOString(), drink = slot === 3;
    return {id: `benchmark-${days}-${day}-${slot}`, name: drink ? 'Synthetic water' : `Synthetic meal ${slot + 1}`,
      eatenAt: stamp, localDate: stamp.slice(0, 10), localTimeMinutes: date.getUTCHours() * 60,
      mealType: drink ? 'drink' : ['breakfast', 'lunch', 'dinner'][slot]!, reviewed: day % 17 !== 0,
      createdAt: stamp, updatedAt: stamp, images: [],
      nutrients: drink ? {fluidMl: 350, plainWaterMl: 350} : {energyKcal: slot === 0 ? 420 : 640, proteinG: slot === 0 ? 24 : 38,
        carbohydrateG: 60, fatG: 18, ...day % 11 ? {fiberG: 8} : {}, ...day % 13 ? {ironMg: 3.2} : {}},
      source: {kind: drink ? 'manual-water' : 'manual'}};
  });
}
export function makeWearables(days: number, sources: readonly ('oura' | 'fitbit' | 'apple_health')[] = ['oura', 'fitbit']) {
  assert(Number.isInteger(days) && days >= 0 && days <= 1095, 'Synthetic wearable days outside finite benchmark scope');
  const rows = [];
  for (let day = 0; day < days; day++) {
    if (day % 19 === 0) continue;
    const date = new Date(BENCHMARK_NOW); date.setUTCDate(date.getUTCDate() - day);
    for (const [index, source] of sources.entries()) rows.push({source, date: date.toISOString().slice(0, 10), importedAt: Date.parse(BENCHMARK_NOW),
      hrv_rmssd: 44 + day % 7 + index, rhr: 57 + day % 4, sleep_score: 80 + day % 11, readiness_score: 77 + day % 9,
      spo2_avg: 97 + day % 3 / 10, body_temp_delta: (day % 5 - 2) / 10, weight: 80 + (day % 13 - 6) / 10,
      steps: 6500 + day % 1500, activity_score: 75 + day % 10, glucose_avg: 90 + day % 12});
  }
  return rows;
}
export function makeBenchmarkCase(name: BenchmarkCaseName, demo: unknown) {
  assertProfile(demo);
  const laboratory = makeLaboratorySeed(demo);
  const profile = name === 'empty' ? {entries: []} : name === 'lab40' ? makeLabProfile(laboratory, 40)
    : name === 'lab120' || name === 'combined' ? makeLabProfile(laboratory, 120) : laboratory;
  return {profile, meals: makeMeals(name === 'meal7300' ? 1825 : name === 'meal1460' || name === 'combined' ? 365 : 0),
    wearables: makeWearables(name === 'wearable3' ? 1095 : name === 'wearable1' || name === 'combined' ? 365 : 0, name === 'wearable3' ? ['oura', 'fitbit', 'apple_health'] : ['oura', 'fitbit']),
    initialView: name === 'empty' ? 'dashboard' : 'biology-scores'};
}
export type BenchmarkFixture = ReturnType<typeof makeBenchmarkCase>;

/** Serialized only into a private closed seed page, never the measured app. */
export async function seedBenchmarkProfile({fixture, now, provider = 'openai'}:
  {fixture: BenchmarkFixture; now: string; provider?: 'openai' | 'openrouter'}) {
  if (provider !== 'openai' && provider !== 'openrouter') throw new Error('Unsupported benchmark seed provider');
  const prefix = '/__benchmark__/';
  const stateModule: typeof import('../js/state.js') = await import(prefix + 'js/state.js');
  const profileModule: typeof import('../js/profile.js') = await import(prefix + 'js/profile.js');
  const cryptoModule: typeof import('../js/crypto.js') = await import(prefix + 'js/crypto.js');
  const {state} = stateModule;
  const preferences = {'labcharts-profiles': JSON.stringify([{id: 'default', name: 'Synthetic Alex', sex: 'male', dob: '1987-11-22', createdAt: 1}]),
    'labcharts-active-profile': 'default', 'labcharts-ai-provider': provider, 'labcharts-ai-paused': 'true', 'labcharts-encryption-nudge-dismissed': 'true',
    'labcharts-default-lastViewV1': fixture.initialView, 'labcharts-default-onboarded': 'profile-set', 'labcharts-default-emptyTour': 'completed',
    'labcharts-default-tour': 'completed', 'labcharts-default-ai-reminder-dismissed': '1', 'labcharts-onboard-extras-done-default': '1',
    'labcharts-onboard-provider-skipped-default': '1', 'labcharts-analytics-consent-seen': '1',
    'labcharts-legal-acceptance': JSON.stringify({accepted: true, termsVersion: '2026-08-22', privacyVersion: '2026-08-22', policyScope: 'self-hosted-notice', acceptedAt: now})};
  for (const [key, value] of Object.entries(preferences)) localStorage.setItem(key, value);
  state.currentProfile = 'default'; state.importedData = profileModule.migrateProfileData(Object.assign(profileModule.createDefaultProfileData(), fixture.profile));
  await cryptoModule.encryptedSetItem('labcharts-default-imported', JSON.stringify(state.importedData));
  if (fixture.meals.length) {
    const nutrition: typeof import('../js/nutrition-store.js') = await import(prefix + 'js/nutrition-store.js');
    const restored = await nutrition.restoreNutritionArchive('default', {version: 1, meals: fixture.meals});
    if (restored !== fixture.meals.length) throw new Error('Incomplete durable meal restoration');
    const meals = await nutrition.listNutritionMeals('default', {limit: 10000});
    if (meals.length !== fixture.meals.length) throw new Error('Incomplete encrypted meal cache');
    const db = await nutrition.openNutritionDB('default'), tx = db.transaction('meals', 'readonly');
    const request = tx.objectStore('meals').get(fixture.meals[0]!.id);
    await new Promise<void>((resolve, reject) => {tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error); tx.onerror = () => reject(tx.error);});
    if (!request.result?._devicePayload || request.result?.name) throw new Error('Synthetic meal was not device encrypted');
  }
  if (fixture.wearables.length) {
    const wearables: typeof import('../js/wearables-store.js') = await import(prefix + 'js/wearables-store.js');
    if (!await wearables.upsertDailyBatch('default', fixture.wearables)) throw new Error('Incomplete durable wearable restoration');
    if ((await wearables.getAllDailyRaw('default')).length !== fixture.wearables.length) throw new Error('Incomplete wearable history');
    const connections = Object.fromEntries([...new Set(fixture.wearables.map(row => row.source))].map(source => [source,
      {connectedSince: fixture.wearables.filter(row => row.source === source).map(row => row.date).sort()[0], lastSyncAt: Date.parse(now)}]));
    state.importedData.wearableConnections = connections;
    const since = new Date(now); since.setUTCDate(since.getUTCDate() - 90);
    const bySource: Record<string, Awaited<ReturnType<typeof wearables.getDailyRange>>> = {};
    for (const source of Object.keys(connections)) bySource[source] = await wearables.getDailyRange('default', source, since.toISOString().slice(0, 10), now.slice(0, 10));
    const summary: typeof import('../js/wearables-summary-model.js') = await import(prefix + 'js/wearables-summary-model.js');
    state.importedData.wearableSummary = summary.computeWearableSummary(bySource, connections, {});
    await cryptoModule.encryptedSetItem('labcharts-default-imported', JSON.stringify(state.importedData));
  }
  const raw = await cryptoModule.encryptedGetItem('labcharts-default-imported');
  if (typeof raw !== 'string') throw new Error('Missing committed synthetic profile');
  return {profile: JSON.parse(raw) as Record<string, unknown>, bytes: new TextEncoder().encode(raw).length,
    meals: fixture.meals.length, wearableRows: fixture.wearables.length, labEntries: fixture.profile.entries.length};
}

export interface SemanticSample {
  caseName: BenchmarkCaseName; variant: 'baseline' | 'candidate'; pair: number;
  seedProfileSHA256: string; storedProfileSHA256: string; textSHA256: string; htmlSHA256: string;
}
export function assertBenchmarkParity(rows: readonly SemanticSample[], cases: readonly BenchmarkCaseName[], pairs: number) {
  assert.equal(rows.length, cases.length * pairs * 2, 'Missing measured rows');
  for (const row of rows) for (const value of [row.seedProfileSHA256, row.storedProfileSHA256, row.textSHA256, row.htmlSHA256]) assert(/^[a-f0-9]{64}$/.test(value), 'Missing or invalid semantic digest');
  const keys = rows.map(row => `${row.caseName}/${row.pair}/${row.variant}`); assert.equal(new Set(keys).size, rows.length, 'Duplicate measured row');
  for (const name of cases) {
    const selected = rows.filter(row => row.caseName === name); assert.equal(selected.length, pairs * 2, `Missing case rows: ${name}`);
    for (let pair = 0; pair < pairs; pair++) for (const variant of ['baseline', 'candidate']) assert(selected.some(row => row.pair === pair && row.variant === variant), `Missing paired owner: ${name}/${pair}/${variant}`);
    assert.equal(new Set(selected.map(row => row.seedProfileSHA256)).size, 1, `Seed profile differs: ${name}`);
    assert(selected.every(row => row.storedProfileSHA256 === row.seedProfileSHA256), `Whole durable profile changed: ${name}`);
    assert.equal(new Set(selected.map(row => row.textSHA256)).size, 1, `Raw rendered text differs: ${name}`);
    if (['empty', 'control', 'lab40', 'lab120'].includes(name)) assert.equal(new Set(selected.map(row => row.htmlSHA256)).size, 1, `Complete startup/Biology markup differs: ${name}`);
  }
}

/** Conventional sample median, including supported even pair counts. */
export function benchmarkMedian(values: readonly number[]): number {
  assert(values.length && values.every(Number.isFinite), 'Median needs finite observed values');
  const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}
