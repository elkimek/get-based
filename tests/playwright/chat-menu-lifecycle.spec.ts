import {expect, test} from './coverage-fixture.js';
import {routeHtml} from '../helpers/browser-static-routes.js';
import {renderHTML} from '../../js/components/AppShell.svelte.html.js';

test('retired chat menus ignore details toggle events', async ({page}) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await routeHtml(page, '**/chat-menu-lifecycle',
    '<!doctype html><div id="app-shell-host">' + renderHTML() + '</div><button id="outside">Outside the app</button>', 200);
  await page.goto('/chat-menu-lifecycle');

  const outcome = await page.evaluate(async () => {
    const url = '/js/components/AppShell.svelte.native.js';
    const route = await import(url) as typeof import('../../js/components/AppShell.svelte.native.js');
    const root = document.getElementById('app-shell-host')!;
    const view = route.hydrate(route.default, {target: root, recover: false});
    route.flushSync();
    const menus = ['.chat-more-menu', '#chat-model-menu', '#chat-context-menu'].map(selector => {
      const menu = root.querySelector<HTMLDetailsElement>(selector);
      if (!menu) throw new Error('Missing chat menu ' + selector);
      return menu;
    });
    for (const menu of menus) menu.open = true;
    await route.unmount(view);
    for (const menu of menus) menu.dispatchEvent(new Event('toggle'));
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    return {disconnected: menus.map(menu => !menu.isConnected), children: root.childElementCount,
      outside: document.getElementById('outside')?.textContent};
  });
  expect(outcome).toEqual({disconnected: [true, true, true], children: 0, outside: 'Outside the app'});
  expect(errors).toEqual([]);
});
