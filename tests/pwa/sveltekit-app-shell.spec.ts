import {openStaticSettings} from './settings-entry.js';
import path from 'node:path';
import {readFileSync} from 'node:fs';
import {expect, test} from '@playwright/test';
import {startKitServer} from './kit-server.js';

// Shell ownership acceptance uses the assembled artifact; offline/cache/install
// acceptance is covered separately, without accumulating another full precache.
test.use({serviceWorkers: 'block'});

test('static Kit owns the complete AppShell and preserves SSR controls through hydration', async ({page, context}) => {
  const artifact = process.env.GETBASED_KIT_ARTIFACT || path.resolve('.local-notes/sveltekit-build');
  const appVersion = /self\.APP_VERSION\s*=\s*'([^']+)'/.exec(readFileSync(path.join(artifact,'version.js'),'utf8'))?.[1];
  if (!appVersion) throw new Error('Actual artifact application version required');
  await context.addInitScript(version => {
    if (!['http:', 'https:'].includes(location.protocol)) return;
    localStorage.setItem('labcharts-legal-acceptance', JSON.stringify({
      accepted: true, termsVersion: '2026-08-22', privacyVersion: '2026-08-22',
      policyScope: 'self-hosted-notice', acceptedAt: '2026-10-15T00:00:00Z',
    }));
    for (const key of ['emptyTour', 'tour']) localStorage.setItem(`labcharts-default-${key}`, 'completed');
    localStorage.setItem('labcharts-analytics-consent-seen', '1');
    localStorage.setItem('labcharts-changelog-seen', version);
    localStorage.setItem('labcharts-encryption-nudge-dismissed', 'true');
  }, appVersion);
  const server = await startKitServer(artifact);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    for (const width of [393, 1280]) {
      await page.setViewportSize({width, height: 900});
      let release!: () => void;
      const gate = new Promise<void>(done => {release = done;});
      await page.route(/\/js\/kit-bootstrap-[a-f0-9]+\.js$/, async route => {await gate; await route.continue();});
      try {
        await page.goto(server.origin + '/index.html', {waitUntil: 'commit'});
        await expect(page.locator('#kit-root .header')).toBeVisible();
        const original = await page.evaluateHandle(() => {
          const input = document.getElementById('chat-input') as HTMLTextAreaElement;
          input.value = 'Unsent before Kit hydration';
          const trigger = document.querySelector<HTMLButtonElement>('.header-import-btn')!;
          trigger.focus();
          return {
            header: document.querySelector('.header'), footer: document.querySelector('.app-footer'),
            welcome: document.querySelector('[data-prerendered-welcome]'),
            main: document.getElementById('main-content'), sidebar: document.getElementById('sidebar-nav'),
            modal: document.getElementById('detail-modal'), input, trigger,
          };
        });
        release();
        await expect(page.locator('html[data-app-ready]')).toBeAttached({timeout: 30_000});
        await expect(page.locator('html')).toHaveAttribute('data-shell-framework', 'sveltekit');
        expect(await original.evaluate(refs => ({
          header: document.querySelector('.header') === refs.header,
          footer: document.querySelector('.app-footer') === refs.footer,
          welcome: document.querySelector('[data-prerendered-welcome]') === refs.welcome,
          main: document.getElementById('main-content') === refs.main,
          sidebar: document.getElementById('sidebar-nav') === refs.sidebar,
          modal: document.getElementById('detail-modal') === refs.modal,
          input: document.getElementById('chat-input') === refs.input,
          value: refs.input.value, focus: document.activeElement === refs.trigger,
        }))).toEqual({header: true, footer: true, welcome: true, main: true, sidebar: true,
          modal: true, input: true, value: 'Unsent before Kit hydration', focus: true});
        await original.dispose();
        await expect(page.locator('#app-shell-host, #chat-shell-host')).toHaveCount(0);
        await expect(page.locator('#chat-panel')).toHaveCount(1);
        await openStaticSettings(page);
        await expect(page.locator('#settings-modal-overlay')).toHaveClass(/show/);
        await page.locator('#settings-modal [data-settings-action="close"]').click();
        await expect(page.locator('#settings-modal-overlay')).not.toHaveClass(/show/);
        if (width <= 768) {
          await expect(page.locator('.feedback-btn')).toBeHidden();
          await page.locator('.tweaks-btn').click();
          await expect(page.locator('#tweaks-panel')).toBeVisible();
          await page.locator('[data-tweaks-action="send-feedback"]').click();
        } else {
          await expect(page.locator('.feedback-btn')).toBeVisible();
          await page.locator('.feedback-btn').click();
        }
        await expect(page.locator('#feedback-modal-overlay')).toHaveClass(/show/);
        await page.locator('#feedback-modal [data-feedback-action="close"]').first().click();
        await expect(page.locator('#feedback-modal-overlay')).not.toHaveClass(/show/);
        expect(errors).toEqual([]);
      } finally {
        release();
        await page.unroute(/\/js\/kit-bootstrap-[a-f0-9]+\.js$/);
      }
    }
  } finally {await server.close();}
});
