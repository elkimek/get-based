import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type {AddressInfo} from 'node:net';
import type {BrowserContext, BrowserContextOptions, BrowserType, LaunchOptions, Page, TestInfo} from '@playwright/test';

const linuxRestarts = new WeakMap<BrowserContext, () => Promise<BrowserContext>>();

/** WPE needs a new process after the last persistent view closes. The origin
 * stays stopped and all browser state must survive the restart on disk. */
export async function openColdKnowledgePage(context: BrowserContext, configure: (fresh: BrowserContext) => Promise<void>): Promise<Page> {
  assert.equal(context.pages().length, 0, 'Every client must close before cold launch');
  const restart = linuxRestarts.get(context);
  if (!restart) return context.newPage();
  const fresh = await restart();
  await configure(fresh);
  return fresh.newPage();
}

const proofBytes = [0, 1, 2, 3, 127, 128, 254, 255];
const workerSource = `self.onmessage = async ({data}) => {
  let phase = 'get-directory', sync;
  const result = {action: data.action, storage: typeof navigator.storage, getDirectory: typeof navigator.storage?.getDirectory};
  try {
    const root = await navigator.storage.getDirectory();
    phase = 'get-proof-directory';
    const create = data.action !== 'confirm-and-delete';
    const directory = await root.getDirectoryHandle('getbased-native-opfs-proof', {create});
    phase = 'get-proof-file';
    const file = await directory.getFileHandle('proof.bin', {create});
    result.createSyncAccessHandle = typeof file.createSyncAccessHandle;
    phase = 'create-sync-access-handle'; sync = await file.createSyncAccessHandle();
    if (create) {
      phase = 'truncate'; sync.truncate(0);
      phase = 'write'; result.written = sync.write(new Uint8Array(data.bytes), {at: 0});
      phase = 'flush'; sync.flush();
    }
    phase = 'read';
    result.size = sync.getSize();
    if (result.size !== data.bytes.length) throw new Error('Unexpected native OPFS proof length');
    const bytes = new Uint8Array(result.size); result.read = sync.read(bytes, {at: 0}); result.bytes = [...bytes];
    phase = 'close'; sync.close(); sync = undefined;
    if (data.action !== 'write') {
      phase = 'delete'; await root.removeEntry('getbased-native-opfs-proof', {recursive: true}); result.deleted = true;
    }
    self.postMessage({...result, status: 'passed', phase: 'complete'});
  } catch (error) {
    self.postMessage({...result, status: 'failed', phase, name: error.name, message: error.message});
  } finally { if (sync) sync.close(); }
};`;
interface NativeProof {
  window: {status: string; storage: string; getDirectory: string; name?: string; message?: string};
  worker: {status: string; phase: string; bytes?: number[]; written?: number; read?: number; size?: number; deleted?: boolean; name?: string; message?: string};
}

/** Native WebKit OPFS needs an on-disk data store in the pinned browser build.
 * Qualify real sync writes across a browser restart, then use that same isolated
 * persistent context for the unchanged KB acceptance. No application API is mocked. */
export async function withPersistentWebKitOpfsContext(
  {browserType, privateContext, launchOptions, contextOptions, info}: {
    browserType: BrowserType; privateContext: BrowserContext; launchOptions: LaunchOptions;
    contextOptions: BrowserContextOptions; info: TestInfo;
  },
  use: (context: BrowserContext) => Promise<void>,
): Promise<void> {
  assert(['darwin', 'linux'].includes(process.platform), 'Persistent native OPFS context requires macOS or Linux');
  const receiptName = process.platform === 'darwin' ? 'native-cocoa-opfs-control' : 'linux-webkit-opfs-control';
  assert.equal(browserType.name(), 'webkit', 'Native OPFS acceptance requires WebKit');
  assert(['kit-webkit', 'kit-mobile-webkit'].includes(info.project.name), 'Existing native WebKit project identity');
  assert.notEqual(launchOptions.headless, false, 'Native WebKit acceptance stays headless');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'getbased-webkit-opfs-'));
  const receipt: {status: string; project: string; platform: string; private?: unknown; persistentWrite?: NativeProof; persistentColdRead?: NativeProof; limitation: string; cleanup?: {errors: string[]; ownedProfileRemoved: boolean}} = {
    status: 'incomplete', project: info.project.name, platform: process.platform,
    limitation: 'Real synthetic native Worker/OPFS control. Private-store behavior is diagnostic; persistent write/flush/read and durability after full browser restart are required.',
  };
  const server = http.createServer((request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    if (request.url === '/worker.js') {response.setHeader('Content-Type', 'text/javascript'); response.end(workerSource);}
    else if (request.url === '/') {response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><title>Native OPFS qualification</title>');}
    else {response.writeHead(404); response.end();}
  });
  let context: BrowserContext | undefined, primaryFailure = false;
  try {
    await new Promise<void>((resolve, reject) => {server.once('error', reject); server.listen(0, '127.0.0.1', resolve);});
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const probe = async (target: BrowserContext, action: 'private-check' | 'write' | 'confirm-and-delete'): Promise<NativeProof> => {
      const page = await target.newPage();
      try {
        await page.goto(origin, {timeout: 15000});
        const window = await page.evaluate(async () => {
          const result = {storage: typeof navigator.storage, getDirectory: typeof navigator.storage?.getDirectory};
          let timer: ReturnType<typeof setTimeout> | undefined;
          try {
            await Promise.race([navigator.storage.getDirectory(), new Promise<never>((_, reject) => {timer = setTimeout(() => reject(new Error('Native Window OPFS control exceeded five seconds')), 5000);})]);
            return {...result, status: 'passed'};
          } catch (error) {return {...result, status: 'failed', name: error instanceof Error ? error.name : '', message: String(error)};}
          finally {if (timer !== undefined) clearTimeout(timer);}
        });
        const worker = await page.evaluate(({action, bytes}) => new Promise<NativeProof['worker']>((resolve, reject) => {
          const worker = new Worker('/worker.js', {type: 'module'});
          const timer = setTimeout(() => {worker.terminate(); reject(new Error('Native Worker OPFS control exceeded fifteen seconds'));}, 15000);
          worker.onmessage = event => {clearTimeout(timer); worker.terminate(); resolve(event.data as NativeProof['worker']);};
          worker.onerror = event => {clearTimeout(timer); worker.terminate(); reject(new Error(event.message));};
          worker.postMessage({action, bytes});
        }), {action, bytes: proofBytes});
        return {window, worker};
      } finally {await page.close();}
    };
    try {receipt.private = await probe(privateContext, 'private-check');}
    catch (error) {receipt.private = {diagnosticError: String(error)};}
    const linux = process.platform === 'linux';
    const env = linux ? {...launchOptions.env, XDG_DATA_HOME: path.join(directory, 'data'), XDG_CACHE_HOME: path.join(directory, 'cache'), XDG_CONFIG_HOME: path.join(directory, 'config')} : launchOptions.env;
    const launch = () => browserType.launchPersistentContext(linux ? path.join(directory, 'profile') : directory, {...launchOptions, ...contextOptions, ...(env ? {env} : {}), headless: true});
    context = await launch();
    receipt.persistentWrite = await probe(context, 'write');
    assert.equal(receipt.persistentWrite.window.status, 'passed', 'Persistent native Window getDirectory');
    assert.equal(receipt.persistentWrite.worker.status, 'passed', JSON.stringify(receipt.persistentWrite.worker));
    assert.equal(receipt.persistentWrite.worker.written, proofBytes.length, 'Native sync write count');
    assert.equal(receipt.persistentWrite.worker.read, proofBytes.length, 'Native sync read count');
    assert.deepEqual(receipt.persistentWrite.worker.bytes, proofBytes, 'Exact native sync file bytes');
    await context.close(); context = undefined;
    context = await launch();
    receipt.persistentColdRead = await probe(context, 'confirm-and-delete');
    assert.equal(receipt.persistentColdRead.window.status, 'passed', 'Restarted native Window getDirectory');
    assert.equal(receipt.persistentColdRead.worker.status, 'passed', JSON.stringify(receipt.persistentColdRead.worker));
    assert.equal(receipt.persistentColdRead.worker.read, proofBytes.length, 'Restarted native sync read count');
    assert.deepEqual(receipt.persistentColdRead.worker.bytes, proofBytes, 'Exact native bytes survive a complete browser restart');
    assert.equal(receipt.persistentColdRead.worker.deleted, true, 'Owned native proof file and directory deleted');
    receipt.status = 'passed';
    if (linux) {
      const restart = async () => {
        await context!.close();
        context = await launch();
        linuxRestarts.set(context, restart);
        return context;
      };
      linuxRestarts.set(context, restart);
    }
    await use(context);
  } catch (error) {
    primaryFailure = true;
    throw error;
  } finally {
    const cleanupErrors: string[] = [];
    let contextClosed = !context, ownedProfileRemoved = false;
    const clean = async (label: string, action: () => Promise<void>) => {
      try {await action();} catch (error) {cleanupErrors.push(label+': '+String(error));}
    };
    await clean('close owned persistent context', async () => {await context?.close(); contextClosed = true;});
    await clean('close synthetic control server', () => new Promise<void>((resolve, reject) => {
      if (!server.listening) {resolve(); return;}
      server.close(error => error ? reject(error) : resolve()); server.closeAllConnections();
    }));
    // Never remove a profile while its browser may still hold it open.
    if (contextClosed) await clean('remove owned temporary profile', async () => {
      await fs.rm(directory, {recursive: true, force: true}); ownedProfileRemoved = true;
    });
    else cleanupErrors.push('Owned temporary profile retained because browser closure failed');
    receipt.cleanup = {errors: cleanupErrors, ownedProfileRemoved};
    await clean('attach native control receipt', async () => {
      const output = info.outputPath(receiptName + '.json');
      await fs.writeFile(output, JSON.stringify(receipt, null, 2)+'\n');
      await info.attach(receiptName, {path: output, contentType: 'application/json'});
    });
    // Fixture use may resolve after an already recorded acceptance failure.
    // Preserve that original error; cleanup still fails a successful case closed.
    if (cleanupErrors.length && !primaryFailure && info.status === 'passed') throw new Error('Native WebKit cleanup failed: '+cleanupErrors.join('; '));
  }
}
