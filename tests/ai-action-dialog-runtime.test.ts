// @vitest-environment jsdom
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { AiDialogContent } from '../js/ai-action-dialog-contract.js';
const runtime = vi.hoisted(() => ({ styles: vi.fn() }));
vi.mock('../js/settings-styles.js', () => ({ loadSettingsStylesheet: runtime.styles }));
const { showAiActionDialog } = await import('../js/ai-action-dialog-component.js');
const { trapModalFocus } = await import('../js/modal-lifecycle.js');
const content: AiDialogContent = {
  overlayId: 'ai-needed-overlay', ariaLabel: 'Import notice', title: 'Reading a report', description: 'Choose a route',
  options: [{ id: 'ai-needed-or', label: 'Connect', description: 'A route', icon: '💳', recommended: true },
    { id: 'ai-needed-key', label: 'Existing key', description: 'Another route', icon: '🔑' }], cancelId: 'ai-needed-cancel',
};
function button(id: string): HTMLButtonElement {
  const element = document.getElementById(id);
  if (!(element instanceof HTMLButtonElement)) throw new Error(`Missing ${id}`);
  return element;
}
function deferred() { let resolve!: () => void, reject!: (error: Error) => void; const promise = new Promise<void>((accept,fail) => { resolve=accept;reject=fail; }); return { promise,resolve,reject }; }
async function mutations() { await Promise.resolve(); await Promise.resolve(); }
function overlay() { return document.getElementById(content.overlayId)!; }
function opener() { const element = document.createElement('button'); element.textContent='Import';document.body.appendChild(element);element.focus();return element; }
describe('owned actionable AI dialog', () => {
  beforeEach(() => { document.body.replaceChildren(); document.body.style.overflow='auto'; vi.useFakeTimers(); vi.clearAllMocks();runtime.styles.mockResolvedValue(document.createElement('link')); });
  afterEach(async () => { document.body.replaceChildren();await mutations();vi.useRealTimers(); });
  it('mounts synchronously, escapes text and runs one captured action after close', () => {
    const launch = opener(), action = vi.fn(() => { expect(overlay().classList.contains('show')).toBe(false);expect(launch).toBe(document.activeElement); });
    showAiActionDialog({ ...content,title:'<img src=x onerror=alert(1)>',options:[{ ...content.options[0]!,label:'<b>Literal</b>' }] },action);
    expect(overlay().textContent).toContain('<img');expect(overlay().querySelector('img,b')).toBeNull();expect(document.body.style.overflow).toBe('hidden');
    const oldButton=button('ai-needed-or');oldButton.click();oldButton.click();
    expect(action).toHaveBeenCalledExactlyOnceWith('ai-needed-or');expect(document.body.style.overflow).toBe('auto');expect(overlay().children).toHaveLength(0);
  });
  it('preserves overlay identity but retired controls cannot close or act on a replacement', () => {
    const oldAction=vi.fn(),newAction=vi.fn();showAiActionDialog(content,oldAction);const host=overlay(),retired=button('ai-needed-or');
    showAiActionDialog({ ...content,title:'New request' },newAction);retired.click();
    expect(overlay()).toBe(host);expect(host.textContent).toContain('New request');expect(oldAction).not.toHaveBeenCalled();expect(newAction).not.toHaveBeenCalled();
    button('ai-needed-or').click();expect(newAction).toHaveBeenCalledOnce();
  });
  it('traps keyboard traversal, restores focus on Escape and cancels pending focus', () => {
    const launch=opener(),action=vi.fn();showAiActionDialog(content,action);vi.advanceTimersByTime(50);expect(button('ai-needed-or')).toBe(document.activeElement);
    button('ai-needed-cancel').focus();document.dispatchEvent(new KeyboardEvent('keydown',{ key:'Tab',bubbles:true,cancelable:true }));expect(button('ai-needed-or')).toBe(document.activeElement);
    document.dispatchEvent(new KeyboardEvent('keydown',{ key:'Tab',shiftKey:true,bubbles:true,cancelable:true }));expect(button('ai-needed-cancel')).toBe(document.activeElement);
    document.dispatchEvent(new KeyboardEvent('keydown',{ key:'Escape',bubbles:true,cancelable:true }));vi.advanceTimersByTime(100);expect(launch).toBe(document.activeElement);expect(action).not.toHaveBeenCalled();expect(overlay().hasAttribute('data-modal-focus-trap')).toBe(false);
  });
  it('only dismisses on a backdrop click that did not begin inside the dialog', () => {
    showAiActionDialog(content,vi.fn());button('ai-needed-or').dispatchEvent(new MouseEvent('mousedown',{ bubbles:true }));overlay().click();expect(overlay().classList.contains('show')).toBe(true);
    overlay().dispatchEvent(new MouseEvent('mousedown',{ bubbles:true }));overlay().click();expect(overlay().classList.contains('show')).toBe(false);expect(document.body.style.overflow).toBe('auto');
  });
  it('shows actionable style retry, then clears it after recovery', async () => {
    runtime.styles.mockRejectedValueOnce(new Error('Unavailable'));showAiActionDialog(content,vi.fn());await mutations();
    expect(overlay().textContent).toContain('styles could not load');const retry=overlay().querySelector<HTMLButtonElement>('[data-ai-dialog-retry-styles]')!;retry.click();await mutations();
    expect(runtime.styles).toHaveBeenCalledTimes(2);expect(overlay().querySelector('[data-ai-dialog-retry-styles]')).toBeNull();
  });
  it('rejects a late stylesheet failure after replacement or closure', async () => {
    const old=deferred();runtime.styles.mockReturnValueOnce(old.promise);showAiActionDialog(content,vi.fn());showAiActionDialog(content,vi.fn());old.reject(new Error('Retired'));await mutations();expect(overlay().querySelector('[data-ai-dialog-retry-styles]')).toBeNull();
    const closed=deferred();runtime.styles.mockReturnValueOnce(closed.promise);showAiActionDialog(content,vi.fn());button('ai-needed-cancel').click();closed.reject(new Error('Closed'));await mutations();expect(overlay().children).toHaveLength(0);
  });
  it('releases resources when external callers hide or remove the overlay', async () => {
    showAiActionDialog(content,vi.fn());overlay().classList.remove('show');await mutations();expect(document.body.style.overflow).toBe('auto');expect(overlay().hasAttribute('data-modal-focus-trap')).toBe(false);
    showAiActionDialog(content,vi.fn());overlay().remove();await mutations();expect(document.body.style.overflow).toBe('auto');expect(vi.getTimerCount()).toBe(0);
  });
  it('keeps independent notices stacked with only the topmost Escape dismissal', () => {
    const launch=opener();showAiActionDialog(content,vi.fn());button('ai-needed-or').focus();
    showAiActionDialog({ ...content,overlayId:'or-no-balance-overlay',options:[{ ...content.options[0]!,id:'or-add-credits' }],cancelId:'or-nb-cancel' },vi.fn());
    document.dispatchEvent(new KeyboardEvent('keydown',{ key:'Escape',bubbles:true,cancelable:true }));expect(overlay().classList.contains('show')).toBe(true);expect(document.body.style.overflow).toBe('hidden');expect(button('ai-needed-or')).toBe(document.activeElement);
    document.dispatchEvent(new KeyboardEvent('keydown',{ key:'Escape',bubbles:true,cancelable:true }));expect(launch).toBe(document.activeElement);expect(document.body.style.overflow).toBe('auto');
  });
  it('returns an idempotent trap disposer that releases locks without stealing focus', () => {
    const launch=opener(),host=document.createElement('div');host.innerHTML='<div role="dialog"><button>Choose</button></div>';document.body.appendChild(host);
    const release=trapModalFocus(host,{ autoFocus:false });const chosen=host.querySelector('button')!;chosen.focus();release(false);release();
    expect(chosen).toBe(document.activeElement);expect(launch).not.toBe(document.activeElement);expect(host.hasAttribute('data-modal-focus-trap')).toBe(false);expect(document.body.style.overflow).toBe('auto');
  });
});
