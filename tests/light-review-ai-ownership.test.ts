// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { AIVerdictConfig } from '../js/ai-verdict-engine.js';
const fixture = vi.hoisted(() => ({ engines: [] as { config: AIVerdictConfig<unknown>; analyze: ReturnType<typeof vi.fn> }[] }));
vi.mock('../js/ai-feature-routing.js', async original => ({
  ...await original<typeof import('../js/ai-feature-routing.js')>(), hasAssistantFeatureProvider: () => true,
}));
vi.mock('../js/ai-verdict-engine.js', async original => ({
  ...await original<typeof import('../js/ai-verdict-engine.js')>(),
  createAIVerdict: (config: AIVerdictConfig<unknown>) => {
    const engine = { config, getStatus: () => 'idle', analyze: vi.fn(async () => {}), refresh: vi.fn(), maybeAfterFinish: vi.fn() };
    fixture.engines.push(engine); return engine;
  },
}));
import { state } from '../js/state.js';
import { createDefaultProfileData } from '../js/profile.js';
import { renderLightTodayHero, renderLightTodayDashboardChip } from '../js/light-today-ai.js';
import { renderChannelMixVerdict } from '../js/light-channels-ai-analysis.js';
import { renderBurdenInterp } from '../js/light-burden-ai-analysis.js';
import type { SunSessionRecord } from '../js/sun-sessions-store.js';
let unique = 0;
function populated() {
  const data = createDefaultProfileData();
  data.sunSessions = [{ id: `review-${unique}`, startedAt: Date.now() - 120000, endedAt: Date.now() - 60000,
    durationMin: 1, doses: {} } as SunSessionRecord];
  data.lightEnvironment = { rooms: [{ id: `room-${unique}`, name: 'Bedroom', primarySource: 'led-warm' }], screens: [] };
  return data;
}
function engineFor(marker: string) {
  return fixture.engines.find(({ config }) => {
    const target = config.getTarget('2026-10-08', createDefaultProfileData()) as Record<string, unknown> | null;
    return target?.[marker] === true;
  })!;
}
const surfaces = [
  { name: 'Today hero', render: renderLightTodayHero, marker: 'isLightTodayTarget' },
  { name: 'Today dashboard', render: renderLightTodayDashboardChip, marker: 'isLightTodayTarget' },
  { name: 'Weekly review', render: () => renderChannelMixVerdict('<p>Existing summary</p>'), marker: 'isChannelMixTarget' },
  { name: 'Indoor summary', render: () => renderBurdenInterp({ interp: 'Existing summary' }), marker: 'isBurdenTarget' },
];
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 9, 8 + ++unique, 12));
  state.currentProfile = `review-owner-${unique}`; state.importedData = populated();
  fixture.engines.forEach(engine => engine.analyze.mockClear());
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });
for (const { name, render, marker } of surfaces) {
  for (const replacement of ['profile', 'root', 'epoch']) it(`${name} cancels queued ${replacement} work and queues the unchanged data for its new owner`, async () => {
    const engine = engineFor(marker); expect(engine).toBeDefined();
    render();
    if (replacement === 'profile') state.currentProfile += '-replacement';
    if (replacement !== 'epoch') state.importedData = structuredClone(state.importedData);
    else dispatchEvent(new Event('labcharts-profile-switched'));
    await vi.runAllTimersAsync(); expect(engine.analyze).not.toHaveBeenCalled();
    render(); await vi.runAllTimersAsync(); expect(engine.analyze).toHaveBeenCalledTimes(1);
  });
  it(`${name} queues once for an unchanged current owner`, async () => {
    const engine = engineFor(marker); render(); render();
    await vi.runAllTimersAsync(); expect(engine.analyze).toHaveBeenCalledTimes(1);
  });
}
it('Today hero and dashboard share one current-owner analysis', async () => {
  renderLightTodayHero(); renderLightTodayDashboardChip();
  await vi.runAllTimersAsync(); expect(engineFor('isLightTodayTarget').analyze).toHaveBeenCalledTimes(1);
});
