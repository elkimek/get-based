// @vitest-environment jsdom
import {afterAll, afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {
  dismissAnalyticsConsent, dismissAnalyticsConsentAndDisable, isAnalyticsEnabled,
  maybeShowAnalyticsConsent,
} from '../js/utils.js';

const seen = 'labcharts-analytics-consent-seen';
const disabled = 'labcharts-analytics-disabled';
const initialBody = document.body.innerHTML;
const initialClass = document.body.getAttribute('class');
const initialStorage = Array.from({length: localStorage.length}, (_, index) => {
  const key = localStorage.key(index)!;
  return [key, localStorage.getItem(key)!] as const;
});
function banner(): HTMLElement {
  const result = document.getElementById('analytics-consent-banner');
  expect(result).not.toBeNull();
  return result!;
}
function reset(): void {
  dismissAnalyticsConsent();
  localStorage.removeItem(seen);
  localStorage.removeItem(disabled);
  document.body.innerHTML = '<button id="opener">Existing focus</button><div id="notification-container"></div>';
  document.body.className = '';
  document.getElementById('opener')!.focus();
  localStorage.setItem('unrelated-profile', 'unchanged');
}
beforeEach(() => {
  vi.useFakeTimers();
  reset();
});
afterEach(() => {
  dismissAnalyticsConsent();
  expect(localStorage.getItem('unrelated-profile')).toBe('unchanged');
  vi.clearAllTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
afterAll(() => {
  document.body.innerHTML = initialBody;
  if (initialClass === null) document.body.removeAttribute('class');
  else document.body.setAttribute('class', initialClass);
  localStorage.clear();
  for (const [key, value] of initialStorage) localStorage.setItem(key, value);
});

describe('analytics transparency banner public lifecycle', () => {
  it('shows the exact region/actions without changing focus or preferences', () => {
    maybeShowAnalyticsConsent();
    const root = banner();
    expect([...root.attributes].map(attribute => [attribute.name, attribute.value])).toEqual([
      ['id', 'analytics-consent-banner'], ['class', 'analytics-consent-banner'],
      ['role', 'region'], ['aria-label', 'Analytics consent'],
    ]);
    expect(document.activeElement?.id).toBe('opener');
    expect(document.body.classList.contains('analytics-consent-visible')).toBe(true);
    expect([...root.querySelectorAll('button')].map(button => ({
      type: button.type, disabled: button.disabled, action: button.getAttribute('data-analytics-consent-action'), text: button.textContent,
    }))).toEqual([
      {type: 'button', disabled: false, action: 'dismiss', text: 'Got it'},
      {type: 'button', disabled: false, action: 'disable', text: 'Turn off'},
    ]);
    expect(root.querySelectorAll('strong')).toHaveLength(2);
    expect(localStorage.getItem(seen)).toBeNull();
    expect(localStorage.getItem(disabled)).toBeNull();
  });
  it('preserves an existing banner identity, focused button, and single delegated action', () => {
    maybeShowAnalyticsConsent();
    const original = banner();
    const button = original.querySelector<HTMLButtonElement>('button')!;
    button.focus();
    maybeShowAnalyticsConsent();
    expect(banner()).toBe(original);
    expect(document.querySelectorAll('#analytics-consent-banner')).toHaveLength(1);
    expect(document.activeElement).toBe(button);
    const write = vi.spyOn(Storage.prototype, 'setItem');
    button.click();
    expect(write.mock.calls).toEqual([[seen, '1']]);
  });
  it('dismisses through a nested button child, stops bubbling, and retains the opt-out value', () => {
    localStorage.setItem(disabled, 'false');
    maybeShowAnalyticsConsent();
    const button = banner().querySelector<HTMLButtonElement>('button')!;
    const child = document.createElement('span');
    child.textContent = 'nested';
    button.appendChild(child);
    const bubble = vi.fn();
    document.body.addEventListener('click', bubble, {once: true});
    try {
      const event = new MouseEvent('click', {bubbles: true, cancelable: true});
      expect(child.dispatchEvent(event)).toBe(false);
      expect(event.defaultPrevented).toBe(true);
      expect(bubble).not.toHaveBeenCalled();
      expect(localStorage.getItem(seen)).toBe('1');
      expect(localStorage.getItem(disabled)).toBe('false');
      expect(document.getElementById('analytics-consent-banner')).toBeNull();
      expect(document.body.classList.contains('analytics-consent-visible')).toBe(false);
    } finally { document.body.removeEventListener('click', bubble); }
  });
  it('disables before marking seen, then removes the region and creates the exact timed notice', () => {
    maybeShowAnalyticsConsent();
    const write = vi.spyOn(Storage.prototype, 'setItem');
    banner().querySelector<HTMLButtonElement>('[data-analytics-consent-action="disable"]')!.click();
    expect(write.mock.calls).toEqual([[disabled, 'true'], [seen, '1']]);
    expect(isAnalyticsEnabled()).toBe(false);
    expect(document.getElementById('analytics-consent-banner')).toBeNull();
    expect(document.body.classList.contains('analytics-consent-visible')).toBe(false);
    const notice = document.querySelector<HTMLElement>('.notification-toast')!;
    expect(notice.className).toBe('notification-toast info');
    expect(notice.textContent).toBe('ℹ Cookieless usage stats turned off. You can change this anytime in Settings → Privacy.');
    vi.advanceTimersByTime(3999);
    expect(notice.style.opacity).toBe('');
    vi.advanceTimersByTime(1);
    expect(notice.style.opacity).toBe('0');
    vi.advanceTimersByTime(300);
    expect(notice.isConnected).toBe(false);
  });
  it('leaves unknown delegated actions untouched and does not suppress their event', () => {
    maybeShowAnalyticsConsent();
    const original = banner();
    const button = original.querySelector<HTMLButtonElement>('button')!;
    button.setAttribute('data-analytics-consent-action', 'unknown');
    const event = new MouseEvent('click', {bubbles: true, cancelable: true});
    expect(button.dispatchEvent(event)).toBe(true);
    expect(event.defaultPrevented).toBe(false);
    expect(banner()).toBe(original);
    expect(localStorage.getItem(seen)).toBeNull();
    expect(localStorage.getItem(disabled)).toBeNull();
  });
  it('does not treat prior opt-out as prior seen consent', () => {
    localStorage.setItem(disabled, 'true');
    maybeShowAnalyticsConsent();
    expect(banner().querySelector('[data-analytics-consent-action="disable"]')).not.toBeNull();
    expect(isAnalyticsEnabled()).toBe(false);
  });
  it('requires the literal seen value 1 and skips blockers once seen', () => {
    localStorage.setItem(seen, 'true');
    maybeShowAnalyticsConsent();
    expect(banner()).not.toBeNull();
    dismissAnalyticsConsent();
    const read = vi.spyOn(document, 'querySelectorAll');
    maybeShowAnalyticsConsent();
    expect(read).not.toHaveBeenCalled();
    expect(document.getElementById('analytics-consent-banner')).toBeNull();
  });
  it.each([
    ['legal-consent-overlay', ''], ['modal', 'modal-overlay show'], ['confirm', 'confirm-overlay show'],
    ['chat', 'chat-backdrop open'], ['tour-overlay', ''],
  ])('defers behind %s with one retry, then shows only after the blocker is gone', (id, className) => {
    const scheduled = vi.spyOn(globalThis, 'setTimeout');
    const blocker = document.createElement('div');
    blocker.id = id;
    blocker.className = className;
    blocker.style.position = 'fixed';
    document.body.appendChild(blocker);
    maybeShowAnalyticsConsent();
    maybeShowAnalyticsConsent();
    expect(scheduled.mock.calls.filter(([, delay]) => delay === 1200)).toHaveLength(1);
    expect(document.getElementById('analytics-consent-banner')).toBeNull();
    vi.advanceTimersByTime(1199);
    expect(document.getElementById('analytics-consent-banner')).toBeNull();
    blocker.remove();
    vi.advanceTimersByTime(1);
    const shown = banner();
    expect(scheduled.mock.calls.filter(([, delay]) => delay === 1200)).toHaveLength(1);
    vi.advanceTimersByTime(1200);
    expect(banner()).toBe(shown);
    expect(scheduled.mock.calls.filter(([, delay]) => delay === 1200)).toHaveLength(1);
  });
  it('ignores hidden blockers and cancels a pending retry before direct show', () => {
    const scheduled = vi.spyOn(globalThis, 'setTimeout');
    const cancelled = vi.spyOn(globalThis, 'clearTimeout');
    const blocker = document.createElement('div');
    blocker.className = 'modal-overlay show';
    blocker.style.position = 'fixed';
    document.body.appendChild(blocker);
    maybeShowAnalyticsConsent();
    expect(scheduled.mock.calls.filter(([, delay]) => delay === 1200)).toHaveLength(1);
    const retryIndex = scheduled.mock.calls.findIndex(([, delay]) => delay === 1200);
    const retryHandle = scheduled.mock.results[retryIndex]!.value;
    expect(retryHandle).toBeDefined();
    blocker.style.display = 'none';
    maybeShowAnalyticsConsent();
    expect(banner()).not.toBeNull();
    expect(cancelled).toHaveBeenCalledWith(retryHandle);
    expect(scheduled.mock.calls.filter(([, delay]) => delay === 1200)).toHaveLength(1);
  });
  it.each([
    {protocol: 'file:', hostname: ''}, {protocol: 'http:', hostname: 'example.onion'},
  ])('marks the $protocol/$hostname export seen without rendering', location => {
    const scheduled = vi.spyOn(globalThis, 'setTimeout');
    vi.stubGlobal('location', location);
    maybeShowAnalyticsConsent();
    expect(localStorage.getItem(seen)).toBe('1');
    expect(localStorage.getItem(disabled)).toBeNull();
    expect(document.getElementById('analytics-consent-banner')).toBeNull();
    expect(scheduled.mock.calls.filter(([, delay]) => delay === 1200)).toHaveLength(0);
  });
  it('retains atomic failure ordering if disabling storage throws', () => {
    maybeShowAnalyticsConsent();
    const original = banner();
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked storage'); });
    expect(() => dismissAnalyticsConsentAndDisable()).toThrow('blocked storage');
    expect(write.mock.calls).toEqual([[disabled, 'true']]);
    expect(localStorage.getItem(seen)).toBeNull();
    expect(banner()).toBe(original);
    expect(document.querySelector('.notification-toast')).toBeNull();
    write.mockRestore();
  });
});
