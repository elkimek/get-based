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
    const loadStylesheet = vi.fn(async () => {});

    (runtime.configureEMFRuntimeDeps as (deps: Omit<NonNullable<Parameters<typeof runtime.configureEMFRuntimeDeps>[0]>, 'loadStylesheet'> & { loadStylesheet: () => Promise<unknown> }) => ReturnType<typeof runtime.configureEMFRuntimeDeps>)({ closeModal, loadModule, loadStylesheet });

    await expect(runtime.openEMFAssessmentEditor()).resolves.toBe('opened');
    await expect(runtime.closeEMFInterpretation()).resolves.toBe('closed');
    expect(loadModule).toHaveBeenCalledTimes(1);
    expect(loadStylesheet).toHaveBeenCalledTimes(1);
    expect(configureEMFRuntimeDeps).toHaveBeenCalledWith(expect.objectContaining({
      closeModal,
      loadModule,
      loadStylesheet,
    }));
  });
});

it('rejects a retired lazy open before dispatch without loading a module or stylesheet', async () => {
  const runtime = await import('../js/emf-runtime.js'), loadModule = vi.fn(), loadStylesheet = vi.fn();
  runtime.configureEMFRuntimeDeps({ loadModule, loadStylesheet });
  expect(await runtime.openEMFAssessmentEditor({ isCurrent: () => false })).toBe(false);
  expect(loadModule).not.toHaveBeenCalled(); expect(loadStylesheet).not.toHaveBeenCalled();
});
it('retires a delayed open and retains the shared module for a later current caller', async () => {
  const runtime = await import('../js/emf-runtime.js'); let resolve!: (link: HTMLLinkElement) => void, current = true;
  const stylesheet = new Promise<HTMLLinkElement>(done => { resolve = done; });
  const open = vi.fn(() => 'opened'), loadModule = vi.fn(async () => ({ configureEMFRuntimeDeps: vi.fn(), openEMFAssessmentEditor: open, closeEMFInterpretation: vi.fn() }));
  runtime.configureEMFRuntimeDeps({ loadModule, loadStylesheet: () => stylesheet });
  const pending = runtime.openEMFAssessmentEditor({ isCurrent: () => current });
  current = false; resolve({} as HTMLLinkElement);
  expect(await pending).toBe(false); expect(open).not.toHaveBeenCalled();
  expect(await runtime.openEMFAssessmentEditor({ isCurrent: () => true })).toBe('opened'); expect(loadModule).toHaveBeenCalledTimes(1);
});
it('contains an obsolete load failure without notifying the replacement view', async () => {
  const runtime = await import('../js/emf-runtime.js'); let reject!: (error: Error) => void, current = true;
  const failure = new Promise<never>((_, fail) => { reject = fail; });
  runtime.configureEMFRuntimeDeps({ loadModule: () => failure, loadStylesheet: async () => ({} as HTMLLinkElement) });
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  try { const pending = runtime.openEMFAssessmentEditor({ isCurrent: () => current }); current = false; reject(new Error('Obsolete')); expect(await pending).toBe(false); expect(error).not.toHaveBeenCalled(); }
  finally { error.mockRestore(); }
});
