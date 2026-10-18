// @vitest-environment jsdom
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import type {AssistantFeatureRequestOptions} from '../js/ai-feature-routing.js';

const ports = vi.hoisted(() => ({
  state: {currentProfile: 'emf-test', importedData: {} as object},
  ai: vi.fn<(options: AssistantFeatureRequestOptions) => Promise<unknown>>(),
  save: vi.fn(), usage: vi.fn(),
}));
vi.mock('../js/state.js', () => ({state: ports.state}));
vi.mock('../js/ai-feature-routing.js', () => ({
  callAssistantFeatureAI: ports.ai,
  getAssistantFeatureIdentity: () => ({provider: 'fixture', modelId: 'fixture-model', modelDisplay: 'Fixture model', subscription: false}),
}));
vi.mock('../js/schema.js', () => ({SBM_2015_THRESHOLDS: {}, getEMFSeverity: () => null, calculateCost: () => 0, formatCost: () => '$0', trackUsage: ports.usage}));
vi.mock('../js/data.js', () => ({saveImportedData: ports.save}));
vi.mock('../js/health-data-loader.js', () => ({detectMitigationsInText: () => [], isProductRecsEnabled: () => false, loadEMFCatalog: vi.fn(), renderEMFMitigationRecs: vi.fn()}));

beforeEach(() => {
  vi.resetModules(); vi.useFakeTimers(); ports.ai.mockReset(); ports.save.mockReset(); ports.usage.mockReset();
  ports.state.currentProfile = 'emf-test'; ports.state.importedData = {};
  document.body.innerHTML = '<button id="trigger">Interpret assessment</button><button id="replacement-focus">Replacement owner</button>';
});
afterEach(async () => {
  (await import('../js/emf-interpretation-runtime.js')).closeEMFInterpretation();
  await Promise.resolve(); vi.clearAllTimers(); vi.useRealTimers(); document.body.innerHTML = '';
});

function heldResponse() {
  let resolve!: (value: unknown) => void, reject!: (error: unknown) => void;
  const promise = new Promise<unknown>((yes, no) => {resolve = yes; reject = no;});
  return {promise, resolve, reject};
}
function assessment() {return {id: 'one', date: '2026-10-16', rooms: [], interpretation: undefined as unknown};}
async function open() {
  const owner = await import('../js/emf-interpretation.js');
  const bridge = await import('../js/emf-interpretation-runtime.js');
  const value = assessment();
  document.getElementById('trigger')!.focus();
  owner.interpretEMFAssessment('one', {getAssessments: () => [value]});
  const overlay = document.getElementById('emf-interp-overlay')!;
  const body = document.getElementById('emf-interp-body')!;
  const generate = document.getElementById('emf-interp-generate') as HTMLButtonElement;
  return {owner, bridge, value, overlay, body, generate};
}
async function settle() {await Promise.resolve(); await Promise.resolve(); await Promise.resolve();}
const response = {text: '## Accepted interpretation', usage: {inputTokens: 8, outputTokens: 3}};

it('keeps preloaded configuration, cached interpretation, parent close then chat handoff and public binding identity', async () => {
  const bridge = await import('../js/emf-interpretation-runtime.js');
  const order: unknown[] = [], close = () => {order.push(['parent', document.getElementById('emf-interp-overlay')]);}, chat = (message: string) => {order.push(['chat', message]);};
  bridge.configureEMFInterpretationRuntimeDeps({closeModal: close, openChatPanel: chat});
  const owner = await import('../js/emf-interpretation.js');
  expect(owner.configureEMFInterpretationRuntimeDeps).toBe(bridge.configureEMFInterpretationRuntimeDeps);
  owner.interpretEMFAssessment('one', {getAssessments: () => [{...assessment(), interpretation: {text: 'Saved result'}}]});
  expect(document.getElementById('emf-interp-body')!.textContent).toContain('Saved result');
  owner.discussEMFInterpretation();
  expect(order).toEqual([['parent', null], ['chat', "I'd like to discuss this EMF assessment interpretation further. Here's the interpretation:\n\nSaved result\n\nWhat questions should I prioritize, and what are the most important next steps?"]]);
  expect(ports.ai).not.toHaveBeenCalled(); expect(ports.save).not.toHaveBeenCalled();
});

it('aborts the actual loaded request and restores focus in the same turn, ignoring transport completion after close', async () => {
  const pending = heldResponse(); ports.ai.mockReturnValueOnce(pending.promise);
  const opened = await open(); opened.generate.click();
  const options = ports.ai.mock.calls[0]![0], signal = options.signal!;
  expect(signal.aborted).toBe(false); expect(document.body.style.overflow).toBe('hidden');
  opened.generate.focus();
  expect(opened.bridge.closeEMFInterpretation()).toBeUndefined();
  expect(signal.aborted).toBe(true); expect(opened.overlay.isConnected).toBe(false);
  expect(document.activeElement).toBe(document.getElementById('trigger'));
  const closedBody = opened.body.innerHTML;
  options.onStream?.('Late stream must be ignored'); pending.resolve(response); await settle();
  expect(opened.body.innerHTML).toBe(closedBody); expect(opened.value.interpretation).toBeUndefined();
  expect(ports.save).not.toHaveBeenCalled(); expect(ports.usage).not.toHaveBeenCalled();
  await Promise.resolve(); expect(document.body.style.overflow).toBe('');
});

it('does not let an older aborted completion publish or clear the newer request controller', async () => {
  const first = heldResponse(), second = heldResponse(); ports.ai.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  const opened = await open(); opened.generate.click(); const firstOptions = ports.ai.mock.calls[0]![0];
  // Exercise the retained owner callback twice against the very same body, so
  // node identity alone cannot hide a missing request-generation guard.
  const regenerate = (opened.overlay as import('../types/emf-interpretation.js').InterpretationOverlay)._onGenerate as () => unknown;
  regenerate();
  const currentBody = document.getElementById('emf-interp-body')!, secondOptions = ports.ai.mock.calls[1]![0];
  expect(firstOptions.signal!.aborted).toBe(true); expect(secondOptions.signal!.aborted).toBe(false);
  const currentHTML = currentBody.innerHTML;
  firstOptions.onStream?.('Old stream'); first.resolve({text: 'Wrong old result'}); await settle();
  expect(currentBody.innerHTML).toBe(currentHTML); expect(opened.value.interpretation).toBeUndefined(); expect(ports.save).not.toHaveBeenCalled();
  opened.bridge.closeEMFInterpretation(); expect(secondOptions.signal!.aborted).toBe(true);
  second.resolve(response); await settle(); expect(ports.save).not.toHaveBeenCalled(); expect(ports.usage).not.toHaveBeenCalled();
});

it.each(['profile', 'data', 'body', 'overlay'] as const)('rejects streamed text, completion and persistence after %s ownership changes', async kind => {
  const pending = heldResponse(); ports.ai.mockReturnValueOnce(pending.promise); const opened = await open(); opened.generate.click();
  const options = ports.ai.mock.calls[0]![0];
  if (kind === 'profile') ports.state.currentProfile = 'another-profile';
  if (kind === 'data') ports.state.importedData = {};
  if (kind === 'body') opened.body.replaceWith(opened.body.cloneNode(true));
  if (kind === 'overlay') opened.overlay.replaceWith(opened.overlay.cloneNode(true));
  // Let the native removed-overlay focus trap retire before the replacement owner takes focus.
  await Promise.resolve();
  const before = document.body.innerHTML, ownedBefore = opened.body.innerHTML;
  document.getElementById('replacement-focus')!.focus();
  options.onStream?.('Wrong profile stream'); pending.resolve(response); await settle();
  expect(document.body.innerHTML).toBe(before); expect(opened.body.innerHTML).toBe(ownedBefore);
  expect(document.activeElement).toBe(document.getElementById('replacement-focus'));
  expect(opened.value.interpretation).toBeUndefined(); expect(ports.save).not.toHaveBeenCalled(); expect(ports.usage).not.toHaveBeenCalled();
});

it('keeps current-owner stream rendering, usage, saved interpretation and configured API dispatch', async () => {
  const pending = heldResponse(), custom = vi.fn(() => pending.promise), order: string[] = [];
  const bridge = await import('../js/emf-interpretation-runtime.js'); bridge.configureEMFInterpretationRuntimeDeps({callClaudeAPI: custom});
  ports.usage.mockImplementation(() => {order.push('usage');}); ports.save.mockImplementation(() => {order.push('save');});
  const opened = await open(); opened.generate.click(); expect(ports.ai).not.toHaveBeenCalled(); expect(custom).toHaveBeenCalledTimes(1);
  const options = custom.mock.calls[0] as unknown as [AssistantFeatureRequestOptions];
  options[0].onStream?.('## Current stream'); expect(opened.body.textContent).toContain('Current stream');
  pending.resolve(response); await settle();
  expect(opened.body.textContent).toContain('Accepted interpretation'); expect(order).toEqual(['usage', 'save']);
  expect(opened.value.interpretation).toEqual(expect.objectContaining({text: response.text, provider: 'fixture', modelId: 'fixture-model', inputTokens: 8, outputTokens: 3}));
  expect(document.getElementById('emf-interp-generate')!.textContent).toBe('Re-interpret');
  expect(opened.overlay.querySelector('[data-emf-interp-action="discuss"]')).not.toBeNull();
});

it.each(['AI features are paused.', 'Cloud AI consent declined.'])('keeps routing failures visible for a current owner: %s', async message => {
  ports.ai.mockRejectedValueOnce(new Error(message)); const opened = await open(); opened.generate.click(); await settle();
  expect(ports.ai).toHaveBeenCalledTimes(1); expect(opened.body.textContent).toBe('Error: ' + message);
  expect(opened.generate.disabled).toBe(false); expect(opened.generate.textContent).toBe('Retry');
  expect(ports.save).not.toHaveBeenCalled(); expect(ports.usage).not.toHaveBeenCalled();
});

it('does not replace a newer body with a stale transport failure', async () => {
  const pending = heldResponse(); ports.ai.mockReturnValueOnce(pending.promise); const opened = await open(); opened.generate.click();
  opened.owner.interpretEMFAssessment('one', {getAssessments: () => [opened.value]});
  const replacement = document.getElementById('emf-interp-body')!, before = replacement.innerHTML;
  pending.reject(new Error('Retired transport error')); await settle();
  expect(replacement.innerHTML).toBe(before); expect(document.getElementById('emf-interp-generate')!.textContent).toBe('Interpret');
  expect(ports.save).not.toHaveBeenCalled();
});

it('preserves current-owner completion errors instead of hiding them after releasing the controller', async () => {
  const pending = heldResponse(); ports.ai.mockReturnValueOnce(pending.promise);
  const failure = new Error('Persistence failure'); ports.save.mockImplementationOnce(() => {throw failure;});
  const opened = await open(); opened.generate.click(); pending.resolve(response); await settle();
  expect(ports.save).toHaveBeenCalledTimes(1); expect(ports.usage).toHaveBeenCalledTimes(1);
  expect(opened.value.interpretation).toEqual(expect.objectContaining({text: response.text}));
  expect(opened.body.textContent).toBe('Error: Persistence failure'); expect(opened.generate.textContent).toBe('Retry');
});

for (const retirement of ['closed', 'reopened', 'profile', 'data', 'body', 'overlay'] as const) {
  it(`retained generation and handoff reject ${retirement}, while Close honors the current actual modal owner`, async () => {
    const opened = await open();
    opened.value.interpretation = {text: 'Saved owner interpretation'};
    opened.owner.interpretEMFAssessment('one', {getAssessments: () => [opened.value]});
    const overlay = document.getElementById('emf-interp-overlay') as import('../types/emf-interpretation.js').InterpretationOverlay;
    const generate = overlay.querySelector<HTMLButtonElement>('[data-emf-interp-action="generate"]')!;
    const close = overlay.querySelector<HTMLButtonElement>('[data-emf-interp-action="close"]')!;
    const discuss = overlay.querySelector<HTMLButtonElement>('[data-emf-interp-action="discuss"]')!;
    const originalGenerate = overlay._onGenerate as () => unknown;
    const parent = vi.fn(), chat = vi.fn();
    opened.bridge.configureEMFInterpretationRuntimeDeps({closeModal: parent, openChatPanel: chat});
    if (retirement === 'closed' || retirement === 'reopened') opened.bridge.closeEMFInterpretation();
    if (retirement === 'reopened') opened.owner.interpretEMFAssessment('one', {getAssessments: () => [opened.value]});
    if (retirement === 'profile') ports.state.currentProfile = 'replacement';
    if (retirement === 'data') ports.state.importedData = {};
    if (retirement === 'body') document.getElementById('emf-interp-body')!.replaceWith(document.getElementById('emf-interp-body')!.cloneNode(true));
    if (retirement === 'overlay') overlay.replaceWith(overlay.cloneNode(true));
    await Promise.resolve();
    const before = document.body.innerHTML, generateText = generate.textContent;
    generate.click(); originalGenerate(); discuss.click();
    expect(ports.ai).not.toHaveBeenCalled(); expect(ports.save).not.toHaveBeenCalled(); expect(ports.usage).not.toHaveBeenCalled();
    expect(parent).not.toHaveBeenCalled(); expect(chat).not.toHaveBeenCalled();
    expect(generate.disabled).toBe(false); expect(generate.textContent).toBe(generateText);
    expect(document.body.innerHTML).toBe(before);
    close.click();
    if (retirement === 'profile' || retirement === 'data' || retirement === 'body') {
      // The current visible modal remains dismissible after its data owner retires.
      expect(document.getElementById('emf-interp-overlay')).toBeNull();
    } else expect(document.body.innerHTML).toBe(before);
    expect(parent).not.toHaveBeenCalled(); expect(chat).not.toHaveBeenCalled();
    expect(ports.ai).not.toHaveBeenCalled(); expect(ports.save).not.toHaveBeenCalled();
  });
}

it('a direct Discuss call rejects an open whose profile or body has retired before any handoff', async () => {
  const opened = await open(), parent = vi.fn(), chat = vi.fn();
  opened.value.interpretation = {text: 'Original saved interpretation'};
  opened.owner.interpretEMFAssessment('one', {getAssessments: () => [opened.value]});
  opened.bridge.configureEMFInterpretationRuntimeDeps({closeModal: parent, openChatPanel: chat});
  ports.state.currentProfile = 'replacement'; const before = document.body.innerHTML;
  opened.owner.discussEMFInterpretation();
  expect(parent).not.toHaveBeenCalled(); expect(chat).not.toHaveBeenCalled(); expect(document.body.innerHTML).toBe(before);
});
