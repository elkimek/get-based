import path from 'node:path';
import fs from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import type { ProfileData } from '../../types/app-state.js';
import type { BackupSnapshot } from '../../js/backup.js';
import { createDefaultProfileData } from '../../js/profile.js';
import { startKitServer } from './kit-server.js';
import { seedLightPageFixture } from '../helpers/light-page-fixture.js';
import { installDiscussionFixture } from '../helpers/chat-discussion-fixture.js';
import { readComparisonAcceptanceProfile } from '../helpers/nutrition-comparison-fixture.js';
import { installOfflineStartupDiagnostics } from '../helpers/offline-launch-diagnostics.js';
import { readyLightArtifact as ready, openLightArtifact as openLight } from '../helpers/light-artifact-navigation.js';

test('static authored Sun entry and coverage preserve actual session slices, offline persistence and backup', async ({ page, context }) => {
  test.setTimeout(120000);
  await installOfflineStartupDiagnostics(context); await installDiscussionFixture(context);
  await context.addInitScript(() => { if (['http:','https:'].includes(location.protocol)) localStorage.setItem('labcharts-ai-paused','true'); });
  await context.addInitScript(seedLightPageFixture, { defaults: createDefaultProfileData(), sunDefaults: { coords: { lat: 50.1, lon: 14.4 } } });
  await context.route('https://**', route => route.abort());
  const errors: string[] = [], csp: string[] = [];
  const observe = (target: Page) => target.on('pageerror', error => errors.push(error.message)); observe(page); context.on('page',observe);
  await context.exposeBinding('sunEntryCsp', (_, value: string) => csp.push(value));
  await context.addInitScript(() => document.addEventListener('securitypolicyviolation', event => { void (window as unknown as { sunEntryCsp(value: string): Promise<void> }).sunEntryCsp(event.violatedDirective); }));
  const server = await startKitServer(process.env.GETBASED_KIT_ARTIFACT || path.resolve('.local-notes/sveltekit-build'));
  try {
    const loading = [{ phase: 'online-install', readyMs: await ready(page,server.origin) }];
    const before = await page.evaluate(readComparisonAcceptanceProfile) as ProfileData;
    server.state.offline = true; await openLight(page);
    await page.getByRole('button',{name:'Start sun session',exact:true}).click();
    const start = page.getByRole('dialog',{name:'Start sun session',exact:true});
    await expect(start).toHaveAttribute('data-light-session-presentation','');
    await start.locator('#start-confirm').focus(); await page.keyboard.press('Enter');
    await expect(start.locator('#sun-start-hint')).toContainText('Tap at least one region');
    expect(await page.evaluate(readComparisonAcceptanceProfile)).toEqual(before);
    await start.locator('[data-region="breast-chest"]').first().focus(); await page.keyboard.press('Enter');
    await expect(start.locator('svg[data-sun-body-picker]')).toHaveAttribute('data-selection-overlay','ready');
    await expect(start.locator('[data-region="breast-chest"]').first()).toBeFocused();
    await expect(start.locator('image[href^="blob:"]')).toHaveCount(2);
    await start.locator('summary').focus(); await page.keyboard.press('Enter'); await expect(start.locator('details')).toHaveAttribute('open','');
    await start.locator('#start-posture').selectOption('lying-prone'); await start.locator('#start-surface').selectOption('snow');
    await start.locator('#start-eye-mode').selectOption('direct'); await start.locator('#start-lens-tint').selectOption('amber'); await start.locator('.toggle-switch').click(); await expect(start.locator('#start-glass')).toBeChecked();
    await start.screenshot({path:test.info().outputPath('actual-sun-start-offline.png')});
    await start.locator('#start-confirm').focus(); await page.keyboard.press('Space'); await expect(start).not.toBeVisible();
    let snapshot = await page.evaluate(readComparisonAcceptanceProfile) as ProfileData;
    expect(snapshot.sunSessions).toHaveLength(1); const initial = snapshot.sunSessions![0]!;
    expect(initial).toMatchObject({ endedAt:null, location:{lat:50.1,lon:14.4,source:'profile-precise'}, bodyExposure:{regions:['breast-chest'],fraction:0.06,glassBetween:true,rotatedSides:false}, eyeExposure:{mode:'glass-window',lensTint:'amber'},posture:'lying-prone',surfaceAlbedo:'snow' });
    expect(snapshot).toEqual({...before,sunSessions:[initial]});
    const card = page.locator('.light-active-session-pinned .light-session-sun[data-id="'+initial.id+'"]');
    await expect(card.locator('.sun-session-vitd')).not.toContainText('Calculating…');
    const elapsed = await card.locator('.sun-session-duration').textContent(); await expect.poll(()=>card.locator('.sun-session-duration').textContent()).not.toBe(elapsed);
    await card.getByRole('button',{name:'Change coverage',exact:true}).focus(); await page.keyboard.press('Enter');
    const coverage = page.getByRole('dialog',{name:'Change coverage',exact:true});
    await expect(coverage).toHaveAttribute('data-light-session-presentation',''); await expect(coverage.locator('#sun-coverage-hint')).toContainText('Upper chest');
    await coverage.locator('[data-region="breast-chest"]').first().focus(); await page.keyboard.press('Enter');
    await expect(coverage.locator('#sun-coverage-hint')).toContainText('fully clothed');
    await coverage.locator('[data-region="face"]').first().focus(); await page.keyboard.press('Enter');
    await expect(coverage.locator('#sun-coverage-hint')).toContainText('Face');
    await expect(coverage.locator('svg[data-sun-body-picker]')).toHaveAttribute('data-selection-overlay','ready');
    await expect(coverage.locator('[data-region="face"]').first()).toBeFocused();
    await coverage.screenshot({path:test.info().outputPath('actual-sun-coverage-offline.png')});
    await coverage.locator('#coverage-confirm').focus(); await page.keyboard.press('Space'); await expect(coverage).not.toBeVisible();
    snapshot = await page.evaluate(readComparisonAcceptanceProfile) as ProfileData;
    const changed = snapshot.sunSessions![0]!;
    expect(changed).toMatchObject({ id:initial.id,startedAt:initial.startedAt,endedAt:null,bodyExposure:{regions:['face'],fraction:0.04,glassBetween:true,rotatedSides:false},eyeExposure:initial.eyeExposure,posture:'lying-prone',surfaceAlbedo:'snow' });
    expect(changed.exposureSegments).toHaveLength(1); expect(changed.exposureSegments![0]).toMatchObject({bodyExposure:{regions:['breast-chest'],fraction:0.06,glassBetween:true}});
    expect(snapshot).toEqual({...before,sunSessions:[changed]});
    // The first tick after coverage changes invalidates the old rate and
    // starts an asynchronous snapshot. Wait for that tick and its ready
    // readout before stopping, so both real exposure slices are exercised.
    const changedElapsed = await card.locator('.sun-session-duration').textContent(); await expect.poll(()=>card.locator('.sun-session-duration').textContent()).not.toBe(changedElapsed);
    await expect(card.locator('.sun-session-vitd')).not.toContainText('Calculating…');
    await card.getByRole('button',{name:'Stop & save',exact:true}).focus(); await page.keyboard.press('Space'); await expect(card).not.toBeVisible();
    snapshot = await page.evaluate(readComparisonAcceptanceProfile) as ProfileData; const saved = snapshot.sunSessions![0]!;
    expect(saved).toMatchObject({id:initial.id,startedAt:initial.startedAt,bodyExposure:changed.bodyExposure,eyeExposure:{mode:'glass-window',lensTint:'amber'},posture:'lying-prone',surfaceAlbedo:'snow',calculationStatus:'computed'});
    const slices = saved.exposureSegments as {startedAt:number;endedAt:number;durationMin:number;bodyExposure:{regions:string[]}}[];
    expect(slices).toHaveLength(2); expect(slices[0]!.bodyExposure.regions).toEqual(['breast-chest']); expect(slices[1]!.bodyExposure.regions).toEqual(['face']);
    expect(slices[0]!.endedAt).toBeLessThanOrEqual(slices[1]!.startedAt); expect(slices[1]!.endedAt).toBeLessThanOrEqual(saved.endedAt!);
    expect(saved.durationMin).toBeCloseTo(slices.reduce((sum,slice)=>sum+slice.durationMin,0),10);
    expect(snapshot).toEqual({...before,sunSessions:[saved]});
    await page.close();
    for(let launch=0;launch<2;launch++) {
      const cold = await context.newPage(); loading.push({phase:`offline-cold-${launch+1}`,readyMs:await ready(cold,server.origin)}); await openLight(cold);
      await expect(cold.locator('[data-light-history-row]')).toHaveCount(1); expect(await cold.evaluate(readComparisonAcceptanceProfile)).toEqual(snapshot);
      if(launch===1) {
        await cold.locator('[data-shell-action="open-settings"]').click(); await cold.locator('#settings-nav-data').click();
        const downloading = cold.waitForEvent('download'); await cold.locator('#backup-section').getByRole('button',{name:'Download Backup',exact:true}).click();
        const backup = JSON.parse(await fs.readFile((await(await downloading).path())!,'utf8')) as BackupSnapshot;
        expect(backup).toMatchObject({format:'labcharts-backup',encrypted:false}); expect(JSON.parse(backup.profiles.find(profile=>profile.keys.imported)!.keys.imported!)).toEqual(snapshot);
      }
      await cold.close();
    }
    await test.info().attach('sun-entry-loading-observations',{body:JSON.stringify(loading,null,2),contentType:'application/json'});
    expect(errors).toEqual([]); expect(csp).toEqual([]);
  } finally { await server.close(); }
});
