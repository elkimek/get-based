import fs from 'node:fs';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  configureProfileContextLightDeps,
  getBiologyProfileContext,
} from '../js/profile-context.js';
import { state } from '../js/state.js';

let previousImportedData;
let previousLightDeps;

beforeEach(() => {
  previousImportedData = state.importedData;
  previousLightDeps = configureProfileContextLightDeps({
    rollingChannelTotals: null,
    rollingVitaminDIU: null,
  });
  state.importedData = {
    entries: [],
    contextSourceSettings: { 'light-sun': true },
    sunDefaults: { completedAt: Date.now() },
    sunSessions: [{ endedAt: Date.now() }],
    deviceSessions: [],
    lightMeasurements: [],
  };
});

afterEach(() => {
  configureProfileContextLightDeps(previousLightDeps);
  state.importedData = previousImportedData;
});

describe('profile context light dependencies', () => {
  it('uses injected light rollups when building Biology Score context', () => {
    const rollingChannelTotals = vi.fn(() => ({ circadian: 250 }));
    const rollingVitaminDIU = vi.fn(() => 1800);
    configureProfileContextLightDeps({ rollingChannelTotals, rollingVitaminDIU });

    const context = getBiologyProfileContext();

    expect(rollingChannelTotals).toHaveBeenCalledWith(7);
    expect(rollingVitaminDIU).toHaveBeenCalledWith(7);
    expect(context.light).toMatchObject({
      vitD7: 1800,
      circadian7: 250,
      lowVitaminDSynthesis: true,
    });
  });

  it('keeps unavailable light rollups unknown without importing their implementation', () => {
    const context = getBiologyProfileContext();
    const profileContextSource = fs.readFileSync(new URL('../js/profile-context.js', import.meta.url), 'utf8');
    const sunSource = fs.readFileSync(new URL('../js/sun.js', import.meta.url), 'utf8');

    expect(context.light).toMatchObject({
      vitD7: null,
      circadian7: null,
      lowVitaminDSynthesis: false,
    });
    expect(profileContextSource).not.toContain("from './sun-channel-metrics.js'");
    expect(sunSource).toContain('configureProfileContextLightDeps({ rollingChannelTotals, rollingVitaminDIU });');
  });

  it('reads the current context-card schema for deterministic modifiers', () => {
    state.importedData = {
      ...state.importedData,
      healthGoals: [{ text: 'Recover from low muscle mass', severity: 'major' }],
      lightCircadian: { amLight: 'minimal sun', daytime: 'mostly indoors' },
      loveLife: { note: 'Currently using hormone replacement therapy' },
    };

    const context = getBiologyProfileContext();

    expect(context.lowMuscleMass).toBe(false);
    expect(context.lowMuscleMassInferred).toBe(true);
    expect(context.lowSunlightExposure).toBe(true);
    expect(context.hormoneTherapy).toBe(true);

    state.importedData.diagnoses = { flags: { lowMuscleMass: true } };
    expect(getBiologyProfileContext().lowMuscleMass).toBe(true);
  });
});
