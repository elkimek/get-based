import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  closeNoteModalRuntime,
  isNoteActionDelegatesBoundRuntime,
  markNoteActionDelegatesBoundRuntime,
  navigateAfterNoteChangeRuntime,
  rememberNoteModalTriggerRuntime,
} from '../js/notes-runtime.js';

const savedWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');

function setRuntimeWindow(runtime) {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    writable: true,
    value: runtime,
  });
}

afterEach(() => {
  if (savedWindow) {
    Object.defineProperty(globalThis, 'window', savedWindow);
  } else {
    delete globalThis.window;
  }
});

describe('notes runtime adapter', () => {
  it('delegates modal focus, close, and navigation hooks', () => {
    const closeModal = vi.fn();
    const rememberModalTrigger = vi.fn();
    const navigate = vi.fn();
    setRuntimeWindow({ closeModal, rememberModalTrigger, navigate });

    closeNoteModalRuntime();
    rememberNoteModalTriggerRuntime();
    navigateAfterNoteChangeRuntime('labs');
    navigateAfterNoteChangeRuntime('');

    expect(closeModal).toHaveBeenCalledTimes(1);
    expect(rememberModalTrigger).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenNthCalledWith(1, 'labs');
    expect(navigate).toHaveBeenNthCalledWith(2, 'dashboard');
  });

  it('tracks delegated action binding', () => {
    const runtime = {};
    setRuntimeWindow(runtime);

    expect(isNoteActionDelegatesBoundRuntime()).toBe(false);
    expect(markNoteActionDelegatesBoundRuntime()).toBe(true);
    expect(isNoteActionDelegatesBoundRuntime()).toBe(true);
  });

  it('uses safe fallbacks when browser runtime hooks are missing', () => {
    delete globalThis.window;

    expect(() => closeNoteModalRuntime()).not.toThrow();
    expect(() => rememberNoteModalTriggerRuntime()).not.toThrow();
    expect(() => navigateAfterNoteChangeRuntime('dashboard')).not.toThrow();
    expect(isNoteActionDelegatesBoundRuntime()).toBe(false);
    expect(markNoteActionDelegatesBoundRuntime()).toBe(false);
  });

  it('keeps note actions module-only behind explicit dashboard callbacks', () => {
    const notesSrc = readFileSync(new URL('../js/notes.js', import.meta.url), 'utf8');
    const runtimeSrc = readFileSync(new URL('../js/notes-runtime.js', import.meta.url), 'utf8');
    const swSrc = readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8');

    expect(notesSrc).toContain("from './notes-runtime.js'");
    expect(notesSrc).toContain("from './dashboard-widget-runtime.js'");
    expect(notesSrc).toContain('configureDashboardNoteActions({ openNoteEditor, deleteNote });');
    expect(notesSrc).not.toContain('exposeNoteEditorRuntime');
    expect(/\bwindow(?:\.|\s*\[)/.test(notesSrc)).toBe(false);
    expect(/\bwindow(?:\.|\s*\[)/.test(runtimeSrc)).toBe(false);
    expect(swSrc).toContain("'/js/notes-runtime.js'");
  });
});
