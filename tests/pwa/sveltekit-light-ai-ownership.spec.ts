import path from 'node:path';
import fs from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { createDefaultProfileData } from '../../js/profile.js';
import { startKitServer } from './kit-server.js';
import { installDiscussionFixture } from '../helpers/chat-discussion-fixture.js';
import { installOfflineStartupDiagnostics } from '../helpers/offline-launch-diagnostics.js';
import { readyLightArtifact as ready, openLightArtifact as openLight } from '../helpers/light-artifact-navigation.js';
import type { ProfileData } from '../../types/app-state.js';

// Seed once through the existing legacy-to-canonical storage migration. All later actions use the shipped UI.
function seedProfiles(defaults: ProfileData) {
  if (!['http:', 'https:'].includes(location.protocol)) return;
  localStorage.setItem('labcharts-ai-paused', 'true');
  Object.assign(window, { lightAISwitches: [] });
  addEventListener('labcharts-profile-switched', event => {
    (window as unknown as { lightAISwitches: string[] }).lightAISwitches.push((event as CustomEvent<{ profileId: string }>).detail.profileId);
  });
  if (localStorage.getItem('light-ai-ownership-seeded')) return;
  localStorage.setItem('light-ai-ownership-seeded', 'true');
  localStorage.setItem('labcharts-profiles', JSON.stringify([{ id: 'default', name: 'Owner A', sex: 'male', dob: '1990-01-01', createdAt: 1 }, { id: 'owner-b', name: 'Owner B', sex: 'male', dob: '1990-01-01', createdAt: 2 }]));
  localStorage.setItem('labcharts-active-profile', 'default');
  for (const [id, skin] of [['default', 'II'], ['owner-b', 'V']]) {
    for (const key of ['emptyTour', 'tour']) localStorage.setItem(`labcharts-${id}-${key}`, 'completed');
    localStorage.setItem(`labcharts-${id}-imported`, JSON.stringify({
      ...defaults, contextNotes: `Keep ${id} context`, sunDefaults: { fitzpatrick: skin, completedAt: 1 },
      lightDevices: [], sunSessions: [], deviceSessions: [], lightMeasurements: [], lightAudits: [],
      lightEnvironment: { rooms: [], screens: [] }, lightDailyVerdicts: {}, wearableConnections: {}, agentAccessWearableSeriesDays: 0,
    }));
  }
}
async function readProfiles() {
  const request = indexedDB.open('labcharts-blobs', 1);
  const db = await new Promise<IDBDatabase>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
  try {
    const tx = db.transaction('kv', 'readonly'), a = tx.objectStore('kv').get('labcharts-default-imported'), b = tx.objectStore('kv').get('labcharts-owner-b-imported');
    await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error); tx.onerror = () => reject(tx.error); });
    if (typeof a.result !== 'string' || typeof b.result !== 'string') throw new Error('Missing canonical profile snapshots');
    return { active: localStorage.getItem('labcharts-active-profile'), a: JSON.parse(a.result), b: JSON.parse(b.result), aRaw: a.result };
  } finally { db.close(); }
}
async function switchProfile(page: Page, id: string) {
  await page.evaluate(() => { (window as unknown as { lightAISwitches: string[] }).lightAISwitches = []; });
  await page.locator('#profile-selector button').click();
  await page.locator(`[data-cl-action="select-profile"][data-cl-profile-id="${id}"]`).click();
  await expect.poll(() => page.evaluate(id => (window as unknown as { lightAISwitches: string[] }).lightAISwitches.includes(id), id)).toBe(true);
  await openLight(page);
}

test('static offline Light AI requests retain profile ownership and canonical results through two cold launches', async ({ page, context }) => {
  test.setTimeout(120000); await installDiscussionFixture(context); await installOfflineStartupDiagnostics(context);
  await context.addInitScript(seedProfiles, createDefaultProfileData());
  const errors: string[] = [], csp: string[] = [];
  const observe = (target: Page) => target.on('pageerror', error => errors.push(error.message)); observe(page); context.on('page', observe);
  await context.exposeBinding('lightOwnerCsp', (_, value: string) => csp.push(value));
  await context.addInitScript(() => document.addEventListener('securitypolicyviolation', event => {
    void (window as unknown as { lightOwnerCsp(value: string): Promise<void> }).lightOwnerCsp(event.violatedDirective);
  }));
  const server = await startKitServer(process.env.GETBASED_KIT_ARTIFACT || path.resolve('.local-notes/sveltekit-build'));
  try {
    const loading = [{ phase: 'initial-online', readyMs: await ready(page, server.origin) }];
    server.state.offline = true; const first = Date.now(); await openLight(page);
    await switchProfile(page, 'owner-b'); await switchProfile(page, 'default');
    const before = await page.evaluate(readProfiles);
    await page.evaluate(() => {
      localStorage.setItem('labcharts-ollama', JSON.stringify({ url: 'http://127.0.0.1:11434', model: 'ownership-fixture', mode: 'ollama' }));
      localStorage.setItem('labcharts-ollama-model', 'ownership-fixture'); localStorage.setItem('labcharts-ai-paused', 'false');
      let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
      let requests = 0; const decoded: number[] = []; const original = window.fetch.bind(window);
      Object.assign(window, { lightAIGate: { release, count: () => requests, decoded: () => [...decoded] } });
      window.fetch = async (input, options) => {
        if (!String(input instanceof Request ? input.url : input).includes('/v1/chat/completions')) return original(input, options);
        const number = ++requests; if (number === 1) await gate;
        const response = Response.json({ choices: [{ message: { content: JSON.stringify({ dot: 'green', tip: number === 1 ? 'Late A response' : 'Current B response', detail: 'Owned context', actions: ['Keep local context'] }) } }] });
        const json = response.json.bind(response);
        response.json = async () => { const value: unknown = await json(); decoded.push(number); return value; };
        return response;
      };
    });
    const panel = page.locator('.light-setup-summary [data-light-onboarding-ai]');
    // Re-enter through the profile picker so the actual UI reflects the newly configured provider.
    await switchProfile(page, 'owner-b'); await switchProfile(page, 'default');
    await panel.getByRole('button', { name: 'Generate context', exact: true }).evaluate(button => { Object.assign(window, { retiredAIControl: button.cloneNode(true) }); });
    await panel.getByRole('button', { name: 'Generate context', exact: true }).click();
    await expect(panel).toHaveAttribute('data-ai-state', 'analyzing');
    await expect.poll(() => page.evaluate(() => (window as unknown as { lightAIGate: { count(): number } }).lightAIGate.count())).toBe(1);
    await switchProfile(page, 'owner-b'); await expect(panel).toHaveAttribute('data-ai-state', 'idle');
    await page.evaluate(() => {
      const retired = (window as unknown as { retiredAIControl: HTMLButtonElement }).retiredAIControl;
      retired.id = 'retired-ai-control'; retired.style.cssText = 'position:fixed;top:0;left:0;z-index:30000'; document.body.append(retired);
    });
    const retired = page.locator('#retired-ai-control');
    expect(await retired.getAttribute('data-ai-owner')).not.toBe(await panel.getByRole('button', { name: 'Generate context', exact: true }).getAttribute('data-ai-owner'));
    await retired.click(); await retired.evaluate(element => element.remove());
    expect(await page.evaluate(() => (window as unknown as { lightAIGate: { count(): number } }).lightAIGate.count())).toBe(1);
    await panel.getByRole('button', { name: 'Generate context', exact: true }).click();
    await expect(panel.locator('.sun-detail-ai-tip')).toContainText('Current B response');
    await page.evaluate(() => (window as unknown as { lightAIGate: { release(): void } }).lightAIGate.release());
    await expect.poll(() => page.evaluate(() => (window as unknown as { lightAIGate: { decoded(): number[] } }).lightAIGate.decoded().sort())).toEqual([1, 2]);
    // Reload both profiles through the UI after the late response was consumed, then verify canonical snapshots.
    await switchProfile(page, 'default'); await expect(panel).toHaveAttribute('data-ai-state', 'idle');
    await switchProfile(page, 'owner-b');
    await expect(panel.locator('.sun-detail-ai-tip')).toContainText('Current B response');
    const saved = await page.evaluate(readProfiles);
    expect(saved.active).toBe('owner-b'); expect(saved.aRaw).toBe(before.aRaw);
    expect(saved.b.sunDefaults.aiAnalysis).toMatchObject({ status: 'ok', tip: 'Current B response' });
    expect(saved.b).toEqual({ ...before.b, sunDefaults: saved.b.sunDefaults });
    loading.push({ phase: 'first-offline-profile-ownership', readyMs: Date.now() - first }); await page.close();
    for (let launch = 0; launch < 2; launch++) {
      const cold = await context.newPage(); loading.push({ phase: `offline-cold-${launch + 1}`, readyMs: await ready(cold, server.origin) }); await openLight(cold);
      await expect(cold.locator('[data-light-onboarding-ai]')).toHaveAttribute('data-ai-state', 'ok');
      await expect(cold.locator('[data-light-onboarding-ai] .sun-detail-ai-tip')).toContainText('Current B response');
      expect(await cold.evaluate(readProfiles)).toEqual(saved); await cold.close();
    }
    expect(errors).toEqual([]); expect(csp).toEqual([]);
    await fs.writeFile(test.info().outputPath('light-ai-ownership-loading.json'), JSON.stringify(loading, null, 2));
  } finally { await server.close(); }
});
