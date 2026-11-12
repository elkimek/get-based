import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {expect, test} from '@playwright/test';
import {buildReadonlyDemo, DEMO_CSP} from '../../scripts/build-readonly-demo.mjs';
import type {AddressInfo} from 'node:net';

test('isolated fictional demo switches lenses and profiles without personal input, storage or connections', async ({page}, info) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'getbased-public-demo-'));
  const manifest = await buildReadonlyDemo(directory);
  const published = new Set(manifest.files.map(file => '/' + file.path));
  const server = http.createServer(async (request, response) => {
    const pathname = new URL(request.url!, 'http://localhost').pathname;
    const name = pathname === '/' ? '/index.html' : pathname;
    if (!published.has(name) || name === '/vercel.json') {response.writeHead(404).end(); return;}
    const types: Record<string, string> = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2'};
    response.setHeader('Content-Type', types[path.extname(name)] || 'application/json');
    response.setHeader('Content-Security-Policy', DEMO_CSP);
    response.end(await fs.readFile(path.join(directory, name.slice(1))));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const errors: string[] = [], requests: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => requests.push(request.url()));
  await page.addInitScript(() => {
    const attempts: string[] = [];
    Object.assign(window, {demoStorageAttempts: attempts});
    for (const key of ['localStorage', 'sessionStorage', 'indexedDB', 'caches']) Object.defineProperty(window, key, {get() {attempts.push(key); throw new Error('Demo used ' + key);}});
    if (navigator.storage) Object.defineProperty(navigator.storage, 'getDirectory', {value() {attempts.push('OPFS'); throw new Error('Demo used OPFS');}});
    if (navigator.serviceWorker) Object.defineProperty(navigator.serviceWorker, 'register', {value() {attempts.push('serviceWorker'); throw new Error('Demo registered a service worker');}});
  });
  try {
    const response = await page.goto(origin);
    expect(response!.headers()['content-security-policy']).toBe(DEMO_CSP);
    await expect(page.getByRole('heading', {name: 'Labs', exact: true})).toBeVisible();
    await expect(page.getByText('Fictional data · read-only demo')).toBeVisible();
    await expect(page.locator('input, textarea, [contenteditable=true], form, iframe')).toHaveCount(0);
    const first = await page.locator('.metric').first().textContent() ?? '';
    expect(first.length).toBeGreaterThan(0);
    await page.getByRole('button', {name: 'Male sample', exact: true}).click();
    await expect(page.locator('.metric').first()).not.toHaveText(first);
    await page.locator('.metric').nth(2).click();
    await expect(page.getByRole('heading', {name: 'LDL Cholesterol', exact: true})).toBeVisible();
    await page.getByRole('button', {name: /^Genome/}).click();
    await expect(page.getByRole('cell', {name: 'rs429358', exact: true})).toBeVisible();
    await page.getByRole('button', {name: /^Body/}).click();
    await expect(page.getByRole('heading', {name: 'Weight', exact: true})).toBeVisible();
    await page.getByRole('button', {name: /^Light/}).click();
    await expect(page.getByRole('heading', {name: 'Time outdoors, in context'})).toBeVisible();
    await page.getByRole('button', {name: /^Insight/}).click();
    await expect(page.getByRole('heading', {name: 'Notes from the fictional profile'})).toBeVisible();
    await page.getByRole('button', {name: /^Labs/}).click();
    await expect(page.locator('body')).toHaveJSProperty('scrollWidth', await page.evaluate(() => document.documentElement.clientWidth));
    await page.screenshot({path: info.outputPath('public-demo.png'), fullPage: true});
    await page.setViewportSize({width: 390, height: 844});
    await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 390);
    await expect(page.getByRole('button', {name: /^Genome/})).toBeVisible();
    await page.screenshot({path: info.outputPath('public-demo-mobile.png'), fullPage: true});
    await page.reload();
    await expect(page.locator('.metric').first()).toHaveText(first);
    await expect(page.getByRole('button', {name: 'Female sample', exact: true})).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => (window as unknown as {demoStorageAttempts: string[]}).demoStorageAttempts)).toEqual([]);
    expect(errors).toEqual([]);
    expect(requests.every(url => url.startsWith(origin + '/'))).toBe(true);
    expect(requests.every(url => url === origin + '/' || published.has(new URL(url).pathname))).toBe(true);
    expect(requests.some(url => /api|service-worker|analytics/.test(new URL(url).pathname))).toBe(false);
    expect(manifest.files.map(file => file.path).sort()).toEqual(['demo.css', 'demo.js', 'index.html', 'inter.woff2', 'outfit.woff2', 'vercel.json']);
    await info.attach('isolated-demo-artifact', {contentType: 'application/json', body: Buffer.from(JSON.stringify(manifest))});
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await fs.rm(directory, {recursive: true, force: true});
  }
});
