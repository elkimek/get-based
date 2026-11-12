import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { createSelfHostServer, SELF_HOST_BIND, selfHostPort } from '../server/self-host-server.js';

let directory: string;
let server: http.Server | undefined;
let origin: string;
beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'getbased-host-test-'));
  for (const [name, body] of Object.entries({
    'index.html': '<!doctype html><title>Synthetic app</title>',
    'version.js': 'self.APP_BUILD_ID = "synthetic";',
    'service-worker.js': 'self.addEventListener("fetch", () => {});',
    'build-metrics.json': '{}',
    '.env': 'synthetic-private-value',
    'style.css': 'body { color: red; }',
  })) await fs.writeFile(path.join(directory, name), body);
  await fs.mkdir(path.join(directory, '.well-known'));
  await fs.writeFile(path.join(directory, '.well-known/mcp.json'), '{"synthetic":true}');
  await fs.mkdir(path.join(directory, '.private'));
  await fs.writeFile(path.join(directory, '.private/key.json'), '{"synthetic":"private"}');
});
afterEach(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
    server = undefined;
  }
  await fs.rm(directory, {recursive: true, force: true});
});
async function start() {
  server = await createSelfHostServer({artifactDirectory: directory});
  await new Promise<void>((resolve, reject) => {
    server!.once('error', reject); server!.listen(0, SELF_HOST_BIND, resolve);
  });
  const address = server.address() as AddressInfo;
  expect(address.address).toBe('127.0.0.1');
  origin = 'http://127.0.0.1:' + address.port;
}
function rawRequest(name: string): Promise<{status: number; text: string}> {
  return new Promise((resolve, reject) => {
    const req = http.get(origin + name, response => {
      let text = ''; response.setEncoding('utf8'); response.on('data', chunk => { text += chunk; });
      response.on('end', () => resolve({status: response.statusCode!, text}));
    });
    req.on('error', reject);
  });
}

it('serves document aliases, public assets and the canonical deployment security headers', async () => {
  await start();
  const deployment = JSON.parse(await fs.readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
  for (const alias of ['/', '/index.html', '/app', '/app/']) {
    const response = await fetch(origin + alias);
    expect(response.status).toBe(200); expect(await response.text()).toContain('Synthetic app');
    for (const name of ['Content-Security-Policy', 'X-Content-Type-Options', 'X-Frame-Options', 'Referrer-Policy', 'Cross-Origin-Opener-Policy', 'Cross-Origin-Embedder-Policy']) {
      expect(response.headers.get(name)).toBe(deployment.routes.find((route: {headers?: Record<string, string>}) => route.headers?.[name]).headers[name]);
    }
    expect(response.headers.get('cache-control')).toBe('no-store');
  }
  expect((await fetch(origin + '/service-worker.js')).headers.get('content-type')).toBe('text/javascript; charset=utf-8');
  expect((await fetch(origin + '/style.css')).headers.get('content-type')).toBe('text/css; charset=utf-8');
  expect(await (await fetch(origin + '/.well-known/mcp.json')).json()).toEqual({synthetic: true});
});

it('supports HEAD and refuses mutation methods without changing the public file', async () => {
  await start();
  const head = await fetch(origin + '/app', {method: 'HEAD'});
  expect(head.status).toBe(200); expect(await head.text()).toBe('');
  expect(Number(head.headers.get('content-length'))).toBeGreaterThan(0);
  for (const method of ['POST', 'PUT', 'DELETE', 'OPTIONS']) {
    const response = await fetch(origin + '/index.html', {method});
    expect(response.status).toBe(405); expect(response.headers.get('allow')).toBe('GET, HEAD');
  }
  expect(await fs.readFile(path.join(directory, 'index.html'), 'utf8')).toContain('Synthetic app');
});

it('refuses hidden files, traversal, missing assets and unavailable integration APIs', async () => {
  await start();
  for (const name of ['/.env', '/.private/key.json', '/%2eenv', '/%2eprivate/key.json', '/..%2fpackage.json', '/%2e%2e%5cpackage.json', '/api/proxy', '/missing.js', '/app/missing']) {
    const response = await rawRequest(name);
    expect(response.status, name).toBe(404); expect(response.text).toBe('Not found');
  }
  expect((await rawRequest('/%ZZ')).status).toBe(400);
});

it('requires a production artifact and the deployed security headers', async () => {
  await fs.unlink(path.join(directory, 'version.js'));
  await expect(createSelfHostServer({artifactDirectory: directory})).rejects.toThrow();
  await fs.writeFile(path.join(directory, 'version.js'), '');
  const config = path.join(directory, 'invalid-deployment.json');
  await fs.writeFile(config, '{"routes":[]}');
  await expect(createSelfHostServer({artifactDirectory: directory, deploymentFile: config})).rejects.toThrow('security header');
});

it('rejects public symlinks at startup and files replaced with symlinks after startup', async () => {
  const external = path.join(directory, '.env');
  await fs.symlink(external, path.join(directory, 'public-link.txt'));
  await expect(createSelfHostServer({artifactDirectory: directory})).rejects.toThrow('symbolic links');
  await fs.unlink(path.join(directory, 'public-link.txt'));
  await start();
  await fs.unlink(path.join(directory, 'style.css'));
  await fs.symlink(external, path.join(directory, 'style.css'));
  expect((await rawRequest('/style.css')).status).toBe(404);
});

it('validates a stable configured port rather than selecting a random origin', () => {
  expect(selfHostPort()).toBe(8000); expect(selfHostPort('8181')).toBe(8181);
  for (const value of ['0', '-1', '65536', '8000abc', '8.5', '']) expect(() => selfHostPort(value)).toThrow('GETBASED_SELF_HOST_PORT');
});
