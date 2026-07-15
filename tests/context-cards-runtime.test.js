import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  configureContextCardsRuntimeCallbacks,
  openContextModalRuntime,
  openInterpretiveLensEditorRuntime,
  recordContextCardChangeRuntime,
  triggerContextCardDNAFilePickerRuntime,
} from '../js/context-cards-runtime.js';

let previousCallbacks;

beforeEach(() => {
  previousCallbacks = configureContextCardsRuntimeCallbacks({
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
      openContextModal: vi.fn(),
      openInterpretiveLensEditor: vi.fn(),
      recordChange: vi.fn(),
      triggerDNAFilePicker: vi.fn(),
    };
    configureContextCardsRuntimeCallbacks(callbacks);

    expect(openContextModalRuntime()).toBe(true);
    expect(openInterpretiveLensEditorRuntime()).toBe(true);
    expect(recordContextCardChangeRuntime('menstrualCycle')).toBe(true);
    expect(triggerContextCardDNAFilePickerRuntime()).toBe(true);
    expect(callbacks.openContextModal).toHaveBeenCalledOnce();
    expect(callbacks.openInterpretiveLensEditor).toHaveBeenCalledOnce();
    expect(callbacks.recordChange).toHaveBeenCalledWith('menstrualCycle');
    expect(callbacks.triggerDNAFilePicker).toHaveBeenCalledOnce();
  });

  it('fails safely when callbacks are missing or throw', () => {
    expect(openContextModalRuntime()).toBe(false);
    configureContextCardsRuntimeCallbacks({
      openContextModal: () => { throw new Error('boom'); },
    });
    expect(openContextModalRuntime()).toBe(false);
  });
});
