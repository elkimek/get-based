import { expect, test } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createCompanionManagement } from '../../lib/companion-management.js';

let server;
test.afterEach(async () => { if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } });

for (const width of [760, 360]) {
  test(`Companion controls stay inside hosted Settings at ${width}px`, async ({ page }) => {
    const parent = 'https://app.getbased.health';

    const actions = [];
    let updateAvailable = false, offlineUntil = 0;
    const status = { runtimeMode: 'installed', processMode: 'service', companionVersion: '1.3.0', paused: false, restartRequired: false };
    const createManagement = () => createCompanionManagement({
      allowParentOrigin: value => value === parent,
      status: () => status,
      control: async request => {
        const { action } = await request.json();
        actions.push(action);
        if (action === 'pause' || action === 'resume') status.paused = action === 'pause';
        if (action === 'update') {
          status.restartRequired = updateAvailable;
          return Response.json({ ...status, updated: updateAvailable, upToDate: !updateAvailable });
        }
        if (action === 'restart-companion') {
          offlineUntil = Date.now() + 2600;
          return Response.json({ ...status, restarting: true });
        }
        return Response.json(status);
      },
    });
    let handle = createManagement();
    server = createServer(async (req, res) => {
      if (offlineUntil) {
        if (Date.now() < offlineUntil) { req.socket.destroy(); return; }
        offlineUntil = 0;
        status.restartRequired = false;
        status.paused = false;
        handle = createManagement(); // A restart invalidates management sessions.
      }
      if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ service: 'getbased-agent-host' }));
        return;
      }
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = Buffer.concat(chunks).toString();
      const response = await handle(new Request(`http://${req.headers.host}${req.url}`, {
        method: req.method, headers: req.headers, ...(body ? { body } : {}),
      }));
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(await response.text());
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const endpoint = `http://127.0.0.1:${server.address().port}`;
    await page.context().grantPermissions(['local-network-access'], { origin: parent });
    await page.setViewportSize({ width, height: 850 });
    const config = JSON.parse(await readFile(new URL('../../vercel.json', import.meta.url), 'utf8'));
    const headers = config.routes.find(entry => entry.headers?.['Content-Security-Policy']).headers;
    const css = await readFile(new URL('../../css/settings.css', import.meta.url), 'utf8');
    await page.route(parent + '/companion-settings-test', route => route.fulfill({
      contentType: 'text/html', headers,
      body: `<html data-theme="light"><style>:root{--border:#d7dce4;--bg-secondary:#f7f8fa}body{margin:16px;font:14px system-ui}.settings-modal{max-width:680px;margin:auto}${css}</style><main class="settings-modal"><h2>AI settings</h2><div class="local-agent-list-kicker">Companion</div><iframe class="local-agent-management-frame" title="Companion controls" sandbox="allow-scripts allow-same-origin" src="${endpoint}/manage/embed?parentOrigin=${encodeURIComponent(parent)}&theme=light"></iframe></main></html>`,
    }));
    // The host's origin/source validation is covered by cli-companion-ui.test.js.
    // Capture the embedded panel's size-only message to verify its browser layout.
    await page.addInitScript(() => {
      window.addEventListener('message', event => {
        const frame = document.querySelector('iframe');
        if (event.source === frame?.contentWindow && event.data?.type === 'getbased-companion-panel-size') {
          frame.style.height = `${event.data.height}px`;
        }
      });
    });
    await page.goto(parent + '/companion-settings-test');
    const frame = page.frameLocator('iframe');
    await expect(frame.locator('#status')).toContainText('Connected');
    await expect(frame.getByRole('button', { name: 'Pause', exact: true })).toBeHidden();
    await expect(frame.getByRole('button', { name: 'Refresh status', exact: true })).toHaveCount(0);
    await expect(frame.getByRole('button', { name: 'Check for update', exact: true })).toBeVisible();
    await frame.getByRole('button', { name: 'Check for update', exact: true }).click();
    await expect(frame.locator('#message')).toHaveText('Companion is up to date.');
    await expect(frame.getByRole('button', { name: 'Restart to finish update' })).toBeHidden();
    updateAvailable = true;
    await frame.getByText('Advanced', { exact: true }).click();
    await frame.getByRole('button', { name: 'Pause', exact: true }).click();
    await expect(frame.getByRole('button', { name: 'Resume', exact: true })).toBeVisible();
    expect(actions).toEqual(['update', 'pause']);
    await frame.getByRole('button', { name: 'Uninstall…', exact: true }).click();
    await expect(frame.getByRole('region', { name: 'Confirm uninstall' })).toBeVisible();
    await frame.getByRole('button', { name: 'Cancel', exact: true }).click();
    expect(actions).toEqual(['update', 'pause']);
    // A stale uninstall prompt must never turn an update click into uninstall.
    await frame.getByRole('button', { name: 'Uninstall…', exact: true }).click();
    await frame.getByRole('button', { name: 'Check for update', exact: true }).click();
    await expect(frame.getByRole('region', { name: 'Confirm uninstall' })).toBeHidden();
    await expect(frame.locator('#message')).toContainText('Update installed');
    expect(actions).toEqual(['update', 'pause', 'update']);
    await frame.getByRole('button', { name: 'Restart to finish update' }).click();
    await expect(frame.locator('#status')).toHaveText('Reconnecting…');
    // The former 1.8-second reload navigated into a browser error page here.
    await page.waitForTimeout(1900);
    await expect(frame.locator('#status')).toHaveText('Reconnecting…');
    await expect(frame.locator('#status')).toHaveText('Connected', { timeout: 10000 });
    await expect(frame.getByRole('button', { name: 'Restart to finish update' })).toBeHidden();
    expect(actions).toEqual(['update', 'pause', 'update', 'restart-companion']);
    expect(page.url()).toBe(parent + '/companion-settings-test');
    expect(page.context().pages()).toHaveLength(1);
    const contentFrame = page.frames().find(item => item.url().startsWith(endpoint));
    expect(await contentFrame.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `/tmp/companion-settings-${width}.png` });
  });
}
