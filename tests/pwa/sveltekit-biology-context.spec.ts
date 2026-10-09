import path from 'node:path';
import fs from 'node:fs/promises';
import {expect, test, type Page} from '@playwright/test';
import {createDefaultProfileData, migrateProfileData} from '../../js/profile.js';
import type {ProfileData} from '../../types/app-state.js';
import {startKitServer} from './kit-server.js';
import {installDiscussionFixture} from '../helpers/chat-discussion-fixture.js';
import {installOfflineStartupDiagnostics} from '../helpers/offline-launch-diagnostics.js';
import {readComparisonAcceptanceProfile} from '../helpers/nutrition-comparison-fixture.js';
import {readyLightArtifact as ready} from '../helpers/light-artifact-navigation.js';

interface StoredProfile {
  diagnoses: {conditions: unknown[]; familyHistory: unknown[]; note: string; flags: Record<string, boolean>};
  biologyScoreContextAI: {summary: string; suggestions: {flag: string}[]; dismissed?: string[]};
  [key: string]: unknown;
}
const readProfile = (page: Page) => page.evaluate(readComparisonAcceptanceProfile) as Promise<StoredProfile>;
async function openScores(page: Page) {
  const menu = page.getByRole('button', {name: 'Menu', exact: true});
  if (await menu.isVisible()) await menu.click();
  await page.locator('[data-nav-action="navigate"][data-nav-route="biology-scores"]').click();
  await expect(page.locator('.biology-score-compact')).toHaveCount(18);
}
async function openContext(page: Page) {
  const section = page.locator('.biology-context-review-details[data-biology-context-view]');
  if (await section.getAttribute('open') === null) {
    await section.locator(':scope > summary').focus();
    await page.keyboard.press('Enter');
  }
  await expect(section).toHaveAttribute('open', '');
  return section;
}
async function inspectSaved(page: Page, female: boolean) {
  await openScores(page);
  const section = await openContext(page);
  await expect(section.locator('input[data-biology-context-flag]')).toHaveCount(female ? 5 : 4);
  await expect(section.locator('[data-biology-context-flag="postmenopause"]')).toHaveCount(female ? 1 : 0);
  await expect(section.locator('[data-biology-context-flag="lowMuscleMass"]')).toBeChecked();
  await expect(section.locator('[data-biology-context-flag="intenseTrainingRecent"]')).toBeChecked();
  await expect(section.locator('.biology-context-suggestion')).toHaveCount(1);
  await expect(section.locator('.biology-context-ai-summary')).toHaveText('Stored context <review>.');
  await expect(section.locator('[data-context-flag="hormoneTherapy"]')).toHaveCount(0);
  await expect(section.locator('script,img,[onerror]')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
}
for (const sex of ['male', 'female'] as const) test(`static ${sex} Biology context keyboard writes preserve unrelated records through offline first use and closed-client launches`, async ({page, context}) => {
  test.setTimeout(120000);
  await installDiscussionFixture(context);
  await installOfflineStartupDiagnostics(context);
  const demo = JSON.parse(await fs.readFile(`data/demo-${sex}.json`, 'utf8')) as ProfileData;
  // Prepare a current-schema fixture through the existing deterministic owner.
  // The context writes must then preserve every unrelated committed field.
  const profile = migrateProfileData({
    ...createDefaultProfileData(), entries: demo.entries, refOverrides: demo.refOverrides,
    profile: {firstName: 'Alex', age: 38}, markerNotes: {'thyroid.tsh': 'Preserve unrelated note'},
    nutritionMeals: [], sunDefaults: {fitzpatrick: 'II', completedAt: 1}, contextNotes: 'Preserve unrelated context',
    diagnoses: {conditions: [], familyHistory: [], note: 'Keep diagnosis note', flags: {}},
    biologyScoreContextAI: {summary: 'Stored context <review>.', updatedAt: 1786104000000, suggestions: [
      {flag: 'lowMuscleMass', confidence: 'high', reason: 'Stored literal <evidence>.'},
      {flag: 'hormoneTherapy', confidence: 'medium', reason: 'Keep profile context.'},
      {flag: 'acuteIllnessNearDraw', confidence: 'low', reason: 'Keep remaining suggestion.'},
    ]},
  });
  await context.addInitScript(({profile, sex}) => {
    if (!['http:', 'https:'].includes(location.protocol)) return;
    localStorage.setItem('labcharts-ai-paused', 'true');
    if (localStorage.getItem('biology-context-seeded')) return;
    localStorage.setItem('biology-context-seeded', '1');
    localStorage.setItem('labcharts-profiles', JSON.stringify([{id: 'default', name: 'Alex', sex, dob: '1987-11-22', createdAt: 1}]));
    localStorage.setItem('labcharts-active-profile', 'default');
    for (const key of ['tour', 'emptyTour']) localStorage.setItem(`labcharts-default-${key}`, 'completed');
    localStorage.setItem('labcharts-default-imported', JSON.stringify(profile));
  }, {profile, sex});
  const errors: string[] = [], csp: string[] = [];
  const observe = (p: Page) => p.on('pageerror', error => errors.push(error.message));
  observe(page); context.on('page', observe);
  await context.exposeBinding('biologyContextCsp', (_, value: string) => csp.push(value));
  await context.addInitScript(() => document.addEventListener('securitypolicyviolation', event => {
    void (window as unknown as {biologyContextCsp(value: string): Promise<void>}).biologyContextCsp(event.violatedDirective);
  }));
  const server = await startKitServer(process.env.GETBASED_KIT_ARTIFACT || path.resolve('.local-notes/sveltekit-build'));
  try {
    await page.clock.setFixedTime(new Date('2026-08-07T12:00:00Z'));
    const loading = [{phase: 'initial-online', readyMs: await ready(page, server.origin)}];
    const before = await readProfile(page);
    server.state.offline = true;
    await openScores(page);
    let section = await openContext(page);
    await expect(section.locator('input[data-biology-context-flag]')).toHaveCount(sex === 'female' ? 5 : 4);
    await expect(section.locator('.biology-context-suggestion')).toHaveCount(3);
    await section.locator('[data-biology-context-flag="intenseTrainingRecent"]').focus();
    await page.keyboard.press('Space');
    await expect.poll(async () => (await readProfile(page)).diagnoses.flags.intenseTrainingRecent).toBe(true);
    section = await openContext(page);
    await section.locator('[data-biology-score-action="apply-context-ai"][data-context-flag="lowMuscleMass"]').focus();
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await readProfile(page)).diagnoses.flags.lowMuscleMass).toBe(true);
    section = await openContext(page);
    await section.locator('[data-biology-score-action="dismiss-context-ai"][data-context-flag="hormoneTherapy"]').focus();
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await readProfile(page)).biologyScoreContextAI.dismissed).toEqual(['hormoneTherapy']);
    const accepted = await readProfile(page);
    expect(accepted.diagnoses).toEqual({...before.diagnoses, flags: {intenseTrainingRecent: true, lowMuscleMass: true}});
    expect(accepted.biologyScoreContextAI.suggestions.map(item => item.flag)).toEqual(['acuteIllnessNearDraw']);
    expect(accepted.biologyScoreContextAI.summary).toBe('Stored context <review>.');
    const unrelated = ({diagnoses: _flags, biologyScoreContextAI: _review, ...rest}: StoredProfile) => rest;
    expect(unrelated(accepted)).toEqual(unrelated(before));
    await inspectSaved(page, sex === 'female');
    if (sex === 'female' && test.info().project.name === 'kit-mobile-webkit') await page.screenshot({path: test.info().outputPath('biology-context-mobile.png')});
    await page.close();
    for (let launch = 0; launch < 2; launch++) {
      const cold = await context.newPage();
      await cold.clock.setFixedTime(new Date('2026-08-07T12:00:00Z'));
      loading.push({phase: `offline-cold-${launch + 1}`, readyMs: await ready(cold, server.origin)});
      await inspectSaved(cold, sex === 'female');
      expect(await readProfile(cold)).toEqual(accepted);
      await cold.close();
    }
    expect(errors).toEqual([]); expect(csp).toEqual([]);
    await fs.writeFile(test.info().outputPath('biology-context-loading.json'), JSON.stringify(loading, null, 2));
  } finally { await server.close(); }
});
