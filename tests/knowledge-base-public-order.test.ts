// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import type { LensUiConfig } from '../js/lens-knowledge-base-ui.js';
import { readFrozen } from './helpers/knowledge-base-current-capture.mjs';

const recipe = readFrozen<{
  baseConfig: LensUiConfig;
  baseStatus: { state: string; lastChunkCount: number; lastError: string | null; sourceName: string };
}>('capture-recipe.json');

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

it('reads public panel services in order and schedules hydration without running it', async () => {
  vi.resetModules();
  document.body.innerHTML = '<div id="custom-lens-section"></div>';
  const trace: string[] = [];
  const frames: FrameRequestCallback[] = [];
  const config = structuredClone(recipe.baseConfig);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    trace.push('scheduleFrame');
    frames.push(callback);
    return frames.length;
  });
  vi.stubGlobal('Worker', class {
    constructor() { throw new Error('Deferred panel preparation must not boot the Worker'); }
  });
  const { createLensKnowledgeBaseUi } = await import('../js/lens-knowledge-base-ui.js');
  const ui = createLensKnowledgeBaseUi({
    defaultTestProbe: 'Synthetic retrieval probe',
    getLensConfig: () => { trace.push('getLensConfig'); return config; },
    getLensKey: () => { trace.push('getLensKey'); return ''; },
    hasLens: () => { trace.push('hasLens'); return false; },
    getLensStatus: () => { trace.push('getLensStatus'); return recipe.baseStatus; },
    saveLensConfig: partial => { trace.push('saveLensConfig'); Object.assign(config, partial); },
    saveLensKey: async () => {},
    removeLens: async () => {},
    clearLensCache: () => { trace.push('clearLensCache'); },
    updateLensStatus: () => { trace.push('updateLensStatus'); },
    recordLocalLensStats: () => { trace.push('recordLocalLensStats'); },
    isValidLensUrl: () => true,
    testLensConnection: async () => ({ ok: true, chunkCount: 1 }),
  });
  const html = ui.renderCustomLensSection();
  expect(html).toContain('id="lens-local-stats"');
  expect(trace).toEqual(['getLensConfig', 'scheduleFrame', 'getLensKey', 'hasLens', 'getLensStatus']);
  expect(frames).toHaveLength(1);
  // No insertion: missing-chip guard must precede all status service reads.
  trace.length = 0;
  ui.handleToggleLens(false);
  expect(trace).toEqual(['saveLensConfig']);
  expect(config.enabled).toBe(false);
});
