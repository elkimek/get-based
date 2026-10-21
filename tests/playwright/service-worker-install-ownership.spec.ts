import http from 'node:http';
import type {AddressInfo, Socket} from 'node:net';
import {readFile} from 'node:fs/promises';
import {expect, test} from './coverage-fixture.js';

test.use({serviceWorkers: 'allow'});

for (const phase of ['before-download', 'after-download'] as const) {
  test(`a failed same-build worker install preserves the first reload and stored data (${phase})`, async ({page}) => {
    const build = 'a'.repeat(64), other = 'b'.repeat(64);
    const runtime = await readFile('service-worker-runtime.js', 'utf8');
    const sockets = new Set<Socket>();
    let revision = 0, probes = 0, failed = false;
    const server = http.createServer((request, response) => {
      const url = new URL(request.url!, 'http://localhost');
      response.setHeader('Cache-Control', 'no-store');
      if (url.pathname === '/service-worker-runtime.js') {
        response.setHeader('Content-Type', 'text/javascript'); response.end(runtime); return;
      }
      if (url.pathname === '/service-worker.js') {
        response.setHeader('Content-Type', 'text/javascript');
        response.end(`importScripts('/service-worker-runtime.js');\n// candidate revision ${revision}\n`
          + `self.GetBasedServiceWorkerRuntime.install({scope:self,buildId:'${build}',appShell:['/app','/version.js','/style.css'],isProduction:true,resolveCacheName:async()=>'labcharts-vbuild-${build}',shouldUseNetworkOnly:()=>false});`);
        return;
      }
      if (url.pathname === '/version.js') {
        response.setHeader('Content-Type', 'text/javascript');
        if (url.searchParams.get('update-check') === '1') {
          probes++;
          if (failed && (phase === 'before-download' || probes > 1)) {
            if (phase === 'before-download') response.statusCode = 503;
            response.end(`self.APP_BUILD_ID = '${other}';`); return;
          }
        }
        response.end(`self.APP_BUILD_ID = '${build}';`); return;
      }
      if (url.pathname === '/style.css') {response.setHeader('Content-Type', 'text/css'); response.end('body {color: black}'); return;}
      response.setHeader('Content-Type', 'text/html');
      response.end('<!doctype html><html><head><title>Installed shell</title></head><body>Installed application shell</body></html>');
    });
    server.on('connection', socket => {sockets.add(socket); socket.on('close', () => sockets.delete(socket));});
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    try {
      await page.goto(origin + '/');
      await page.evaluate(async () => {
        await navigator.serviceWorker.register('/service-worker.js', {updateViaCache: 'none'});
        await navigator.serviceWorker.ready;
      });
      await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
      await page.evaluate(async () => {
        localStorage.setItem('synthetic-retained-profile', 'retained');
        const request = indexedDB.open('synthetic-reload-profile', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('records');
        const db = await new Promise<IDBDatabase>((resolve, reject) => {request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);});
        const tx = db.transaction('records', 'readwrite');
        tx.objectStore('records').put({marker: 'synthetic', value: 7}, 'reading');
        await new Promise<void>((resolve, reject) => {tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error);});
        db.close();
      });
      const before = await page.evaluate(async build => {
        const cache = await caches.open('labcharts-vbuild-' + build);
        return (await cache.match('/app'))!.text();
      }, build);
      revision++; probes = 0; failed = true;
      expect(await page.evaluate(async () => {
        const registration = (await navigator.serviceWorker.getRegistration())!;
        const redundant = new Promise<string>(resolve => registration.addEventListener('updatefound', () => {
          const worker = registration.installing!;
          worker.addEventListener('statechange', () => {if (worker.state === 'redundant') resolve(worker.state);});
        }, {once: true}));
        await registration.update();
        return redundant;
      })).toBe('redundant');
      const response = await page.reload({waitUntil: 'domcontentloaded'});
      expect(response!.status()).toBe(200);
      expect(response!.fromServiceWorker()).toBe(true);
      await expect(page.locator('body')).toHaveText('Installed application shell');
      expect(await page.evaluate(async build => {
        const cache = await caches.open('labcharts-vbuild-' + build);
        return (await cache.match('/app'))!.text();
      }, build)).toBe(before);
      expect(await page.evaluate(async () => {
        const request = indexedDB.open('synthetic-reload-profile', 1);
        const db = await new Promise<IDBDatabase>((resolve, reject) => {request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);});
        const read = db.transaction('records').objectStore('records').get('reading');
        const record: unknown = await new Promise((resolve, reject) => {read.onsuccess = () => resolve(read.result); read.onerror = () => reject(read.error);});
        db.close();
        return {profile: localStorage.getItem('synthetic-retained-profile'), record};
      })).toEqual({profile: 'retained', record: {marker: 'synthetic', value: 7}});
    } finally {
      const closed = new Promise<void>(resolve => server.close(() => resolve()));
      for (const socket of sockets) socket.destroy();
      await closed;
    }
  });
}
