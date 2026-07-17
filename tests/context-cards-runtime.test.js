import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import {
  closeContextCardModalRuntime,
  configureContextCardsRuntimeCallbacks,
  navigateContextCardViewRuntime,
  openContextModalRuntime,
  openInterpretiveLensEditorRuntime,
  recordContextCardChangeRuntime,
  triggerContextCardDNAFilePickerRuntime,
} from '../js/context-cards-runtime.js';

let previousCallbacks;

beforeEach(() => {
  previousCallbacks = configureContextCardsRuntimeCallbacks({
    closeModal: null,
    navigate: null,
    openContextModal: null,
    openInterpretiveLensEditor: null,
    recordChange: null,
    triggerDNAFilePicker: null,
  });
});

afterEach(() => {
  configureContextCardsRuntimeCallbacks(previousCallbacks);
  vi.restoreAllMocks();
});

describe('context-card runtime callbacks', () => {
  it('routes context, lens, history, and DNA actions explicitly', () => {
    const callbacks = {
      closeModal: vi.fn(),
      navigate: vi.fn(),
      openContextModal: vi.fn(),
      openInterpretiveLensEditor: vi.fn(),
      recordChange: vi.fn(),
      triggerDNAFilePicker: vi.fn(),
    };
    configureContextCardsRuntimeCallbacks(callbacks);

    expect(closeContextCardModalRuntime()).toBe(true);
    expect(navigateContextCardViewRuntime('body')).toBe(true);
    expect(openContextModalRuntime()).toBe(true);
    expect(openInterpretiveLensEditorRuntime()).toBe(true);
    expect(recordContextCardChangeRuntime('menstrualCycle')).toBe(true);
    expect(triggerContextCardDNAFilePickerRuntime()).toBe(true);
    expect(callbacks.closeModal).toHaveBeenCalledOnce();
    expect(callbacks.navigate).toHaveBeenCalledWith('body');
    expect(callbacks.openContextModal).toHaveBeenCalledOnce();
    expect(callbacks.openInterpretiveLensEditor).toHaveBeenCalledOnce();
    expect(callbacks.recordChange).toHaveBeenCalledWith('menstrualCycle');
    expect(callbacks.triggerDNAFilePicker).toHaveBeenCalledOnce();
  });

  it('fails safely when callbacks are missing or throw', () => {
    expect(closeContextCardModalRuntime()).toBe(false);
    expect(navigateContextCardViewRuntime('dashboard')).toBe(false);
    expect(openContextModalRuntime()).toBe(false);
    configureContextCardsRuntimeCallbacks({
      openContextModal: () => { throw new Error('boom'); },
    });
    expect(openContextModalRuntime()).toBe(false);
  });

  it('keeps core view callbacks off the legacy bridge', () => {
    const source = fs.readFileSync(new URL('../js/context-cards.js', import.meta.url), 'utf8');
    expect(source).toContain("from './context-cards-runtime.js'");
    expect(source).toContain('closeContextCardModalRuntime()');
    expect(source).toContain('navigateContextCardViewRuntime(category)');
    expect(source).not.toContain('views-runtime-bridge.js');
    expect(source).not.toContain('getViewRuntimeFunction');
  });
});
