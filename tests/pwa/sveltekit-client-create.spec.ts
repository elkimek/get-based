import path from 'node:path';
import {expect, test, type Page} from '@playwright/test';
import type {StoredProfileRecord} from '../../js/profile-list-store.js';
import {installDiscussionFixture} from '../helpers/chat-discussion-fixture.js';
import {startKitServer} from './kit-server.js';

const artifact = process.env.GETBASED_KIT_ARTIFACT || path.resolve('.local-notes/sveltekit-build');
interface FormEventReceipt {trusted: boolean; name: string; prevented: boolean}
interface ClientCreateWindow extends Window {clientCreateSubmits: FormEventReceipt[]}
async function registry(page: Page): Promise<StoredProfileRecord[]> {
  return page.evaluate(() => JSON.parse(localStorage.getItem('labcharts-profiles') || '[]') as StoredProfileRecord[]);
}

test('static local clients create once by pointer and Enter, edit, and persist after offline cold launch', async ({page, context}, info) => {
  test.setTimeout(90000); await installDiscussionFixture(context, {paused: true});
  const errors: string[] = [], csp: string[] = [], external: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await context.exposeBinding('clientCreateCsp', (_, value: string) => {csp.push(value);});
  await context.addInitScript(() => {
    const observed = window as unknown as ClientCreateWindow; observed.clientCreateSubmits = [];
    const receipts = new WeakMap<Event, FormEventReceipt>();
    document.addEventListener('submit', event => {
      if (!(event.target instanceof HTMLFormElement) || !event.target.matches('#client-list-modal .cl-form')) return;
      const receipt = {trusted: event.isTrusted, name: (document.getElementById('cl-name') as HTMLInputElement).value, prevented: event.defaultPrevented};
      observed.clientCreateSubmits.push(receipt); receipts.set(event, receipt);
    }, true);
    // Read cancellation after the owner and Kit container have handled the event;
    // a microtask inside capture can run before the next native listener.
    document.addEventListener('submit', event => {const receipt = receipts.get(event); if (receipt) receipt.prevented = event.defaultPrevented;});
    document.addEventListener('securitypolicyviolation', event => {
      void (window as unknown as {clientCreateCsp(value: string): Promise<void>}).clientCreateCsp(event.violatedDirective);
    });
  });
  const server = await startKitServer(artifact), activate = async (selector: string) => {
    const control = page.locator(selector); if (info.project.use.hasTouch) await control.tap(); else await control.click();
  };
  let stopped = false;
  await context.route('**/*', route => {
    if (new URL(route.request().url()).origin === server.origin) return route.continue();
    external.push(route.request().url()); return route.abort();
  });
  try {
    await page.goto(server.origin + '/app?dev-sw=1'); await expect(page.locator('html[data-app-ready]')).toBeAttached();
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    await page.waitForFunction(() => navigator.serviceWorker.controller?.state === 'activated');
    const closeChat = page.getByRole('button', {name: 'Close chat', exact: true}); if (await closeChat.isVisible()) await closeChat.click();
    await activate('#profile-selector [data-nav-action="open-client-list"]');
    const original = await registry(page), created: StoredProfileRecord[] = [];
    for (const method of ['pointer', 'Enter'] as const) {
      await activate('#client-list-modal [data-cl-action="open-form"]');
      const before = await registry(page);
      await activate('#client-list-modal .cl-form-save');
      await expect(page.locator('#cl-name')).toBeFocused(); expect(await registry(page)).toEqual(before);
      expect(await page.evaluate(() => (window as unknown as ClientCreateWindow).clientCreateSubmits.length)).toBe(created.length);
      const name = `Synthetic ${method} client`, notes = `Notes for ${method}`;
      await page.locator('#cl-name').fill(name); await page.locator('#cl-notes').fill(notes);
      if (method === 'pointer') await activate('#client-list-modal .cl-form-save'); else await page.locator('#cl-name').press('Enter');
      await expect(page.locator('#client-list-modal .cl-title')).toHaveText('Clients');
      await expect(page.locator('#profile-selector .profile-compact-name')).toHaveText(name);
      const profiles = await registry(page), matches = profiles.filter(profile => profile.name === name);
      expect(matches).toHaveLength(1); const client = matches[0]!; created.push(client);
      expect(profiles).toHaveLength(original.length + created.length); expect(client).toMatchObject({name, notes, status: 'active'});
      for (const profile of original) expect(profiles.find(value => value.id === profile.id)).toMatchObject({id: profile.id, name: profile.name});
      expect(await page.evaluate(() => localStorage.getItem('labcharts-active-profile'))).toBe(client.id);
      expect(await page.evaluate(() => (window as unknown as ClientCreateWindow).clientCreateSubmits)).toEqual(created.map(value => ({trusted: true, name: value.name, prevented: true})));
      await page.evaluate(id => {for (const key of ['emptyTour', 'tour']) localStorage.setItem(`labcharts-${id}-${key}`, 'completed');}, client.id);
    }
    const current = created[1]!;
    await activate(`#client-list-modal [data-cl-action="toggle-menu"][data-cl-profile-id="${current.id}"]`);
    await activate('#cl-active-menu [data-cl-action="edit-profile"]');
    await page.locator('#cl-name').fill('Synthetic renamed client'); await page.locator('#cl-notes').fill('Edited durable notes');
    await activate('#client-list-modal .cl-form-save'); await expect(page.locator('#client-list-modal .cl-title')).toHaveText('Clients');
    await expect(page.locator('#profile-selector .profile-compact-name')).toHaveText('Synthetic renamed client');
    const saved = await registry(page); expect(saved).toHaveLength(original.length + 2);
    expect(saved.find(profile => profile.id === current.id)).toMatchObject({name: 'Synthetic renamed client', notes: 'Edited durable notes'});
    await page.close(); expect(context.pages()).toHaveLength(0);
    await server.close(); stopped = true; await expect(fetch(server.origin + '/index.html')).rejects.toThrow();
    const cold = await context.newPage(); cold.on('pageerror', error => errors.push(error.message));
    await cold.goto(server.origin + '/app?dev-sw=1'); await expect(cold.locator('html[data-app-ready]')).toBeAttached();
    await expect(cold.locator('#profile-selector .profile-compact-name')).toHaveText('Synthetic renamed client');
    expect(await registry(cold)).toEqual(saved);
    expect(await cold.evaluate(() => localStorage.getItem('labcharts-active-profile'))).toBe(current.id);
    expect(errors).toEqual([]); expect(csp).toEqual([]); expect(external).toEqual([]);
  } finally {await context.unrouteAll({behavior: 'ignoreErrors'}); if (!stopped) await server.close();}
});
