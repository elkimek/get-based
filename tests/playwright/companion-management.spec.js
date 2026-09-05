import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { createAgentHostService } from '../../lib/agent-host-service.js';

let server, endpoint;
let actions = [];
test.beforeAll(async () => {
  let mode = 'temporary';
  const service = createAgentHostService({
    appServer: {}, token: 'private-installation-secret', workspaceRoot: '/tmp/unused-management-test',
    runtimeInfo: () => ({ runtimeMode: mode, companionVersion: 'test' }),
    controlHandler: async action => {
      actions.push(action);
      if (action === 'install') mode = 'installed';
      if (action === 'uninstall') mode = 'temporary';
      return { runtimeMode: mode, restartRequired: action === 'update', updated: action === 'update' };
    },
  });
  server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const result = await service.handleRequest(new Request(endpoint + req.url, {
      method: req.method, headers: req.headers,
      body: chunks.length ? Buffer.concat(chunks) : undefined,
    }));
    res.writeHead(result.status, Object.fromEntries(result.headers));
    res.end(Buffer.from(await result.arrayBuffer()));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  endpoint = `http://127.0.0.1:${server.address().port}`;
});
test.afterAll(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });

test('local management runs controls while hosted discovery stays chat-only', async ({ page }) => {
  await page.goto(endpoint + '/manage');
  await expect(page.locator('#status')).toHaveText('Connected');
  await expect(page.locator('#startup-description')).toContainText('Connected for this terminal session');
  await page.setViewportSize({ width: 360, height: 740 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByText('Advanced', { exact: true }).click();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(page.locator('#status')).toContainText('Paused');
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await expect(page.locator('#status')).toHaveText('Connected');
  await page.getByRole('button', { name: 'Start automatically', exact: true }).click();
  await expect(page.locator('#startup-description')).toContainText('Starts automatically at login');
  await page.getByRole('button', { name: 'Check for update', exact: true }).click();
  await expect(page.locator('#message')).toContainText('Update installed. Restart when you’re ready.');
  await page.getByRole('button', { name: 'Reconnect CLIs', exact: true }).click();
  await page.getByRole('button', { name: 'Restart Companion', exact: true }).click();
  await page.getByRole('button', { name: 'Uninstall…', exact: true }).click();
  await page.getByRole('button', { name: 'Uninstall Companion', exact: true }).click();
  await expect(page.locator('#status')).toHaveText('Connected');
  await expect(page.locator('#startup-description')).toContainText('Connected for this terminal session');
  expect(actions).toEqual(['install', 'update', 'restart', 'restart-companion', 'uninstall']);
  const discovery = await page.request.get(endpoint + '/v1/discovery', { headers: { Origin: 'https://app.getbased.health' } });
  const data = await discovery.json();
  expect(data.controlAuthorized).toBe(false);
  expect((await page.request.post(endpoint + '/v1/control', { headers: { Origin: 'https://app.getbased.health', Authorization: `Bearer ${data.token}` }, data: { action: 'install' } })).status()).toBe(403);
  expect((await page.request.get(endpoint + '/manage', { headers: { Origin: 'https://app.getbased.health' } })).status()).toBe(403);
});
