import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  closeNoteModalRuntime,
  configureNotesRuntimeDeps,
  navigateAfterNoteChangeRuntime,
  rememberNoteModalTriggerRuntime,
} from '../js/notes-runtime.js';

afterEach(() => {
  configureNotesRuntimeDeps({
    closeModal: null,
    navigate: null,
    rememberModalTrigger: null,
  });
});

describe('notes runtime adapter', () => {
  it('delegates modal focus, close, and navigation hooks', () => {
    const closeModal = vi.fn();
    const rememberModalTrigger = vi.fn();
    const navigate = vi.fn();
    configureNotesRuntimeDeps({ closeModal, rememberModalTrigger, navigate });

    closeNoteModalRuntime();
    rememberNoteModalTriggerRuntime();
    navigateAfterNoteChangeRuntime('labs');
    navigateAfterNoteChangeRuntime('');

    expect(closeModal).toHaveBeenCalledTimes(1);
    expect(rememberModalTrigger).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenNthCalledWith(1, 'labs');
    expect(navigate).toHaveBeenNthCalledWith(2, 'dashboard');
  });

  it('returns the previous dependencies for scoped configuration', () => {
    const closeModal = vi.fn();
    const previous = configureNotesRuntimeDeps({ closeModal });
    const configured = configureNotesRuntimeDeps(previous);

    expect(previous).toEqual({ closeModal: null, rememberModalTrigger: null, navigate: null });
    expect(configured.closeModal).toBe(closeModal);
  });

  it('uses safe fallbacks when application callbacks are missing', () => {
    configureNotesRuntimeDeps({ closeModal: null, navigate: null, rememberModalTrigger: null });

    expect(() => closeNoteModalRuntime()).not.toThrow();
    expect(() => rememberNoteModalTriggerRuntime()).not.toThrow();
    expect(() => navigateAfterNoteChangeRuntime('dashboard')).not.toThrow();
  });

  it('keeps note actions module-only behind explicit dashboard callbacks', () => {
    const notesSrc = readFileSync(new URL('../js/notes.js', import.meta.url), 'utf8');
    const runtimeSrc = readFileSync(new URL('../js/notes-runtime.js', import.meta.url), 'utf8');
    const appShellHooksSrc = readFileSync(new URL('../js/app-shell-hooks.js', import.meta.url), 'utf8');
    const swSrc = readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8');

    expect(notesSrc).toContain("from './notes-runtime.js'");
    expect(notesSrc).toContain("from './dashboard-widget-runtime.js'");
    expect(notesSrc).toContain('configureDashboardNoteActions({ openNoteEditor, deleteNote });');
    expect(notesSrc).not.toContain('exposeNoteEditorRuntime');
    expect(notesSrc).not.toContain('isNoteActionDelegatesBoundRuntime');
    expect(notesSrc).not.toContain('markNoteActionDelegatesBoundRuntime');
    expect(/\bwindow(?:\.|\s*\[)/.test(notesSrc)).toBe(false);
    expect(/\bwindow(?:\.|\s*\[)/.test(runtimeSrc)).toBe(false);
    expect(runtimeSrc).not.toContain("from './views-runtime-bridge.js'");
    expect(runtimeSrc).not.toContain('getViewRuntimeFunction');
    expect(runtimeSrc).toContain('export function configureNotesRuntimeDeps(deps = {})');
    expect(appShellHooksSrc).toContain("import { configureNotesRuntimeDeps } from './notes-runtime.js';");
    expect(appShellHooksSrc).toContain('configureNotesRuntimeDeps({ closeModal, navigate, rememberModalTrigger });');
    expect(swSrc).toContain("'/js/notes-runtime.js'");
  });
});
