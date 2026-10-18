// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { contextStatusFixture, contextStatusElement } from './helpers/context-card-status-fixture.js';
import type { LabContextBuilder } from '../js/lab-context-loader.js';
const ports = vi.hoisted(() => ({
  provider: 'ollama',
  model: 'model-a',
  available: true,
  paused: false,
  demo: false,
  resident: null as LabContextBuilder | null,
  load: vi.fn<() => Promise<LabContextBuilder>>(),
  infer: vi.fn(),
  usage: vi.fn(),
}));
vi.mock('../js/api.js', () => ({
  isAIPaused: () => ports.paused
}));
vi.mock('../js/ai-feature-routing.js', () => ({
  getAssistantFeatureIdentity: () => ({
    provider: ports.provider,
    modelId: ports.model,
    subscription: false
  }),
  hasAssistantFeatureProvider: () => ports.available && !ports.paused,
  callAssistantFeatureAI: ports.infer,
}));
vi.mock('../js/context-card-summaries.js', () => ({
  CONTEXT_CARD_KEYS: ['diet', 'exercise', 'healthGoals']
}));
vi.mock('../js/lab-context-loader.js', () => ({
  getLoadedLabContextBuilder: () => ports.resident,
  loadLabContextBuilder: ports.load,
}));
vi.mock('../js/local-ai-provider-shared.js', () => ({
  isCloudModel: () => false
}));
vi.mock('../js/profile.js', () => ({
  getProfiles: () => ports.demo ? [{
    id: 'cold-origin',
    tags: ['demo']
  }] : [],
  profileStorageKey: (id: string, key: string) => `${id}:${key}`,
}));
vi.mock('../js/schema.js', () => ({
  trackUsage: ports.usage
}));
import { state } from '../js/state.js';
import { contextCardStatus } from '../js/context-card-status.js';
import {
  configureContextCardHealthDots,
  disableDemoContextLiveAI,
  enableDemoContextLiveAI,
  getCardFingerprint,
  loadContextHealthDots
} from '../js/context-card-health-dots.js';
const defaults = configureContextCardHealthDots();
const original = {
  profile: state.currentProfile,
  data: state.importedData,
  sex: state.profileSex,
  dob: state.profileDob
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return {
    promise,
    resolve,
    reject
  };
}
beforeEach(() => {
  globalThis.dispatchEvent(new Event('labcharts-profile-switched'));
  localStorage.clear();
  vi.clearAllMocks();
  configureContextCardHealthDots(defaults);
  ports.provider = 'ollama';
  ports.model = 'model-a';
  ports.available = true;
  ports.paused = false;
  ports.demo = false;
  ports.resident = null;
  state.currentProfile = 'cold-origin';
  state.importedData = {
    ...original.data,
    entries: [],
    healthGoals: [],
    diet: {
      breakfast: 'Reported eggs'
    },
    exercise: null
  };
  state.profileSex = 'female';
  state.profileDob = '1990-01-01';
  ports.infer.mockResolvedValue({
    text: JSON.stringify({
      diet: {
        dot: 'green',
        summary: 'Reported eggs',
        tip: 'Literal tip'
      }
    })
  });
  contextStatusFixture(document.body, ['diet', 'exercise', 'healthGoals']);
});
afterEach(() => {
  configureContextCardHealthDots(defaults);
  globalThis.dispatchEvent(new Event('labcharts-profile-switched'));
  state.currentProfile = original.profile;
  state.importedData = original.data;
  state.profileSex = original.sex;
  state.profileDob = original.dob;
  document.body.replaceChildren();
});
describe('default context builder eligibility and ownership', () => {
  it.each(['unavailable', 'paused', 'paid-demo', 'empty', 'fresh-cache'] as const)('never acquires the builder for %s', async gate => {
    if (gate === 'unavailable') ports.available = false;
    if (gate === 'paused') ports.paused = true;
    if (gate === 'paid-demo') {
      ports.demo = true;
      ports.provider = 'openrouter';
    }
    if (gate === 'empty') state.importedData.diet = null;
    if (gate === 'fresh-cache') localStorage.setItem('cold-origin:contextHealth', JSON.stringify({
      dots: {
        diet: 'green',
        exercise: 'gray',
        healthGoals: 'gray'
      },
      summaries: {
        diet: '',
        exercise: '',
        healthGoals: ''
      },
      cardSummaries: {
        diet: '',
        exercise: '',
        healthGoals: ''
      },
      sources: {
        diet: 'ai',
        exercise: 'ai',
        healthGoals: 'ai'
      },
      fingerprints: {
        diet: getCardFingerprint('diet'),
        exercise: getCardFingerprint('exercise'),
        healthGoals: getCardFingerprint('healthGoals')
      },
    }));
    await loadContextHealthDots();
    expect(ports.load).not.toHaveBeenCalled();
    expect(ports.infer).not.toHaveBeenCalled();
  });
  it('shares a held first import, then builds and sends the exact live context once', async () => {
    const pending = deferred<LabContextBuilder>();
    const build = vi.fn(() => '[section:diet]Reported eggs[/section:diet]');
    ports.load.mockReturnValue(pending.promise);
    const first = loadContextHealthDots();
    expect(loadContextHealthDots()).toBe(first);
    expect(ports.load).toHaveBeenCalledOnce();
    expect(build).not.toHaveBeenCalled();
    expect(ports.infer).not.toHaveBeenCalled();
    pending.resolve(build);
    await first;
    expect(ports.infer).toHaveBeenCalledOnce();
    expect(ports.infer.mock.calls[0]![0].messages).toEqual([{
      role: 'user',
      content: '[section:diet]Reported eggs[/section:diet]'
    }]);
    expect(contextStatusElement('summary', 'diet')?.textContent).toBe('Reported eggs');
  });
  it.each([
    'profile',
    'data',
    'facts',
    'sex',
    'dob',
    'provider',
    'model',
    'paused',
    'unavailable',
    'consent',
    'builder',
    'demo-reader',
    'getter-owner'
  ] as const)('never builds or sends after %s changes during import', async change => {
    const pending = deferred<LabContextBuilder>();
    const build = vi.fn(() => 'Must never be assembled');
    ports.load.mockReturnValue(pending.promise);
    const request = loadContextHealthDots();
    if (change === 'getter-owner') Object.defineProperty(state.importedData.diet!, 'breakfast', {
      enumerable: true,
      configurable: true,
      get() {
        state.currentProfile = 'replacement';
        return 'Reported eggs';
      }
    });
    if (change === 'profile') state.currentProfile = 'replacement';
    if (change === 'data') state.importedData = {
      ...state.importedData
    };
    if (change === 'facts') state.importedData.diet!.breakfast = 'Reported oats';
    if (change === 'sex') state.profileSex = 'male';
    if (change === 'dob') state.profileDob = '1980-01-01';
    if (change === 'provider') ports.provider = 'openrouter';
    if (change === 'model') ports.model = 'replacement';
    if (change === 'paused') ports.paused = true;
    if (change === 'unavailable') ports.available = false;
    if (change === 'consent') globalThis.dispatchEvent(new Event('labcharts-ai-settings-local-changed'));
    if (change === 'builder') configureContextCardHealthDots({
      buildLabContext: () => 'Replacement builder'
    });
    if (change === 'demo-reader') configureContextCardHealthDots({
      isActiveDemoProfile: () => false
    });
    pending.resolve(build);
    await request;
    expect(build).not.toHaveBeenCalled();
    expect(ports.infer).not.toHaveBeenCalled();
    expect(localStorage.getItem('cold-origin:contextHealth')).toBeNull();
  });
  it.each(['profile', 'data', 'builder', 'provider', 'paused'] as const)(
    'does not dispatch context when the prepared builder replaces %s while assembling it',
    async change => {
      const pending = deferred<LabContextBuilder>();
      ports.load.mockReturnValue(pending.promise);
      const request = loadContextHealthDots();
      const build = vi.fn(() => {
        if (change === 'profile') state.currentProfile = 'replacement';
        if (change === 'data') state.importedData = { ...state.importedData };
        if (change === 'builder') configureContextCardHealthDots({ buildLabContext: () => 'Replacement context' });
        if (change === 'provider') ports.provider = 'openrouter';
        if (change === 'paused') ports.paused = true;
        return 'Old private context';
      });
      pending.resolve(build);
      await request;
      expect(build).toHaveBeenCalledOnce();
      expect(ports.infer).not.toHaveBeenCalled();
      expect(localStorage.getItem('cold-origin:contextHealth')).toBeNull();
      expect(localStorage.getItem('replacement:contextHealth')).toBeNull();
    },
  );
  it.each(['diet', 'markers', 'health-goals', 'paid-demo', 'consent', 'fingerprint-consent'] as const)(
    'does not dispatch or publish when assembly changes %s without replacing the profile data',
    async change => {
      ports.provider = 'openrouter';
      if (change === 'consent') {
        ports.demo = true;
        expect(enableDemoContextLiveAI().mode).toBe('paid-live');
      }
      const pending = deferred<LabContextBuilder>();
      ports.load.mockReturnValue(pending.promise);
      const data = state.importedData;
      const request = loadContextHealthDots();
      const loading = structuredClone(contextCardStatus('diet'));
      expect(loading.loading).toBe(true);
      const build = vi.fn(() => {
        if (change === 'diet') data.diet!.breakfast = 'Reported oats';
        if (change === 'markers') data.entries.push({ date: '2026-10-17', markers: { glucose: 5.2 } });
        if (change === 'health-goals') data.healthGoals.push({ text: 'New goal during assembly' });
        if (change === 'paid-demo') ports.demo = true;
        if (change === 'consent') expect(disableDemoContextLiveAI().mode).toBe('paid-off');
        if (change === 'fingerprint-consent') Object.defineProperty(data.diet!, 'breakfast', {
          configurable: true,
          enumerable: true,
          get() {
            ports.demo = true;
            return 'Reported eggs';
          }
        });
        return 'Private context assembled before the synchronous input change';
      });
      pending.resolve(build);
      await request;
      expect(build).toHaveBeenCalledOnce();
      expect(state.importedData).toBe(data);
      expect(ports.infer).not.toHaveBeenCalled();
      expect(ports.usage).not.toHaveBeenCalled();
      expect(localStorage.getItem('cold-origin:contextHealth')).toBeNull();
      expect(contextCardStatus('diet')).toEqual(loading);
    },
  );
  it('clears only its current loading view on failed import and permits a later retry', async () => {
    ports.load.mockRejectedValueOnce(new Error('Synthetic import failure'));
    await loadContextHealthDots();
    expect(contextStatusElement('dot', 'diet')?.classList.contains('ctx-health-dot-gray')).toBe(true);
    const build = vi.fn(() => 'Recovered context');
    ports.load.mockResolvedValue(build);
    await loadContextHealthDots();
    expect(ports.load).toHaveBeenCalledTimes(2);
    expect(ports.infer).toHaveBeenCalledOnce();
  });
  it('runs injected builders and provider dispatch synchronously without consulting the cold loader', async () => {
    const trace: string[] = [];
    const build = vi.fn(() => {
      trace.push('build');
      return 'Injected context';
    });
    configureContextCardHealthDots({
      buildLabContext: build
    });
    ports.infer.mockImplementation(() => {
      trace.push('provider');
      return Promise.resolve({
        text: '{}'
      });
    });
    const pending = loadContextHealthDots();
    expect(trace).toEqual(['build', 'provider']);
    expect(ports.load).not.toHaveBeenCalled();
    await pending;
  });
  it('restores the default callable through the unchanged configure-return contract', async () => {
    const previous = configureContextCardHealthDots({
      buildLabContext: () => 'Injected context'
    });
    expect(typeof previous.buildLabContext).toBe('function');
    configureContextCardHealthDots(previous);
    ports.resident = vi.fn(() => 'Already loaded context');
    await loadContextHealthDots();
    expect(ports.load).not.toHaveBeenCalled();
    expect(ports.resident).toHaveBeenCalled();
    expect(ports.infer).toHaveBeenCalledOnce();
  });
});
