import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

import {
  addSunOverlayReadyListenerRuntime,
  configureSunBodySilhouetteRuntimeDeps,
  dispatchSunOverlayReadyRuntime,
  getActiveSilhouetteProfileIdRuntime,
  getSilhouetteProfilesRuntime,
  removeSunOverlayReadyListenerRuntime,
} from '../js/sun-body-silhouette-runtime.js';

const savedWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
const savedCustomEvent = Object.getOwnPropertyDescriptor(globalThis, 'CustomEvent');
const defaultRuntimeDeps = configureSunBodySilhouetteRuntimeDeps();

function setRuntimeWindow(runtime) {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    writable: true,
    value: runtime,
  });
}

afterEach(() => {
  configureSunBodySilhouetteRuntimeDeps(defaultRuntimeDeps);
  if (savedWindow) Object.defineProperty(globalThis, 'window', savedWindow);
  else delete globalThis.window;
  if (savedCustomEvent) Object.defineProperty(globalThis, 'CustomEvent', savedCustomEvent);
  else delete globalThis.CustomEvent;
});

describe('sun body silhouette runtime adapter', () => {
  it('delegates profile lookup and overlay-ready events', () => {
    class CustomEventStub {
      constructor(type) {
        this.type = type;
      }
    }
    const listener = () => {};
    const profiles = [{ id: 'profile-female', sex: 'female' }];
    const calls = [];
    configureSunBodySilhouetteRuntimeDeps({
      getActiveProfileId: () => 'profile-female',
      getProfiles: () => profiles,
    });
    setRuntimeWindow({
      CustomEvent: CustomEventStub,
      dispatchEvent: event => calls.push(['dispatch', event.type, event instanceof CustomEventStub]),
      addEventListener: (type, fn) => calls.push(['add', type, fn]),
      removeEventListener: (type, fn) => calls.push(['remove', type, fn]),
    });

    expect(getActiveSilhouetteProfileIdRuntime()).toBe('profile-female');
    expect(getSilhouetteProfilesRuntime()).toBe(profiles);
    expect(dispatchSunOverlayReadyRuntime()).toBe(true);
    expect(addSunOverlayReadyListenerRuntime(listener)).toBe(true);
    expect(removeSunOverlayReadyListenerRuntime(listener)).toBe(true);
    expect(calls).toEqual([
      ['dispatch', 'sun-overlay-ready', true],
      ['add', 'sun-overlay-ready', listener],
      ['remove', 'sun-overlay-ready', listener],
    ]);
  });

  it('uses safe fallbacks when browser hooks are missing or fail', () => {
    configureSunBodySilhouetteRuntimeDeps({
      getActiveProfileId: () => { throw new Error('profile unavailable'); },
      getProfiles: () => { throw new Error('profiles unavailable'); },
    });
    setRuntimeWindow({
      dispatchEvent: () => { throw new Error('dispatch unavailable'); },
      addEventListener: null,
      removeEventListener: null,
    });
    delete globalThis.CustomEvent;

    expect(getActiveSilhouetteProfileIdRuntime()).toBeNull();
    expect(getSilhouetteProfilesRuntime()).toEqual([]);
    expect(dispatchSunOverlayReadyRuntime()).toBe(false);
    expect(addSunOverlayReadyListenerRuntime(() => {})).toBe(false);
    expect(removeSunOverlayReadyListenerRuntime(() => {})).toBe(false);

    delete globalThis.window;
    expect(getActiveSilhouetteProfileIdRuntime()).toBeNull();
    expect(getSilhouetteProfilesRuntime()).toEqual([]);
    expect(dispatchSunOverlayReadyRuntime()).toBe(false);
    expect(addSunOverlayReadyListenerRuntime(() => {})).toBe(false);
    expect(removeSunOverlayReadyListenerRuntime(() => {})).toBe(false);
  });

  it('keeps sun-body-silhouette.js browser globals behind the adapter', () => {
    const silhouetteSrc = readFileSync(new URL('../js/sun-body-silhouette.js', import.meta.url), 'utf8');
    const swSrc = readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8');

    expect(silhouetteSrc).toContain("from './sun-body-silhouette-runtime.js'");
    expect(/\bwindow(?:\.|\s*\[)/.test(silhouetteSrc)).toBe(false);
    expect(swSrc).toContain("'/js/sun-body-silhouette-runtime.js'");
  });
});
