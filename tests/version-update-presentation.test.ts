// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UpdateContainerView } from '../js/service-worker-update.js';

let update: typeof import('../js/service-worker-update.js');
beforeEach(async () => {
  vi.resetModules();
  update = await import('../js/service-worker-update.js');
});
afterEach(() => {
  update.hideVersionUpdateBanner();
  vi.restoreAllMocks();
  vi.resetModules();
});
function banner(): HTMLElement {
  const element = document.getElementById('version-update-banner');
  expect(element).not.toBeNull();
  return element!;
}
function action(root: HTMLElement, name: 'apply' | 'dismiss'): HTMLButtonElement {
  const element = root.querySelector<HTMLButtonElement>(`[data-version-update-action="${name}"]`);
  expect(element).not.toBeNull();
  return element!;
}

describe('authored update fragments through the public controller', () => {
  it('keeps native region attributes, explicit non-submit buttons and waiting copy', () => {
    const waiting = { postMessage: vi.fn() };
    expect(update.showVersionUpdateBanner({ waiting })).toBe(true);
    const root = banner();
    expect(Array.from(root.attributes, ({ name, value }) => [name, value])).toEqual([
      ['id', 'version-update-banner'], ['class', 'version-update-banner'],
      ['role', 'region'], ['aria-label', 'App update available'],
      ['aria-live', 'polite'], ['aria-busy', 'false'],
    ]);
    expect(root.querySelector('.version-update-copy')!.textContent)
      .toBe('Update ready. Reload when you are ready.');
    expect(root.querySelectorAll('strong')).toHaveLength(1);
    expect(Array.from(root.querySelectorAll('button'), button => [button.type, button.disabled, button.textContent]))
      .toEqual([['button', false, 'Reload'], ['button', false, 'Later']]);
    expect(root.querySelector('.version-update-copy-short')).toBeNull();
    expect(waiting.postMessage).not.toHaveBeenCalled();
  });

  it('reuses the banner and focused buttons when rendering a waiting prompt again', () => {
    const registration = { waiting: { postMessage: vi.fn() } };
    update.showVersionUpdateBanner(registration);
    const root = banner();
    const reload = action(root, 'apply');
    const later = action(root, 'dismiss');
    const localListener = vi.fn();
    later.addEventListener('click', localListener);
    later.focus();
    expect(update.showVersionUpdateBanner(registration)).toBe(true);
    expect(banner()).toBe(root);
    expect(action(root, 'apply')).toBe(reload);
    expect(action(root, 'dismiss')).toBe(later);
    expect(document.activeElement).toBe(later);
    later.click();
    expect(localListener).toHaveBeenCalledTimes(1);
    expect(registration.waiting.postMessage).not.toHaveBeenCalled();
  });

  it('suppresses only the dismissed worker identity and offers a distinct waiting worker', () => {
    const first = { postMessage: vi.fn() };
    const second = { postMessage: vi.fn() };
    update.showVersionUpdateBanner({ waiting: first });
    action(banner(), 'dismiss').click();
    expect(update.showVersionUpdateBanner({ waiting: first })).toBe(false);
    expect(update.showVersionUpdateBanner({ waiting: second })).toBe(true);
    expect(first.postMessage).not.toHaveBeenCalled();
    expect(second.postMessage).not.toHaveBeenCalled();
  });

  it('retains nested action delegation, default prevention and bubbling for an unknown action', () => {
    const waiting = { postMessage: vi.fn() };
    update.showVersionUpdateBanner({ waiting });
    const root = banner();
    const unknown = document.createElement('button');
    unknown.setAttribute('data-version-update-action', 'unknown');
    const child = document.createElement('span');
    unknown.appendChild(child);
    root.appendChild(unknown);
    const received: boolean[] = [];
    const listener = (event: Event) => received.push(event.defaultPrevented);
    document.body.addEventListener('click', listener);
    try {
      const event = new MouseEvent('click', { bubbles: true, cancelable: true });
      expect(child.dispatchEvent(event)).toBe(false);
      expect(received).toEqual([true]);
      expect(banner()).toBe(root);
      expect(waiting.postMessage).not.toHaveBeenCalled();
    } finally {
      document.body.removeEventListener('click', listener);
    }
  });

  it('retains the same accessible banner with a usable retry when activation messaging fails', () => {
    const failure = new Error('activation failed');
    const waiting = { postMessage: vi.fn(() => { throw failure; }) };
    const registration = { waiting };
    update.showVersionUpdateBanner(registration);
    const root = banner();
    expect(update.applyPendingServiceWorkerUpdate(registration)).toBe(false);
    expect(root.getAttribute('aria-busy')).toBe('false');
    expect(root.getAttribute('aria-label')).toBe('App update needs attention');
    expect(root.textContent).toContain('The update could not start.');
    const retry = root.querySelector<HTMLButtonElement>('[data-version-update-action="apply"]')!;
    expect(retry.textContent).toBe('Retry update');
    expect(retry.disabled).toBe(false);
    expect(waiting.postMessage).toHaveBeenCalledExactlyOnceWith({ type: 'SKIP_WAITING' });
    expect(banner()).toBe(root);
    expect(document.body.classList.contains('version-update-visible')).toBe(true);
  });

  it('changes only copy and ready label on replacement, retaining focused buttons until user reload', async () => {
    const waiting = { postMessage: vi.fn() };
    const registration = { waiting, addEventListener: vi.fn() };
    let changed: (() => void) | undefined;
    const container: UpdateContainerView = {
      controller: {},
      register: vi.fn(async () => registration),
      addEventListener: vi.fn((type: unknown, listener: unknown) => {
        if (type === 'controllerchange') changed = listener as () => void;
      }),
    };
    const reload = vi.fn();
    await update.registerServiceWorkerUpdates({
      win: { location: { hostname: 'getbased.health', search: '', reload } },
      serviceWorkerContainer: container, cacheStorage: null,
    });
    const root = banner();
    const button = action(root, 'apply');
    const later = action(root, 'dismiss');
    button.focus();
    expect(changed).toBeDefined();
    container.controller = {};
    changed!();
    expect(banner()).toBe(root);
    expect(action(root, 'apply')).toBe(button);
    expect(action(root, 'dismiss')).toBe(later);
    expect(document.activeElement).toBe(button);
    expect(root.getAttribute('aria-label')).toBe('App update ready to reload');
    expect(root.querySelector('.version-update-copy')!.textContent)
      .toBe('New version installed. Reload when you are ready.');
    expect(reload).not.toHaveBeenCalled();
    expect(waiting.postMessage).not.toHaveBeenCalled();
    button.click();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(waiting.postMessage).not.toHaveBeenCalled();
    expect(document.getElementById('version-update-banner')).toBeNull();
  });
});
