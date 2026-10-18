// @vitest-environment jsdom
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';

const services = vi.hoisted(() => ({
  trace: [] as string[],
  notify: vi.fn(), close: vi.fn(), open: vi.fn(),
  theme: vi.fn(() => 'dark'), provider: vi.fn(() => 'none'),
  openWindow: vi.fn((_url: string, _target: string, _features: string) => null),
}));
// Isolate only outside services. Controller, delegate, HTML facade, template clone,
// authored controls, unit-label logic and native requestSubmit remain real.
vi.mock('../js/utils.js', () => ({ showNotification: services.notify }));
vi.mock('../js/theme.js', () => ({ getTheme: services.theme }));
vi.mock('../js/api.js', () => ({ getAIProvider: services.provider }));
vi.mock('../js/modal-lifecycle.js', () => ({ closeModalOverlay: services.close, openModalOverlay: services.open }));
vi.mock('../js/utils-runtime.js', () => ({ getAppVersionRuntime: () => '1.0.0', openUtilsRuntimeWindow: services.openWindow }));
vi.mock('../js/state.js', () => ({ state: { unitSystem: 'US', rangeMode: 'both' } }));

const appWindow = window as Window & { __feedbackActionDelegatesBound?: boolean };
let feedback: typeof import('../js/feedback.js');
let priorInstalled: boolean | undefined;
const removeInstalled: (() => void)[] = [];
let container: HTMLDivElement;
let kitOwned: HTMLFormElement[];
let kitObservations: { form: HTMLFormElement; defaultPrevented: boolean }[];

beforeAll(async () => {
  priorInstalled = appWindow.__feedbackActionDelegatesBound;
  delete appWindow.__feedbackActionDelegatesBound;
  const documentRegistration = vi.spyOn(document, 'addEventListener');
  const windowRegistration = vi.spyOn(window, 'addEventListener');
  try {
    feedback = await import('../js/feedback.js'); // Actual module auto-installs its delegate.
    for (const [type, listener, options] of documentRegistration.mock.calls) {
      if (['click', 'submit', 'change', 'input'].includes(type))
        removeInstalled.push(() => document.removeEventListener(type, listener, options));
    }
    for (const [type, listener, options] of windowRegistration.mock.calls) {
      if (type === 'labcharts-profile-switched')
        removeInstalled.push(() => window.removeEventListener(type, listener, options));
    }
  } finally { documentRegistration.mockRestore(); windowRegistration.mockRestore(); }
});
afterAll(() => {
  removeInstalled.forEach(remove => remove());
  if (priorInstalled === undefined) delete appWindow.__feedbackActionDelegatesBound;
  else appWindow.__feedbackActionDelegatesBound = priorInstalled;
  document.body.replaceChildren();
});
beforeEach(() => {
  vi.clearAllMocks(); services.trace.length = 0;
  services.openWindow.mockImplementation(() => { services.trace.push('feedback-open'); return null; });
  container = document.createElement('div');
  container.innerHTML = '<div id="feedback-modal-overlay"><div id="feedback-modal"></div></div>';
  document.body.replaceChildren(container);
  kitOwned = []; kitObservations = [];
  // Reproduce only the maintained Kit boundary: valid same-origin GET is owned
  // by the container unless an earlier owner has already prevented submission.
  // Navigation/FormData are intentionally absent; this test covers event routing.
  container.addEventListener('submit', event => {
    if (!(event.target instanceof HTMLFormElement)) throw new Error('Native form submit target required');
    const form = event.target;
    kitObservations.push({ form, defaultPrevented: event.defaultPrevented });
    if (event.defaultPrevented) { services.trace.push('kit-skipped'); return; }
    if (form.method !== 'get' || new URL(form.action).origin !== new URL(window.location.href).origin) return;
    services.trace.push('kit-owned'); kitOwned.push(form);
    event.preventDefault(); event.stopPropagation();
  });
  feedback.openFeedbackModal(); // Real authored rendering + native clone insertion.
});
function nativeForm(): HTMLFormElement { return container.querySelector<HTMLFormElement>('.feedback-form')!; }
function validFeedback(): HTMLFormElement {
  container.querySelector<HTMLInputElement>('#feedback-title')!.value = 'Native submit';
  container.querySelector<HTMLTextAreaElement>('#feedback-desc')!.value = 'A synthetic meaningful report.';
  return nativeForm();
}

it('submits valid Feedback exactly once before the Kit container can intercept native requestSubmit', () => {
  const form = validFeedback();
  expect(form.checkValidity()).toBe(true);
  expect(form.getAttribute('method')).toBeNull(); expect(form.method).toBe('get');
  expect(form.getAttribute('action')).toBeNull(); expect(form.target).toBe('');
  expect(new URL(form.action).origin).toBe(new URL(window.location.href).origin);
  feedback.installFeedbackActionDelegates(); // Existing idempotence must prevent duplicate actions.
  form.requestSubmit();
  expect(services.trace).toEqual(['feedback-open', 'kit-skipped']);
  expect(kitOwned).toEqual([]);
  expect(kitObservations).toEqual([{ form, defaultPrevented: true }]);
  expect(services.openWindow).toHaveBeenCalledTimes(1);
  expect(services.theme).toHaveBeenCalledTimes(1); expect(services.provider).toHaveBeenCalledTimes(1);
  const [url, target, features] = services.openWindow.mock.calls[0]!;
  expect([target, features]).toEqual(['_blank', 'noopener,noreferrer']);
  const issue = new URL(url);
  expect(issue.origin).toBe('https://github.com');
  expect(issue.searchParams.get('title')).toBe('[Bug] Native submit');
  expect(issue.searchParams.get('body')).toContain('A synthetic meaningful report.');
  expect(container.querySelector<HTMLElement>('#feedback-result')!.hidden).toBe(false);
  expect(container.querySelector<HTMLTextAreaElement>('#feedback-draft')!.value).toBe(issue.searchParams.get('body'));
  expect(services.notify).not.toHaveBeenCalled();
});
it('native required validation prevents invalid Feedback from submitting at either owner', () => {
  const form = nativeForm(), invalid: string[] = [];
  form.addEventListener('invalid', event => invalid.push((event.target as HTMLElement).id), true);
  form.requestSubmit();
  expect(invalid).toEqual(['feedback-title', 'feedback-desc']);
  expect(kitObservations).toEqual([]); expect(kitOwned).toEqual([]);
  expect(services.openWindow).not.toHaveBeenCalled(); expect(services.theme).not.toHaveBeenCalled();
  expect(services.notify).not.toHaveBeenCalled();
  expect(container.querySelector<HTMLElement>('#feedback-result')!.hidden).toBe(true);
});
it('leaves an unrelated native same-origin GET form owned by the Kit container', () => {
  const form = document.createElement('form');
  form.innerHTML = '<input name="unrelated" value="synthetic"><button type="submit">Continue</button>';
  container.append(form);
  form.requestSubmit();
  expect(services.trace).toEqual(['kit-owned']);
  expect(kitOwned).toEqual([form]); expect(kitObservations).toEqual([{ form, defaultPrevented: false }]);
  expect(services.openWindow).not.toHaveBeenCalled(); expect(services.notify).not.toHaveBeenCalled();
});
it('retains click/input/change document-bubble ownership', () => {
  const result = container.querySelector<HTMLElement>('#feedback-result')!;
  const witnesses: { type: string; prevented: boolean; resultHidden: HTMLElement['hidden'] }[] = [];
  for (const type of ['click', 'input', 'change']) container.addEventListener(type, event => {
    witnesses.push({ type: event.type, prevented: event.defaultPrevented, resultHidden: result.hidden });
  });
  result.hidden = false;
  const type = container.querySelector<HTMLSelectElement>('#feedback-type')!;
  type.value = 'feature'; type.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
  expect(witnesses.at(-1)).toEqual({ type: 'change', prevented: false, resultHidden: false });
  expect(result.hidden).toBe(true);
  expect(container.querySelector<HTMLInputElement>('#feedback-title')!.placeholder).toBe('What feature would you like?');
  result.hidden = false;
  container.querySelector<HTMLTextAreaElement>('#feedback-desc')!.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
  expect(witnesses.at(-1)).toEqual({ type: 'input', prevented: false, resultHidden: false });
  expect(result.hidden).toBe(true);
  container.querySelector<HTMLButtonElement>('.modal-close')!.click();
  expect(witnesses.at(-1)).toEqual({ type: 'click', prevented: false, resultHidden: true });
  expect(services.close).toHaveBeenCalledExactlyOnceWith('feedback-modal-overlay');
  expect(services.openWindow).not.toHaveBeenCalled();
});
