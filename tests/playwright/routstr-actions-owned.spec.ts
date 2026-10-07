import { expect, test } from '@playwright/test';
import { routeHtml } from '../helpers/browser-static-routes.js';
test('published synchronous Routstr controls hydrate once, retain identity and reject retired owners in the browser', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await routeHtml(page, '**/routstr-actions-owned-test', '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/css/settings.css"></head><body><main id="ai-provider-panel"><section id="wallet"></section><section id="node"></section><button id="outside">Outside</button></main></body></html>');
  await page.goto('/routstr-actions-owned-test');
  expect(await page.evaluate(async () => {
    const helpers = await import('/js/provider-wallet-panel-buttons.js'), owned = await import('/js/routstr-actions-component.js'); const calls: string[][] = [];
    owned.configureRoutstrActions({ wallet: action => calls.push(['wallet', action]), node: (action, node) => calls.push(['node', action, node]) });
    const wallet = document.getElementById('wallet')!, nodes = document.getElementById('node')!;
    wallet.innerHTML = helpers.routstrWalletActionButtons(null); nodes.innerHTML = helpers.buildRoutstrNodeActions('https://synthetic.test/" onclick="unsafe', true, null);
    const toggle = wallet.querySelector<HTMLButtonElement>('[data-routstr-wallet-action="toggle-wallet-menu"]')!, browse = nodes.querySelector<HTMLButtonElement>('[data-node-action="browse"]')!, withdraw = nodes.querySelector<HTMLButtonElement>('[data-node-action="withdraw"]')!;
    toggle.click(); const menuOpen = toggle.getAttribute('aria-expanded') === 'true' && !wallet.querySelector<HTMLElement>('#routstr-wallet-menu')!.hidden;
    browse.click(); withdraw.click(); const nodeOwner = owned.updateRoutstrActions(nodes, owned.routstrActionsState('node', 'https://replacement.test', true, 'withdraw'));
    const retained = nodes.querySelector('[data-node-action="withdraw"]') === withdraw; withdraw.click();
    nodes.replaceChildren(); nodeOwner.invoke('deposit'); withdraw.click(); await Promise.resolve();
    return { menuOpen, retained, inert: !document.querySelector('[onclick]'), calls };
  })).toEqual({ menuOpen: true, retained: true, inert: true, calls: [['node','browse','https://synthetic.test/" onclick="unsafe'], ['node','withdraw','https://synthetic.test/" onclick="unsafe'], ['node','withdraw','https://replacement.test']] });
  const toggle = page.getByRole('button', { name: 'More wallet actions', exact: true });
  await toggle.press('Escape'); await expect(toggle).toHaveAttribute('aria-expanded','false'); await expect(toggle).toBeFocused();
  await toggle.click(); await page.locator('#outside').click(); await expect(toggle).toHaveAttribute('aria-expanded','false');
  await page.evaluate(async () => { const owned = await import('/js/routstr-actions-component.js'); owned.disposeRoutstrActions(document.getElementById('wallet')!); });
  await expect(page.locator('[data-routstr-actions-view]')).toHaveCount(0); expect(errors).toEqual([]);
});
