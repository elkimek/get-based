import { beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
});

describe('EMF lazy runtime', () => {
  it('fails clearly until the composition root provides a module loader', async () => {
    const runtime = await import('../js/emf-runtime.js');

    await expect(runtime.loadEMFModule()).rejects.toThrow('EMF module loader is not configured.');
  });

  it('loads once and forwards shell dependencies to the EMF module', async () => {
    const runtime = await import('../js/emf-runtime.js');
    const configureEMFRuntimeDeps = vi.fn();
    const openEMFAssessmentEditor = vi.fn(() => 'opened');
    const closeEMFInterpretation = vi.fn(() => 'closed');
    const loadModule = vi.fn(async () => ({
      configureEMFRuntimeDeps,
      openEMFAssessmentEditor,
      closeEMFInterpretation,
    }));
    const closeModal = vi.fn();

    runtime.configureEMFRuntimeDeps({ closeModal, loadModule });

    await expect(runtime.openEMFAssessmentEditor()).resolves.toBe('opened');
    await expect(runtime.closeEMFInterpretation()).resolves.toBe('closed');
    expect(loadModule).toHaveBeenCalledTimes(1);
    expect(configureEMFRuntimeDeps).toHaveBeenCalledWith(expect.objectContaining({ closeModal, loadModule }));
  });
});
