import {expect, test} from './coverage-fixture.js';
import {createDefaultProfileData} from '../../js/profile.js';
import {readFileSync} from 'node:fs';
import {prepareDemoBiologyData} from '../../js/demo-biology-data.js';
import {upgradeMenstrualCycleProfile} from '../../js/cycle-summary.js';

test.beforeEach(async ({page}) => {
  await page.addInitScript(() => {
    for (const name of ['emptyTour', 'tour']) localStorage.setItem(`labcharts-default-${name}`, 'completed');
    // Consent and onboarding have their own suites; their delayed banners must
    // not cover the measurement controls in these returning-user workflows.
    localStorage.setItem('labcharts-analytics-consent-seen', '1');
  });
});

test('Waist is an actual Body biometric with persistent method-specific readings', async ({page}) => {
  const seed = createDefaultProfileData();
  await page.addInitScript(seed => {
    localStorage.setItem('labcharts-profiles', JSON.stringify([{id: 'default', name: 'Synthetic waist profile',height:172,heightUnit:'cm'}]));
    localStorage.setItem('labcharts-active-profile', 'default');
    if (!localStorage.getItem('labcharts-default-imported')) localStorage.setItem('labcharts-default-imported', JSON.stringify(seed));
    localStorage.setItem('labcharts-default-dashboardBiometricMetricsV1', JSON.stringify(['weight', 'waist', 'bp_systolic', 'rhr']));
    for (const name of ['emptyTour', 'tour']) localStorage.setItem(`labcharts-default-${name}`, 'completed');
  }, seed);
  await page.goto('/app');
  await page.evaluate(async () => {
    (await import('/js/chat-panel.js')).closeChatPanel();
    await (await import('/js/views.js')).navigate('body');
  });
  const waist = () => page.locator('[data-dashboard-widget-id="waist"][data-dashboard-widget-action^="open-biometric"]');
  await expect(waist()).toBeVisible();
  await waist().click();
  const editor = page.locator('[data-body-measurement-view]');
  await expect(editor).toBeVisible();
  await editor.getByRole('button', {name: 'Seated', exact: true}).click();
  await editor.getByLabel('Waist in cm').fill('86');
  await editor.getByLabel('Hips in cm').fill('100');
  await expect(editor).toContainText('Waist-to-hip 0.86');
  await expect(editor.locator('[data-draft-waist-height-ratio]')).toContainText('Waist-to-height 0.50');
  await editor.getByRole('button', {name: 'Save measurement'}).click();
  await expect(editor).toHaveCount(0);
  await expect(waist()).toContainText('86.0');
  await expect(waist()).toContainText('Seated');
  await expect(waist()).toContainText('Waist/height 0.50');
  await page.reload();
  await page.evaluate(async () => {(await import('/js/chat-panel.js')).closeChatPanel(); await (await import('/js/views.js')).navigate('body');});
  await waist().click();
  await expect(editor.locator('[data-latest-waist-height-ratio]')).toContainText('Waist-to-height 0.50');
  await expect(editor.getByRole('button', {name: 'Seated', exact: true})).toHaveAttribute('aria-pressed', 'true');
  await editor.getByRole('button', {name: 'Lying down', exact: true}).click();
  await editor.getByLabel('Waist in cm').fill('82');
  await editor.getByRole('button', {name: 'Save measurement'}).click();
  await expect(editor).toHaveCount(0);
  const records = await page.evaluate(async () => {
    const {state} = await import('/js/state.js');
    return (await import('/js/body-measurement-model.js')).bodyMeasurementRecords(state.importedData, 'waist');
  });
  expect(records.map(row => row.position).sort()).toEqual(['seated', 'supine']);
  await waist().click();
  await expect(editor.locator('svg')).toHaveCount(0); // Two methods never become a two-point trend.
  await editor.locator('summary').click();
  await expect(editor).toContainText('History (2)');
  await expect(editor.locator('[data-history-waist-height-ratio]')).toHaveCount(2);
  await expect(editor.locator('details')).toContainText('current profile height');
  await editor.getByRole('button', {name: 'Close body measurements'}).click();
  await expect(editor).toHaveCount(0);
});

test('measurement editor fits a phone and supports the separate SAD caliper entry', async ({page}) => {
  await page.setViewportSize({width: 390, height: 844});
  await page.goto('/app');
  await page.evaluate(async () => {(await import('/js/chat-panel.js')).closeChatPanel(); await (await import('/js/body-measurement-loader.js')).openBodyMeasurement('abdominal_depth');});
  const editor = page.locator('[data-body-measurement-view]');
  await expect(editor).toBeVisible();
  await expect(editor).toContainText('abdominal caliper');
  await expect(editor).not.toContainText('Waist-to-height');
  await expect(editor.getByRole('button', {name: 'Standing', exact: true})).toHaveCount(0);
  const overflow = await editor.evaluate(root => root.getBoundingClientRect().right > window.innerWidth || root.scrollWidth > root.clientWidth + 1);
  expect(overflow).toBe(false);
  await editor.getByLabel('Abdominal depth in cm').fill('21');
  await editor.getByRole('button', {name: 'Save measurement'}).click();
  await expect(editor).toHaveCount(0);
  const records = await page.evaluate(async () => (await import('/js/body-measurement-model.js')).bodyMeasurementRecords((await import('/js/state.js')).state.importedData, 'abdominal_depth'));
  expect(records[0]).toMatchObject({valueCm: 21, position: 'supine', site: 'iliac'});
});

test('corrections move a reading and preserve untouched centimetres across imperial edits and unit switches', async ({page}) => {
  await page.clock.setFixedTime(new Date('2026-10-22T12:00:00Z'));
  await page.goto('/app');
  const open = async () => page.evaluate(async () => {
    (await import('/js/chat-panel.js')).closeChatPanel();
    await (await import('/js/body-measurement-loader.js')).openBodyMeasurement('waist');
  });
  const records = async () => page.evaluate(async () => (await import('/js/body-measurement-model.js')).bodyMeasurementRecords((await import('/js/state.js')).state.importedData, 'waist'));
  const editor = page.locator('[data-body-measurement-view]');
  await open();
  await editor.getByLabel('Waist in cm').fill('86');
  await editor.getByLabel('Hips in cm').fill('100');
  await editor.getByRole('button', {name: 'in', exact: true}).click();
  await editor.getByRole('button', {name: 'cm', exact: true}).click();
  await editor.getByRole('button', {name: 'Save measurement'}).click();
  await expect(editor).toHaveCount(0);
  expect((await records())[0]).toMatchObject({valueCm: 86, hipCm: 100});
  await open();
  await editor.locator('summary').click();
  await editor.getByRole('button', {name: 'Edit', exact: true}).click();
  await editor.getByRole('button', {name: 'in', exact: true}).click();
  await expect(editor.getByLabel('Waist in in')).toHaveValue('33.9');
  await editor.getByLabel('Hips in in').fill('40');
  await editor.getByLabel('Measurement date').fill('2026-10-21');
  await editor.getByRole('button', {name: 'Save measurement'}).click();
  await expect(editor).toHaveCount(0);
  expect(await records()).toMatchObject([{date: '2026-10-21', valueCm: 86, hipCm: 101.6}]);
  await open();
  await editor.locator('summary').click();
  await editor.getByRole('button', {name: 'Edit', exact: true}).click();
  await editor.getByRole('button', {name: 'Seated', exact: true}).click();
  await editor.locator('select').selectOption('navel');
  await editor.getByRole('button', {name: 'Save measurement'}).click();
  await expect(editor).toHaveCount(0);
  expect(await records()).toMatchObject([{date: '2026-10-21', valueCm: 86, hipCm: 101.6, field: 'waist_seated_navel'}]);
  await page.reload();
  await open();
  await editor.locator('summary').click();
  await editor.getByRole('button', {name: 'Delete measurement from 2026-10-21'}).click();
  await page.locator('#confirm-cancel').click();
  expect(await records()).toHaveLength(1);
  await editor.getByRole('button', {name: 'Delete measurement from 2026-10-21'}).click();
  await page.locator('#confirm-ok').click();
  await expect(editor).toHaveCount(0);
  expect(await records()).toEqual([]);
});

test('waist-to-height explains missing height and uses canonical profile height with an imperial preference', async ({page}) => {
  await page.goto('/app');
  await page.evaluate(async () => {(await import('/js/chat-panel.js')).closeChatPanel(); await (await import('/js/body-measurement-loader.js')).openBodyMeasurement('waist');});
  const editor = page.locator('[data-body-measurement-view]');
  await editor.getByLabel('Waist in cm').fill('86.36');
  await expect(editor).toContainText('Add your height in your profile');
  await expect(editor.locator('[data-draft-waist-height-ratio]')).toHaveCount(0);
  await editor.getByRole('button', {name:'Close body measurements'}).click();
  await page.evaluate(async () => {
    const {state} = await import('/js/state.js');
    if (!state.profiles) throw new Error('Missing synthetic profile');
    const profile = state.profiles.find(item => item.id === state.currentProfile);
    if (!profile) throw new Error('Missing active synthetic profile');
    profile.height = 172.72; profile.heightUnit = 'in'; state.unitSystem = 'US';
    await (await import('/js/body-measurement-loader.js')).openBodyMeasurement('waist');
  });
  await editor.getByLabel('Waist in in').fill('34');
  await expect(editor.locator('[data-draft-waist-height-ratio]')).toContainText('Waist-to-height 0.50');
  await expect(editor.locator('[data-draft-waist-height-ratio]')).toContainText('68.0 in');
});

test('cycle timing is shared by the real Cycle card and waist/SAD editors and follows the selected measurement date', async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  const seed = createDefaultProfileData();
  const currentDate = new Date().toISOString().slice(0, 10);
  const start = new Date(`${currentDate}T00:00:00Z`); start.setUTCDate(start.getUTCDate() - 7);
  const end = new Date(start); end.setUTCDate(end.getUTCDate() + 4);
  const earlier = new Date(start); earlier.setUTCDate(earlier.getUTCDate() - 28);
  const earlierEnd = new Date(earlier); earlierEnd.setUTCDate(earlierEnd.getUTCDate() + 4);
  seed.menstrualCycle = {cycleStatus: 'regular', regularity: 'regular', contraceptive: '', cycleLength: 28, periodLength: 5,
    periods: [{startDate: earlier.toISOString().slice(0, 10), endDate: earlierEnd.toISOString().slice(0, 10)}, {startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10)}]};
  await page.addInitScript(seed => {
    localStorage.setItem('labcharts-profiles', JSON.stringify([{id: 'default', name: 'Synthetic cycle profile', sex: 'female'}]));
    localStorage.setItem('labcharts-active-profile', 'default');
    if (!localStorage.getItem('labcharts-default-imported')) localStorage.setItem('labcharts-default-imported', JSON.stringify(seed));
    for (const name of ['emptyTour', 'tour']) localStorage.setItem(`labcharts-default-${name}`, 'completed');
  }, seed);
  await page.goto('/app');
  await page.evaluate(async () => {(await import('/js/chat-panel.js')).closeChatPanel(); await (await import('/js/views.js')).navigate('body');});
  const cycleCard = page.locator('[data-cycle-body-timing]');
  await expect(cycleCard).toBeVisible();
  await expect(cycleCard).toContainText('suggested first baseline');
  await expect(cycleCard).toContainText('Mid-follicular');
  await page.getByRole('button', {name:'Log waist manually',exact:true}).click();
  const editor = page.locator('[data-body-measurement-view]');
  const timing = editor.getByRole('complementary', {name: 'Cycle measurement timing'});
  await expect(timing).toContainText('Suggested first baseline');
  await expect(timing).toContainText('Mid-follicular');
  await expect(timing).toContainText('estimated');
  await expect(editor.locator('[data-measurement-cycle-context]')).toHaveText('Cycle day 8 · follicular phase (estimated)');
  await editor.getByLabel('Measurement date').fill(start.toISOString().slice(0, 10));
  await expect(editor.locator('[data-measurement-cycle-context]')).toHaveText('Cycle day 1 · bleeding recorded');
  await editor.getByLabel('Measurement date').fill(currentDate);
  await editor.getByLabel('Waist in cm').fill('80');
  await editor.getByRole('button', {name: 'Save measurement'}).click();
  await expect(editor).toHaveCount(0);
  await expect(cycleCard).toContainText('next comparable measurement');
  await page.reload();
  await page.evaluate(async () => {(await import('/js/chat-panel.js')).closeChatPanel(); await (await import('/js/body-measurement-loader.js')).openBodyMeasurement('waist');});
  await expect(timing).toContainText('Next comparable measurement');
  await expect(timing).toContainText('Cycle day 8');
  await editor.locator('summary').click();
  await expect(editor.locator('details')).toContainText('Cycle day 8 · follicular phase (estimated)');
  await editor.getByRole('button', {name: 'Close body measurements'}).click();
  await page.evaluate(async () => {await (await import('/js/body-measurement-loader.js')).openBodyMeasurement('abdominal_depth');});
  await expect(timing).toContainText('Suggested first baseline');
  await expect(timing).toContainText('Mid-follicular');
  await page.setViewportSize({width: 390, height: 844});
  expect(await editor.evaluate(root => root.scrollWidth > root.clientWidth + 1)).toBe(false);
});

for (const version of ['bundled', 'freshly loaded'] as const) {
  test(`Sarah ${version} demo keeps estimated dates before and after waist and SAD baselines`, async ({page}) => {
    const now = new Date('2026-10-22T12:00:00Z');
    await page.clock.setFixedTime(now);
    const source: unknown = JSON.parse(readFileSync(new URL('../../data/demo-female.json', import.meta.url), 'utf8'));
    const prepared = version === 'bundled' ? source as {menstrualCycle:unknown} : prepareDemoBiologyData(source, 'female', {now});
    const seed = createDefaultProfileData(); seed.menstrualCycle = upgradeMenstrualCycleProfile(prepared.menstrualCycle);
    await page.addInitScript(seed => {
      localStorage.setItem('labcharts-profiles', JSON.stringify([{id:'default',name:'Demo Sarah',sex:'female'}]));
      localStorage.setItem('labcharts-active-profile', 'default');
      if (!localStorage.getItem('labcharts-default-imported')) localStorage.setItem('labcharts-default-imported', JSON.stringify(seed));
      for (const name of ['emptyTour','tour']) localStorage.setItem(`labcharts-default-${name}`, 'completed');
    }, seed);
    await page.goto('/app');
    await page.evaluate(async () => {(await import('/js/chat-panel.js')).closeChatPanel(); await (await import('/js/views.js')).navigate('body');});
    const card = page.locator('[data-cycle-body-timing]');
    await expect(card.locator('.cycle-draw-copy > span')).toContainText('estimated');
    await expect(card).toContainText('suggested first baseline');
    const recordedPeriods = await page.evaluate(async () => {
      const {state} = await import('/js/state.js');
      if (!state.importedData.menstrualCycle) throw new Error('Sarah cycle data is missing');
      return JSON.stringify(state.importedData.menstrualCycle.periods);
    });
    await page.getByRole('button', {name:'Log waist manually',exact:true}).click();
    const editor = page.locator('[data-body-measurement-view]');
    const timing = editor.getByRole('complementary', {name:'Cycle measurement timing'});
    await expect(timing).toContainText('Suggested first baseline');
    await expect(timing).toContainText('estimated');
    await expect(timing).toContainText('Update your last period');
    if (version === 'freshly loaded') await expect(timing).toContainText(/29\s*–\s*31 Oct 2026/);
    await editor.getByLabel('Waist in cm').fill('80');
    await editor.getByRole('button', {name:'Save measurement'}).click();
    await expect(card).toContainText('20 Nov 2026');
    await page.reload();
    await page.evaluate(async () => {(await import('/js/chat-panel.js')).closeChatPanel(); await (await import('/js/body-measurement-loader.js')).openBodyMeasurement('waist');});
    await expect(timing).toContainText('Next comparable measurement');
    await expect(timing).toContainText('20 Nov 2026');
    await editor.getByRole('button', {name:'Close body measurements'}).click();
    await page.evaluate(async () => {await (await import('/js/body-measurement-loader.js')).openBodyMeasurement('abdominal_depth');});
    await expect(timing).toContainText('Suggested first baseline');
    await expect(timing).toContainText('estimated');
    await editor.getByLabel('Abdominal depth in cm').fill('21');
    await editor.getByRole('button', {name:'Save measurement'}).click();
    await expect(editor).toHaveCount(0);
    await expect(card).toContainText('20 Nov 2026');
    await page.clock.setFixedTime(new Date('2027-01-15T12:00:00Z'));
    await page.reload();
    await page.evaluate(async () => {(await import('/js/chat-panel.js')).closeChatPanel(); await (await import('/js/body-measurement-loader.js')).openBodyMeasurement('abdominal_depth');});
    await expect(timing).toContainText('Next comparable measurement');
    await expect(timing).toContainText('17 Jan 2027');
    expect(await page.evaluate(async () => {
      const {state} = await import('/js/state.js');
      if (!state.importedData.menstrualCycle) throw new Error('Sarah cycle data was removed');
      return JSON.stringify(state.importedData.menstrualCycle.periods);
    })).toBe(recordedPeriods);
  });
}
