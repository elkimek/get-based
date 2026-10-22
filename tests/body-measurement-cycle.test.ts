import {describe, expect, it} from 'vitest';
import {readFileSync} from 'node:fs';
import {bodyMeasurementCycleLabel, bodyMeasurementTiming} from '../js/body-measurement-cycle.js';
import {prepareDemoBiologyData} from '../js/demo-biology-data.js';
import {upgradeMenstrualCycleProfile} from '../js/cycle-summary.js';

const today = '2026-10-22';
const mc = {
  cycleStatus: 'regular', regularity: 'regular', contraceptive: '', cycleLength: 28, periodLength: 5,
  periods: [{startDate: '2026-09-17', endDate: '2026-09-21'}, {startDate: '2026-10-15', endDate: '2026-10-19'}],
};
const row = (date: string, field = 'waist_standing_midpoint', updatedAt = 1) => ({date, field, updatedAt});
describe('optional menstrual context for waist and SAD', () => {
  it('suggests a short mid-follicular first baseline and labels the dates as estimated', () => {
    const timing = bodyMeasurementTiming(mc, [], today);
    expect(timing).toMatchObject({heading: 'Suggested first baseline', hint: expect.stringContaining('Mid-follicular')});
    expect(timing?.dateLabel).toMatch(/22\s*–\s*24 Oct 2026/);
    expect(timing?.dateLabel).toContain('estimated');
    expect(bodyMeasurementTiming(mc, [], '2026-10-25')?.dateLabel).toMatch(/19\s*–\s*21 Nov 2026/);
  });
  it('uses the measurement date, not today, and marks phase inference separately from logged bleeding', () => {
    expect(bodyMeasurementCycleLabel(mc, today)).toBe('Cycle day 8 · follicular phase (estimated)');
    expect(bodyMeasurementCycleLabel(mc, '2026-09-18')).toBe('Cycle day 2 · bleeding recorded');
    expect(bodyMeasurementCycleLabel(mc, '2026-10-29')).toBe('Cycle day 15 · ovulatory phase (estimated)');
    expect(bodyMeasurementCycleLabel(mc, '2026-11-04')).toBe('Cycle day 21 · luteal phase (estimated)');
  });
  it('repeats the baseline cycle day for the most recently used method without pooling methods', () => {
    const rows = [row('2026-09-18', 'sad_supine_iliac'), row('2026-09-24', 'waist_standing_midpoint', 2)];
    expect(bodyMeasurementTiming(mc, rows, today)).toMatchObject({heading: 'Next comparable measurement', hint: expect.stringContaining('Cycle day 8')});
    expect(bodyMeasurementTiming(mc, rows, today)?.dateLabel).toContain('22 Oct 2026');
    expect(bodyMeasurementTiming(mc, [...rows, row(today, 'waist_standing_midpoint', 3)], today)?.dateLabel).toContain('19 Nov 2026');
  });
  it('does not shift a baseline when a different day was logged later', () => {
    expect(bodyMeasurementTiming(mc, [row('2026-09-24'), row('2026-10-21', 'waist_standing_midpoint', 2)], today)?.hint).toContain('Cycle day 8');
  });
  it('waits until the recorded bleeding end, even when it exceeds the usual duration', () => {
    const longer = {...mc, periods: [{startDate: '2026-10-15', endDate: '2026-10-24'}]};
    expect(bodyMeasurementTiming(longer, [], today)?.dateLabel).toMatch(/25\s*–\s*26 Oct 2026/);
  });
  it.each(['OCP', 'Hormonal IUD (Mirena)', 'Implant', 'Patch', 'Ring', 'Depo injection', 'other'])('avoids natural-cycle forecasts with %s', contraceptive => {
    const profile = {...mc, contraceptive};
    expect(bodyMeasurementTiming(profile, [], today)?.dateLabel).toBeNull();
    expect(bodyMeasurementCycleLabel(profile, today)).toBe('Cycle day 8 · since logged bleeding');
    expect(bodyMeasurementTiming(profile, [], today)?.hint).not.toContain('follicular');
  });
  it.each(['Copper IUD', 'Barrier', 'FAM'])('retains optional predictions with known non-hormonal method %s', contraceptive => {
    expect(bodyMeasurementTiming({...mc, contraceptive}, [], today)?.dateLabel).toContain('estimated');
  });
  it('avoids natural-cycle forecasts for irregular and perimenopausal profiles', () => {
    for (const change of [{regularity: 'irregular'}, {cycleStatus: 'perimenopause'}]) {
      expect(bodyMeasurementTiming({...mc, ...change}, [], today)?.dateLabel).toBeNull();
    }
    expect(bodyMeasurementCycleLabel({...mc, regularity: 'irregular'}, today)).not.toContain('phase');
    expect(bodyMeasurementCycleLabel(mc, '2027-01-01')).toBeNull();
  });
  it('keeps rolling estimated dates when period logging is one or several cycles behind', () => {
    for (const startDate of ['2026-09-17', '2026-08-20', '2025-08-21']) {
      const profile = {...mc, periods: [{startDate}]};
      expect(bodyMeasurementTiming(profile, [], today)?.dateLabel).toMatch(/22\s*–\s*24 Oct 2026/);
      expect(bodyMeasurementTiming(profile, [], today)?.hint).toContain('Update your last period');
      expect(bodyMeasurementTiming(profile, [row(today)], today)).toMatchObject({
        heading: 'Next comparable measurement', dateLabel: expect.stringContaining('19 Nov 2026'),
        hint: expect.stringContaining('Cycle day 8'),
      });
    }
  });
  it('keeps a dated estimate with an explanation when the stored regular-cycle history conflicts', () => {
    const profile = {...mc, periods: [{startDate:'2026-09-30'}, {startDate:'2026-10-15'}]};
    const before = structuredClone(profile);
    expect(bodyMeasurementTiming(profile, [], today)?.dateLabel).toMatch(/22\s*–\s*24 Oct 2026/);
    expect(bodyMeasurementTiming(profile, [], today)?.hint).toContain('Update your last period');
    expect(profile).toEqual(before);
  });
  it('shows Sarah demo dates before and after a baseline, using the actual bundled and rolling demo calendars', () => {
    const source: unknown = JSON.parse(readFileSync(new URL('../data/demo-female.json', import.meta.url), 'utf8'));
    const raw = source as {menstrualCycle:unknown};
    const fresh = prepareDemoBiologyData(source, 'female', {now:new Date(`${today}T12:00:00Z`)});
    for (const profile of [raw, fresh]) {
      const cycle = upgradeMenstrualCycleProfile(profile.menstrualCycle), before = structuredClone(cycle);
      expect(bodyMeasurementTiming(cycle, [], today)).toMatchObject({heading:'Suggested first baseline', dateLabel:expect.stringContaining('estimated')});
      expect(bodyMeasurementTiming(cycle, [row(today)], today)).toMatchObject({heading:'Next comparable measurement', dateLabel:expect.stringContaining('20 Nov 2026')});
      expect(bodyMeasurementTiming(cycle, [row(today)], '2027-01-15')?.dateLabel).toContain('17 Jan 2027');
      expect(cycle).toEqual(before);
    }
    expect(bodyMeasurementTiming(upgradeMenstrualCycleProfile(fresh.menstrualCycle), [], today)?.dateLabel).toMatch(/29\s*–\s*31 Oct 2026/);
    expect(bodyMeasurementCycleLabel(fresh.menstrualCycle, today)).toBe('30 days since last logged period started');
    expect(bodyMeasurementTiming(fresh.menstrualCycle, [row(today)], today)?.hint).toContain('Cycle day 2 (estimated)');
  });
  it('hides cycle guidance for inactive or absent cycle tracking', () => {
    for (const cycle of [null, undefined, false, 'female', ...['postmenopause', 'pregnant', 'breastfeeding', 'absent'].map(cycleStatus => ({...mc, cycleStatus}))]) {
      expect(bodyMeasurementTiming(cycle, [], today)).toBeNull();
      expect(bodyMeasurementCycleLabel(cycle, today)).toBeNull();
    }
  });
  it('does not manufacture a period start or phase from missing, predicted or malformed dates', () => {
    for (const periods of [[], [{startDate: '2026-02-30'}], [{startDate: '2026-10-15', source: 'predicted'}], [{startDate: '2026-11-15'}]]) {
      const profile = {...mc, periods};
      expect(bodyMeasurementTiming(profile, [], today)?.dateLabel).toBeNull();
      expect(bodyMeasurementTiming(profile, [], today)?.hint).toContain('Add a period start');
      expect(bodyMeasurementCycleLabel(profile, today)).toBeNull();
    }
    expect(bodyMeasurementTiming(mc, [], '2026-02-30')).toBeNull();
    expect(bodyMeasurementCycleLabel(mc, '2026-02-30')).toBeNull();
    expect(bodyMeasurementTiming({...mc, cycleLength: 0}, [], today)?.dateLabel).toBeNull();
  });
  it('does not mutate source periods or raw measurements', () => {
    const profile = structuredClone(mc), rows = [row('2026-09-24')], before = structuredClone({profile, rows});
    bodyMeasurementTiming(profile, rows, today); bodyMeasurementCycleLabel(profile, today);
    expect({profile, rows}).toEqual(before);
  });
});
