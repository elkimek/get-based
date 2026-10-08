// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { AIVerdictConfig } from '../js/ai-verdict-engine.js';
const fixture = vi.hoisted(() => ({ engines: [] as { analyze: ReturnType<typeof vi.fn> }[] }));
vi.mock('../js/ai-feature-routing.js', async original => ({
  ...await original<typeof import('../js/ai-feature-routing.js')>(), hasAssistantFeatureProvider: () => true,
}));
vi.mock('../js/ai-verdict-engine.js', async original => ({
  ...await original<typeof import('../js/ai-verdict-engine.js')>(),
  createAIVerdict: <T>(_config: AIVerdictConfig<T>) => {
    const engine = { getStatus: () => 'idle', analyze: vi.fn(async () => {}), refresh: vi.fn(), maybeAfterFinish: vi.fn() };
    fixture.engines.push(engine);
    return engine;
  },
}));
import { state } from '../js/state.js';
import { createDefaultProfileData } from '../js/profile.js';
import { renderRoomAIBlock } from '../js/light-env-ai-analysis.js';
import { renderScreenAIBlock } from '../js/light-screen-ai-analysis.js';
const targets = [
  { name: 'room', render: renderRoomAIBlock, target: { id: 'same-id', name: 'Bedroom', primarySource: 'led-cool' }, index: 0 },
  { name: 'screen', render: renderScreenAIBlock, target: { id: 'same-id', device: 'phone' }, index: 1 },
];
let unique = 0;
beforeEach(() => {
  vi.useFakeTimers();
  state.currentProfile = `owner-${++unique}`;
  state.importedData = createDefaultProfileData();
  fixture.engines.forEach(engine => engine.analyze.mockClear());
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });
for (const { name, render, target, index } of targets) {
  for (const replacement of ['profile', 'root', 'epoch']) it(`${name} retires queued ${replacement} work and independently queues the same target for its new owner`, async () => {
    const engine = fixture.engines[index]!;
    const current = { ...target, id: `same-id-${unique}` };
    render(current);
    const originalRoot = state.importedData;
    if (replacement === 'profile') state.currentProfile += '-replacement';
    if (replacement !== 'epoch') state.importedData = createDefaultProfileData();
    else { state.importedData = originalRoot; dispatchEvent(new Event('labcharts-profile-switched')); }
    await vi.runAllTimersAsync();
    expect(engine.analyze).not.toHaveBeenCalled();
    const currentTarget = { ...current };
    render(currentTarget);
    await vi.runAllTimersAsync();
    expect(engine.analyze).toHaveBeenCalledExactlyOnceWith(currentTarget);
  });
  it(`${name} queues once for an unchanged current owner and fingerprint`, async () => {
    const engine = fixture.engines[index]!;
    const current = { ...target, id: `same-id-${unique}` };
    render(current); render(current);
    await vi.runAllTimersAsync();
    expect(engine.analyze).toHaveBeenCalledExactlyOnceWith(current);
  });
}
