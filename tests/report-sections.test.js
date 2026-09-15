import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { buildExtraReportSections, captureReportSources, loadExtraReportSources } from '../js/export-report-sections.js';
import { putNutritionMeal, deleteNutritionDB } from '../js/nutrition-store.js';
import { getDailyForReport, upsertDailyBatchRaw, deleteWearablesDB } from '../js/wearables-store.js';
import { buildReportDataSnapshot, formatReportDataForAgent } from '../js/export-report-data.js';
const scope = { startDate: '2026-04-01', endDate: '2026-04-30', unitSystem: 'US' };
const input = {
  nutritionMeals: [
    { id: 'old', localDate: '2026-03-31', name: 'OLD MEAL', nutrients: { energyKcal: 100 } },
    { id: 'meal', localDate: '2026-04-02', eatenAt: '2026-04-03T00:30:00Z', name: 'Selected meal', nutrients: { energyKcal: 200, proteinG: 0 }, source: { kind: 'ai-photo-estimate' }, images: [{ thumbnailUrl: 'PRIVATE PHOTO' }] },
    { id: 'deleted', localDate: '2026-04-02', name: 'DELETED MEAL' },
  ],
  _deleted: { nutritionMeals: ['deleted'] },
  wearableSummary: { metrics: { weight: { latest: 80, latestDate: '2026-04-02', primarySource: 'manual' }, rhr: { latest: 55, latestDate: '2026-03-31' } } },
  wearableConnections: { oura: { accessToken: 'PRIVATE TOKEN' } },
  sunSessions: [{ startedAt: new Date('2026-04-02T12:00:00Z').getTime(), endedAt: 1, durationMin: 15, doses: { vitamin_d: 100 }, safety: { erythemalSED: 0.2 } }],
  deviceSessions: [{ startedAt: new Date('2026-03-31T12:00:00Z').getTime(), durationMin: 5, notes: 'OLD LIGHT' }],
  lightEnvironment: { rooms: [{ name: 'Bedroom', cct: 2700 }] },
  lightMeasurements: [{ id: 'camera', capturedAt: new Date('2026-04-02T12:00:00Z').getTime(), tool: 'darkness', value: 30, extra: { method: 'camera', levelLabel: 'dim' } }],
  emfAssessment: { assessments: [{ date: '2026-03-30', label: 'OLD EMF', rooms: [] }, { date: '2026-04-03', label: 'Bedroom EMF', rooms: [{ name: 'Bedroom', measurements: { acElectric: { value: 2, unit: 'V/m' } } }] }] },
};
const profileId = 'report-history-fixture';
afterEach(async () => { await deleteWearablesDB(profileId); await deleteNutritionDB(profileId); });

describe('configurable report histories', () => {
  it('captures only selected sources, excludes photos, and preserves meal deletion', () => {
    const sources = captureReportSources(input, ['nutrition']);
    const text = JSON.stringify(sources);
    expect(text).not.toContain('PRIVATE');
    expect(text).not.toContain('wearable');
    const [section] = buildExtraReportSections(sources, ['nutrition'], scope);
    expect(section.rows).toHaveLength(1);
    expect(section.rows[0][0]).toContain('2026-04-02 Selected meal');
    expect(section.rows[0][1]).toContain('Protein: 0 g');
    expect(section.rows[0][1]).not.toContain('Sodium');
    expect(section.rows[0][2]).toContain('Ai-photo-estimate');
    expect(JSON.stringify(input)).toContain('PRIVATE PHOTO');
  });

  it('filters dated sources independently and keeps units and source coverage explicit', () => {
    const sections = buildExtraReportSections(input, ['wearables', 'light', 'environment'], scope);
    const body = JSON.stringify(sections);
    expect(body).not.toContain('OLD');
    expect(body).not.toContain('PRIVATE TOKEN');
    expect(sections[0].rows).toHaveLength(1);
    expect(sections[0].rows[0]).toContain('176.4');
    expect(sections[0].rows[0]).toContain('lb');
    expect(sections[0].rows[0]).toContain('Synced latest reading');
    expect(sections[1].rows[0][4]).toContain('100 a.u.');
    expect(body).toContain('Bedroom EMF');
    expect(body).toContain('V/m');
  });

  it('uses the light tool interpretation of camera-relative values in the loaded report', async () => {
    const sections = await loadExtraReportSources(profileId, captureReportSources(input, ['environment']), ['environment'], scope);
    expect(JSON.stringify(sections)).toContain('not lux and not a hormone estimate');
    expect(JSON.stringify(sections)).toContain('30%');
  });

  it('reads only the selected profile/date history and reports unreadable rows', async () => {
    await upsertDailyBatchRaw(profileId, [
      { source: 'oura', date: '2026-04-02', rhr: 57 },
      { source: 'oura', date: '2026-03-31', rhr: 99 },
      { source: 'oura', date: '2026-04-03', _payload: { inaccessible: true } },
    ]);
    const history = await getDailyForReport(profileId, scope.startDate, scope.endDate);
    expect(history.rows).toEqual([{ source: 'oura', date: '2026-04-02', rhr: 57 }]);
    expect(history.unavailable).toBe(1);
    const sections = await loadExtraReportSources(profileId, captureReportSources(input, ['wearables']), ['wearables'], scope);
    expect(sections[0].note).toContain('1 local rows could not be decrypted');
    expect(sections[0].rows.some(row => row.includes('Local daily history'))).toBe(true);
    expect(JSON.stringify(sections)).not.toContain('_payload');
  });

  it('reads legacy device-local nutrition when the synced meal surface is absent', async () => {
    await putNutritionMeal(profileId, { id: 'legacy', name: 'Legacy meal', localDate: '2026-04-02', eatenAt: '2026-04-02T12:00:00Z', nutrients: { energyKcal: 123 } });
    const sections = await loadExtraReportSources(profileId, {}, ['nutrition'], scope);
    expect(sections[0].rows[0][0]).toContain('Legacy meal');
    const cleared = await loadExtraReportSources(profileId, { nutritionMeals: [] }, ['nutrition'], scope);
    expect(cleared[0].rows).toEqual([]);
  });

  it('shares selected facts with the AI overview and leaves unchecked sources absent', () => {
    const reportData = buildReportDataSnapshot({ importedData: input, reportOptions: { sections: ['nutrition'], ...scope }, unitSystem: 'US' });
    const context = formatReportDataForAgent(reportData);
    expect(context).toContain('Average / eligible logged day: 200 kcal');
    expect(context).not.toContain('Selected meal');
    expect(context).not.toContain('DELETED MEAL');
    expect(context).not.toContain('OLD MEAL');
    expect(context).not.toContain('Bedroom');
    expect(context).not.toContain('PRIVATE');
    const [empty] = buildExtraReportSections({}, ['light'], scope);
    expect(empty.rows).toEqual([]);
  });
});
