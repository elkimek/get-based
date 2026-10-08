import { beforeEach, expect, it, vi } from 'vitest';
import type { AIVerdictConfig, AIVerdictAnalysis } from '../js/ai-verdict-engine.js';
import type { ProfileData } from '../types/app-state.js';
const observed = vi.hoisted(() => ({ configs: [] as AIVerdictConfig<unknown>[] }));
vi.mock('../js/ai-verdict-engine-runtime.js', async original => ({ ...await original<typeof import('../js/ai-verdict-engine-runtime.js')>(), hasAIVerdictRuntime: () => false, refreshSunSurfacesRuntime: () => {} }));
vi.mock('../js/ai-verdict-engine.js', async original => {
  const actual = await original<typeof import('../js/ai-verdict-engine.js')>();
  return { ...actual, createAIVerdict: <T>(config: AIVerdictConfig<T>) => { observed.configs.push(config as unknown as AIVerdictConfig<unknown>); return actual.createAIVerdict(config); } };
});
import { state } from '../js/state.js';
import { createDefaultProfileData } from '../js/profile.js';
const adapters: { name: string; config: AIVerdictConfig<unknown> }[] = [];
for (const name of ['sun-ai-analysis', 'light-device-ai-analysis', 'light-tools-ai-analysis', 'light-audit-ai-analysis', 'light-env-ai-analysis', 'light-screen-ai-analysis', 'sun-onboarding-ai', 'light-today-ai', 'light-channels-ai-analysis', 'light-burden-ai-analysis']) {
  const before = observed.configs.length; await import(`../js/${name}.js`);
  if (observed.configs.length !== before + 1) throw new Error(`Expected exactly one engine adapter for ${name}`);
  adapters.push({ name, config: observed.configs[before]! });
}
const original: AIVerdictAnalysis = { status: 'ok', dot: 'yellow', tip: 'Captured A verdict' };
const updated: AIVerdictAnalysis = { status: 'ok', dot: 'green', tip: 'Private staged result' };
function fixture(): ProfileData {
  // These callbacks read only identity and analysis; other domain fields stay opaque.
  const row = (id: string) => ({ id, aiAnalysis: structuredClone(original), preserved: 'metadata' });
  return Object.assign(createDefaultProfileData(), {
    sunDefaults: { completedAt: 1, aiAnalysis: structuredClone(original) },
    sunSessions: [row('sun')], deviceSessions: [row('device')], lightMeasurements: [row('measurement')], lightAudits: [row('audit')],
    lightEnvironment: { rooms: [row('room')], screens: [row('screen')], burdenAI: structuredClone(original) },
    lightDailyVerdicts: { '2026-06-21': structuredClone(original) }, channelMixAI: structuredClone(original),
  }) as unknown as ProfileData;
}
beforeEach(() => { state.currentProfile = 'replacement'; state.importedData = createDefaultProfileData(); state.importedData.contextNotes = 'Keep replacement profile'; });
for (const { name, config } of adapters) it(`${name} resolves, reads, updates and deletes only the supplied profile snapshot`, () => {
  const draft = fixture(), beforeLive = structuredClone(state.importedData), untouched = fixture();
  const targets = config.getAllTargets!(draft); expect(targets).toHaveLength(1);
  const id = config.getId(targets[0]), target = config.getTarget(id, draft); expect(target).toBeTruthy();
  expect(config.getAIAnalysis(target, draft)).toEqual(original);
  config.setAIAnalysis(target, updated, draft);
  expect(config.getAIAnalysis(config.getTarget(id, draft), draft)).toEqual(updated);
  expect(state.importedData).toEqual(beforeLive); expect(untouched).toEqual(fixture());
  config.setAIAnalysis(config.getTarget(id, draft), null, draft);
  expect(config.getAIAnalysis(target, draft)).toBeNull(); expect(state.importedData).toEqual(beforeLive);
});
it('daily verdict trimming affects only the supplied map and retains the newest thirty dates', () => {
  const config = adapters.find(adapter => adapter.name === 'light-today-ai')!.config, draft = fixture(); draft.lightDailyVerdicts = {};
  for (let day = 1; day <= 31; day++) draft.lightDailyVerdicts[`2026-01-${String(day).padStart(2, '0')}`] = structuredClone(original);
  const before = structuredClone(state.importedData); config.setAIAnalysis(config.getTarget('2026-02-01', draft), updated, draft);
  expect(Object.keys(draft.lightDailyVerdicts).sort()).toHaveLength(30);
  expect(draft.lightDailyVerdicts['2026-01-01']).toBeUndefined(); expect(draft.lightDailyVerdicts['2026-01-02']).toBeUndefined(); expect(draft.lightDailyVerdicts['2026-02-01']).toEqual(updated); expect(state.importedData).toEqual(before);
});
