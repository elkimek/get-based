import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium, expect, type BrowserContext, type Page } from '@playwright/test';
import { headlessBrowserEnvironment } from '../../scripts/headless-browser-environment.js';

type ZoomSettings = { mode?: string; scope?: string; defaultZoomFactor?: number };
interface ExtensionChrome {
  tabs: {
    query(query: Record<string, never>): Promise<{id?: number; url?: string}[]>;
    setZoomSettings(id: number, settings: ZoomSettings): Promise<void>;
    setZoom(id: number, factor: number): Promise<void>;
    getZoom(id: number): Promise<number>;
    getZoomSettings(id: number): Promise<ZoomSettings>;
  };
}
export interface TabZoomMetrics {
  innerWidth: number; innerHeight: number; outerWidth: number; outerHeight: number;
  dpr: number; cssZoom: string; visualScale: number; documentWidth: number;
}
export async function tabZoomMetrics(page: Page): Promise<TabZoomMetrics> {
  return page.evaluate(() => ({innerWidth, innerHeight, outerWidth, outerHeight,
    dpr: devicePixelRatio, cssZoom: getComputedStyle(document.documentElement).zoom,
    visualScale: visualViewport?.scale ?? 1, documentWidth: document.documentElement.scrollWidth}));
}

/** Real automatic browser tab zoom, using an isolated headless Chromium extension. */
export async function launchTabZoom(parent: string): Promise<{
  context: BrowserContext; page: Page;
  setZoom(factor: 1 | 2 | 4): Promise<{factor: number; settings: ZoomSettings; metrics: TabZoomMetrics}>;
  close(): Promise<void>;
}> {
  await fs.mkdir(parent, {recursive: true});
  const directory = await fs.mkdtemp(path.join(parent, 'tab-zoom-'));
  const extension = path.join(directory, 'extension');
  await fs.mkdir(extension);
  await fs.writeFile(path.join(extension, 'manifest.json'), JSON.stringify({manifest_version: 3,
    name: 'getbased isolated browser zoom acceptance', version: '1.0', permissions: ['tabs'],
    background: {service_worker: 'background.js'}}));
  await fs.writeFile(path.join(extension, 'background.js'), 'chrome.runtime.onInstalled.addListener(() => {});\n');
  let context: BrowserContext | undefined;
  try {
    context = await chromium.launchPersistentContext(path.join(directory, 'profile'), {
      headless: true, channel: 'chromium', viewport: null, serviceWorkers: 'block',
      env: headlessBrowserEnvironment(path.join(directory, 'runtime')),
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,900',
        `--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
    });
    const owned = context;
    let worker = owned.serviceWorkers().find(item => item.url().startsWith('chrome-extension://'));
    worker ??= await owned.waitForEvent('serviceworker', {predicate: item => item.url().startsWith('chrome-extension://')});
    const extensionWorker = worker;
    const page = owned.pages()[0] ?? await owned.newPage();
    return {context: owned, page,
      async setZoom(factor) {
        const accepted = await extensionWorker.evaluate(async ({url, factor}) => {
          const chrome = (globalThis as unknown as {chrome: ExtensionChrome}).chrome;
          const matching = (await chrome.tabs.query({})).filter(tab => tab.url === url);
          if (matching.length !== 1 || typeof matching[0]?.id !== 'number') throw new Error('Expected exactly one owned browser tab');
          const id = matching[0].id;
          await chrome.tabs.setZoomSettings(id, {mode: 'automatic', scope: 'per-tab'});
          await chrome.tabs.setZoom(id, factor);
          return {factor: await chrome.tabs.getZoom(id), settings: await chrome.tabs.getZoomSettings(id)};
        }, {url: page.url(), factor});
        // Chrome derives zoom from logarithmic levels (400% can report 3.9999999999999996).
        expect(Math.abs(accepted.factor - factor)).toBeLessThanOrEqual(2 * Number.EPSILON * factor);
        expect(accepted.settings).toMatchObject({mode: 'automatic', scope: 'per-tab'});
        await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
        const metrics = await tabZoomMetrics(page);
        expect(metrics.cssZoom).toBe('1'); expect(metrics.visualScale).toBe(1);
        return {...accepted, metrics};
      },
      async close() {try {await owned.close();} finally {await fs.rm(directory, {recursive: true, force: true});}},
    };
  } catch (error) {
    try {await context?.close();} finally {await fs.rm(directory, {recursive: true, force: true});}
    throw error;
  }
}
