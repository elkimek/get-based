import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { BrowserContext, BrowserContextOptions } from '@playwright/test';
import { expect, test as base } from './coverage-fixture.js';
export { expect } from './coverage-fixture.js';

// WebKit private stores expose OPFS but cannot initialize it in the pinned
// runtime. Require real synchronous I/O across a complete browser restart before
// running the unchanged native corpus assertions in a fresh persistent profile.
export const test = base.extend({
  context: async ({ context, playwright, browserName, launchOptions, headless, contextOptions,
    baseURL, viewport, userAgent, deviceScaleFactor, isMobile, hasTouch, serviceWorkers }, use, info) => {
    if (browserName !== 'webkit') { await use(context); return; }
    expect(headless).toBe(true);
    if (!baseURL) throw new Error('Native Knowledge Base acceptance needs its test origin');
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'getbased-native-knowledge-'));
    const device: BrowserContextOptions = { viewport, isMobile, hasTouch, serviceWorkers, baseURL,
      ...(userAgent === undefined ? {} : { userAgent }),
      ...(deviceScaleFactor === undefined ? {} : { deviceScaleFactor }) };
    const launch = () => playwright.webkit.launchPersistentContext(directory, { ...launchOptions, ...contextOptions, ...device, headless: true });
    let owned: BrowserContext | undefined;
    const control: unknown[] = [];
    try {
      for (const write of [true, false]) {
        owned = await launch(); const page = await owned.newPage();
        await page.goto(new URL('/manifest.webmanifest', baseURL).href);
        const result = await page.evaluate(write => new Promise((resolve, reject) => {
          const worker = new Worker(URL.createObjectURL(new Blob([`onmessage=async({data:write})=>{let sync;try{
            const root=await navigator.storage.getDirectory(),dir=await root.getDirectoryHandle('native-control',{create:write}),file=await dir.getFileHandle('proof.bin',{create:write});
            sync=await file.createSyncAccessHandle();if(write){sync.truncate(0);sync.write(new Uint8Array([0,1,127,128,255]),{at:0});sync.flush();}
            const bytes=new Uint8Array(sync.getSize());sync.read(bytes,{at:0});sync.close();sync=undefined;
            if(!write)await root.removeEntry('native-control',{recursive:true});postMessage({bytes:[...bytes]});
          }catch(error){postMessage({error:String(error)})}finally{sync?.close()}}`], { type: 'text/javascript' })));
          const timer = setTimeout(() => { worker.terminate(); reject(new Error('Native OPFS control timed out')); }, 15000);
          worker.onmessage = event => { clearTimeout(timer); worker.terminate(); resolve(event.data); };
          worker.onerror = event => { clearTimeout(timer); worker.terminate(); reject(new Error(event.message)); };
          worker.postMessage(write);
        }), write);
        control.push(result); expect(result).toEqual({ bytes: [0, 1, 127, 128, 255] });
        await page.close();
        if (write) { await owned.close(); owned = undefined; }
      }
      await use(owned!);
    } finally {
      await owned?.close();
      // Only delete our generated profile after its browser has closed.
      await fs.rm(directory, { recursive: true, force: true });
      await info.attach('native-knowledge-storage-control', { body: JSON.stringify({ control, profileRemoved: true }), contentType: 'application/json' });
    }
  },
});
