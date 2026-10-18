import {beforeEach, expect, it, vi} from 'vitest';

const ports = vi.hoisted(() => ({defaultAI: vi.fn(async () => ({})), notify: vi.fn()}));
vi.mock('../js/ai-feature-routing.js', () => ({callAssistantFeatureAI: ports.defaultAI}));
vi.mock('../js/utils.js', () => ({showNotification: ports.notify}));
beforeEach(() => {vi.resetModules(); ports.defaultAI.mockClear(); ports.notify.mockClear();});

it('configures callbacks before first use without invoking AI or loading an EMF feature', async () => {
  const runtime = await import('../js/emf-interpretation-runtime.js');
  const cold = await import('../js/emf-runtime.js');
  const loadModule = vi.fn(), loadStylesheet = vi.fn(), close = vi.fn(), chat = vi.fn();
  cold.configureEMFRuntimeDeps({loadModule, loadStylesheet});
  const previous = runtime.configureEMFInterpretationRuntimeDeps({closeModal: close, openChatPanel: chat});
  expect(previous).toEqual({callClaudeAPI: ports.defaultAI, closeModal: null, openChatPanel: null});
  expect(runtime.closeEMFInterpretation()).toBeUndefined();
  await expect(cold.closeEMFInterpretation()).resolves.toBeUndefined();
  expect(runtime.getEMFInterpretationRuntimeDeps()).toEqual({callClaudeAPI: ports.defaultAI, closeModal: close, openChatPanel: chat});
  for (const callback of [loadModule, loadStylesheet, close, chat, ports.defaultAI, ports.notify]) expect(callback).not.toHaveBeenCalled();
});

it('retains function-only AI replacement, own-property modal/chat updates and exact previous snapshots', async () => {
  const runtime = await import('../js/emf-interpretation-runtime.js');
  const ai = vi.fn(), close = vi.fn(), chat = vi.fn();
  const defaults = runtime.configureEMFInterpretationRuntimeDeps({callClaudeAPI: ai, closeModal: close, openChatPanel: chat});
  const inheritedAI = vi.fn(), inheritedClose = vi.fn(), inheritedChat = vi.fn();
  const inherited = Object.create({callClaudeAPI: inheritedAI, closeModal: inheritedClose, openChatPanel: inheritedChat}) as object;
  const beforeInherited = runtime.configureEMFInterpretationRuntimeDeps(inherited);
  expect(beforeInherited).toEqual({callClaudeAPI: ai, closeModal: close, openChatPanel: chat});
  expect(runtime.getEMFInterpretationRuntimeDeps()).toEqual({callClaudeAPI: inheritedAI, closeModal: close, openChatPanel: chat});
  const beforeClear = runtime.configureEMFInterpretationRuntimeDeps({callClaudeAPI: null, closeModal: 0, openChatPanel: undefined});
  expect(beforeClear).toEqual({callClaudeAPI: inheritedAI, closeModal: close, openChatPanel: chat});
  expect(runtime.getEMFInterpretationRuntimeDeps()).toEqual({callClaudeAPI: inheritedAI, closeModal: null, openChatPanel: null});
  runtime.configureEMFInterpretationRuntimeDeps(defaults);
  expect(runtime.getEMFInterpretationRuntimeDeps()).toEqual(defaults);
  expect(beforeInherited).toEqual({callClaudeAPI: ai, closeModal: close, openChatPanel: chat});
});

it('preserves getter read order and the original partial update when a later configuration getter throws', async () => {
  const runtime = await import('../js/emf-interpretation-runtime.js');
  const order: string[] = [], ai = vi.fn(), failure = new Error('configuration getter');
  expect(() => runtime.configureEMFInterpretationRuntimeDeps({
    get callClaudeAPI() {order.push('ai'); return ai;},
    get closeModal() {order.push('close'); throw failure;},
    get openChatPanel() {order.push('chat'); return vi.fn();},
  })).toThrow(failure);
  expect(order).toEqual(['ai', 'ai', 'close']);
  expect(runtime.getEMFInterpretationRuntimeDeps()).toEqual({callClaudeAPI: ai, closeModal: null, openChatPanel: null});
});

it('forwards close synchronously to the latest registered owner with unchanged void return and thrown error', async () => {
  const runtime = await import('../js/emf-interpretation-runtime.js');
  const events: string[] = [], failure = new Error('close failure');
  runtime.registerEMFInterpretationCloseHandler(() => {events.push('old');});
  runtime.closeEMFInterpretation();
  runtime.registerEMFInterpretationCloseHandler(() => {events.push('latest'); throw failure;});
  expect(() => runtime.closeEMFInterpretation()).toThrow(failure);
  expect(events).toEqual(['old', 'latest']);
});

it('does not queue a late close behind a pending module load or close a subsequently opened view', async () => {
  const runtime = await import('../js/emf-runtime.js');
  const bridge = await import('../js/emf-interpretation-runtime.js');
  let resolveModule!: (value: import('../js/emf-runtime.js').EMFModule) => void;
  const loading = new Promise<import('../js/emf-runtime.js').EMFModule>(resolve => {resolveModule = resolve;});
  const open = vi.fn(() => 'opened'), close = vi.fn(), configure = vi.fn(), loadModule = vi.fn(() => loading);
  runtime.configureEMFRuntimeDeps({loadModule, loadStylesheet: async () => ({} as HTMLLinkElement)});
  const pending = runtime.openEMFAssessmentEditor();
  await Promise.resolve(); expect(loadModule).toHaveBeenCalledTimes(1);
  await expect(runtime.closeEMFInterpretation()).resolves.toBeUndefined();
  expect(close).not.toHaveBeenCalled();
  bridge.registerEMFInterpretationCloseHandler(close);
  resolveModule({configureEMFRuntimeDeps: configure, openEMFAssessmentEditor: open, closeEMFInterpretation: close});
  await expect(pending).resolves.toBe('opened');
  expect(close).not.toHaveBeenCalled(); expect(open).toHaveBeenCalledTimes(1);
  const result = runtime.closeEMFInterpretation();
  expect(close).toHaveBeenCalledTimes(1); await expect(result).resolves.toBeUndefined();
  expect(loadModule).toHaveBeenCalledTimes(1);
});

it('keeps a retired profile caller from dispatching after load, then permits a new owner without a second load', async () => {
  const runtime = await import('../js/emf-runtime.js');
  let profile = 'first', origin: object = {}, resolve!: (value: import('../js/emf-runtime.js').EMFModule) => void;
  const original = origin, loading = new Promise<import('../js/emf-runtime.js').EMFModule>(done => {resolve = done;});
  const open = vi.fn(() => 'opened'), close = vi.fn(), loadModule = vi.fn(() => loading);
  runtime.configureEMFRuntimeDeps({loadModule, loadStylesheet: async () => ({} as HTMLLinkElement)});
  const old = runtime.openEMFAssessmentEditor({isCurrent: () => profile === 'first' && origin === original});
  profile = 'replacement'; origin = {};
  await runtime.closeEMFInterpretation();
  resolve({configureEMFRuntimeDeps: vi.fn(), openEMFAssessmentEditor: open, closeEMFInterpretation: close});
  await expect(old).resolves.toBe(false); expect(open).not.toHaveBeenCalled(); expect(close).not.toHaveBeenCalled();
  const replacement = {isCurrent: () => profile === 'replacement'};
  await expect(runtime.openEMFAssessmentEditor(replacement)).resolves.toBe('opened');
  expect(open).toHaveBeenCalledExactlyOnceWith(replacement); expect(loadModule).toHaveBeenCalledTimes(1);
});

it('preserves a rejected Promise for errors from a registered loaded close and never retries a cold loader', async () => {
  const runtime = await import('../js/emf-runtime.js');
  const bridge = await import('../js/emf-interpretation-runtime.js');
  const failure = new Error('loaded abort failure'), close = vi.fn(() => {throw failure;}), loadModule = vi.fn();
  runtime.configureEMFRuntimeDeps({loadModule}); bridge.registerEMFInterpretationCloseHandler(close);
  const result = runtime.closeEMFInterpretation();
  expect(close).toHaveBeenCalledTimes(1); await expect(result).rejects.toBe(failure); expect(loadModule).not.toHaveBeenCalled();
});
