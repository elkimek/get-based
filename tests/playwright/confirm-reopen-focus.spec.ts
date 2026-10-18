import { expect, test } from '@playwright/test';
import { createBlankPage } from '../helpers/browser-blank-page.js';

interface ConfirmReopenReceipt {
  results: boolean[];
  events: { type: string; target: string; trusted: boolean; key: string | null; prevented: boolean }[];
  sameNode: boolean;
  sameHTML: boolean;
  followsParent: boolean;
  overflow: string;
}
type FixtureWindow = Window & { confirmReopenReceipt?: () => ConfirmReopenReceipt };

const openBlank = createBlankPage({ path: '/confirm-reopen-regression', body:
  '<!doctype html><html><head><link rel="stylesheet" href="/css/app-shell.css"><link rel="stylesheet" href="/css/modal-shared.css"></head><body><button id="first-launcher">Open confirmation</button><button id="open-parent">Open later parent</button></body></html>',
});

test('reused confirmation keeps foreground focus, native keyboard, backdrop and result ownership', async ({ page }, info) => {
  await openBlank(page);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.evaluate(async () => {
    const { showConfirmDialog } = await import('/js/utils.js');
    const { openModalOverlay } = await import('/js/modal-lifecycle.js');
    const { installGlobalEventListeners } = await import('/js/app-event-listeners.js');
    installGlobalEventListeners();
    const results: boolean[] = [];
    const events: Event[] = [];
    let firstOverlay: HTMLElement | null = null;
    let firstHTML: string | null = null;
    const openConfirmation = () => {
      const pending = showConfirmDialog('Keep this message');
      const overlay = document.getElementById('confirm-dialog-overlay');
      if (!firstOverlay) { firstOverlay = overlay; firstHTML = overlay?.innerHTML ?? null; }
      void pending.then(result => { results.push(result); });
    };
    document.getElementById('first-launcher')!.addEventListener('click', openConfirmation);
    document.getElementById('open-parent')!.addEventListener('click', () => {
      const parent = document.createElement('div');
      parent.id = 'later-parent'; parent.className = 'modal-overlay';
      parent.innerHTML = '<div class="modal" role="dialog" aria-label="Later parent"><button id="parent-launcher">Open nested confirmation</button></div>';
      parent.querySelector('#parent-launcher')!.addEventListener('click', openConfirmation);
      document.body.appendChild(parent);
      openModalOverlay(parent, { initialFocus: '#parent-launcher', focusDelay: 30 });
    });
    for (const type of ['pointerdown', 'pointerup', 'click', 'keydown', 'focusin']) {
      document.addEventListener(type, event => {
        events.push(event);
      });
    }
    (window as FixtureWindow).confirmReopenReceipt = () => {
      const overlay = document.getElementById('confirm-dialog-overlay');
      const parent = document.getElementById('later-parent');
      return { results: [...results], events: events.map(event => ({ type: event.type,
        target: event.target instanceof Element ? event.target.id : '', trusted: event.isTrusted,
        key: event instanceof KeyboardEvent ? event.key : null, prevented: event.defaultPrevented })), sameNode: overlay === firstOverlay,
        sameHTML: overlay?.innerHTML === firstHTML, followsParent: !!parent && !!overlay
          && !!(parent.compareDocumentPosition(overlay) & Node.DOCUMENT_POSITION_FOLLOWING), overflow: document.body.style.overflow };
    };
  });
  const read = () => page.evaluate(() => {
    const receipt = (window as FixtureWindow).confirmReopenReceipt;
    if (!receipt) throw new Error('Missing confirmation fixture receipt');
    return receipt();
  });
  try {
    await page.locator('#first-launcher').click();
    await expect(page.locator('#confirm-cancel')).toBeFocused();
    await expect(page.locator('#confirm-cancel')).toHaveText('Cancel');
    await expect(page.locator('#confirm-ok')).toHaveText('Confirm');
    await page.locator('#confirm-cancel').click();
    await expect.poll(async () => (await read()).results).toEqual([false]);
    await expect(page.locator('#first-launcher')).toBeFocused();
    await page.locator('#open-parent').click();
    await expect(page.locator('#parent-launcher')).toBeFocused();
    await page.locator('#parent-launcher').click();
    await expect(page.locator('#confirm-cancel')).toBeFocused();
    const reopened = await read();
    expect(reopened.sameNode).toBe(true); expect(reopened.sameHTML).toBe(true); expect(reopened.followsParent).toBe(true);
    await page.keyboard.press('Tab');
    await expect(page.locator('#confirm-ok')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.locator('#confirm-cancel')).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(page.locator('#confirm-ok')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect.poll(async () => (await read()).results).toEqual([false, false]);
    await expect(page.locator('#parent-launcher')).toBeFocused();
    await expect(page.locator('#later-parent')).toHaveClass('modal-overlay show');
    await page.locator('#parent-launcher').click();
    await expect(page.locator('#confirm-cancel')).toBeFocused();
    await page.locator('#confirm-dialog-overlay').click({ position: { x: 8, y: 8 } });
    await expect(page.locator('.confirm-dialog')).toHaveClass(/modal-nudge/);
    expect((await read()).results).toEqual([false, false]);
    await expect(page.locator('#confirm-dialog-overlay')).toHaveClass('confirm-overlay show');
    await expect(page.locator('.confirm-dialog')).not.toHaveClass(/modal-nudge/);
    await page.locator('#confirm-ok').click();
    await expect.poll(async () => (await read()).results).toEqual([false, false, true]);
    await expect(page.locator('#parent-launcher')).toBeFocused();
    const final = await read();
    expect(final.sameNode).toBe(true); expect(final.sameHTML).toBe(true); expect(final.followsParent).toBe(true);
    expect(final.overflow).toBe(reopened.overflow);
    expect(final.events.filter(event => event.type === 'keydown').map(event => [event.key, event.trusted]))
      .toEqual([['Tab', true], ['Tab', true], ['Shift', true], ['Tab', true], ['Escape', true]]);
    expect(final.events.some(event => event.type === 'keydown' && event.key === 'Escape' && event.prevented)).toBe(true);
    expect(final.events.filter(event => event.type === 'click').every(event => event.trusted)).toBe(true);
    expect(errors).toEqual([]);
  } finally {
    if (!page.isClosed()) await info.attach('confirm-reopen-native-receipt', {
      body: JSON.stringify({ ...(await read()), errors }, null, 2), contentType: 'application/json',
    });
  }
});
