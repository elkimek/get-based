import {afterEach, describe, expect, it, vi} from 'vitest';
import {buildMarkerBaselines, baselineForDate, projectMarkerBaseline} from '../js/marker-baseline.js';
import {getActiveData, filterDatesByRange, invalidateActiveDataCache} from '../js/data.js';
import {formatMarkerValuesForChat, getEffectiveRangeForDate} from '../js/marker-analysis.js';
import {CHAT_SYSTEM_PROMPT} from '../js/chat-system-prompt.js';
import {state} from '../js/state.js';

const dates = ['2026-01-01', '2026-02-01', '2026-03-01', '2026-04-01', '2026-05-01'];
const original = {importedData:state.importedData, unitSystem:state.unitSystem, dateRangeFilter:state.dateRangeFilter};
afterEach(() => {vi.useRealTimers(); Object.assign(state, original); invalidateActiveDataCache();});

describe('descriptive marker baseline', () => {
  it('excludes the compared draw and future draws, requiring three independent prior draws', () => {
    const result = buildMarkerBaselines([5, 5.2, 4.8, 9, 20], dates);
    expect(result.slice(0, 3)).toEqual([null, null, null]);
    expect(result[3]).toEqual({median:5, count:3, startDate:dates[0], endDate:dates[2], comparedDate:dates[3], delta:4, deltaPercent:80});
    expect(result[4]?.median).toBe(5.1);
  });

  it('uses chronological dates, ignores missing and nonfinite values and rejects invalid dates', () => {
    const result = buildMarkerBaselines([9, 5, NaN, Infinity, null, 4, 6, 100],
      ['2026-05-01','2026-02-01','2026-02-02','2026-02-03','2026-02-04','2026-01-01','2026-03-01','2026-02-30']);
    expect(result[0]).toMatchObject({median:5, count:3, delta:4});
    expect(result.slice(2,5)).toEqual([null,null,null]);
    expect(result[7]).toBeNull();
  });

  it('counts duplicate dates once and excludes conflicting same-date readings', () => {
    const duplicateDates = [dates[0]!, dates[0]!, dates[1]!, dates[2]!, dates[3]!];
    expect(buildMarkerBaselines([5,5,6,7,9],duplicateDates)[4]?.count).toBe(3);
    expect(buildMarkerBaselines([5,8,6,7,9],duplicateDates)[4]).toBeNull();
  });

  it('bounds history at two calendar years, including leap-day clamping', () => {
    const result = buildMarkerBaselines([100,4,5,6,9],['2022-02-27','2022-02-28','2023-01-01','2023-02-01','2024-02-29']);
    expect(result[4]).toMatchObject({count:3, median:5, startDate:'2022-02-28'});
    expect(buildMarkerBaselines([4,5,6,9],['2021-01-01','2021-02-01','2021-03-01','2026-04-01'])[3]).toBeNull();
  });

  it('retains abnormal historical results and handles zero and negative medians honestly', () => {
    expect(buildMarkerBaselines([100,110,120,115],dates)[3]?.median).toBe(110);
    const zero = buildMarkerBaselines([0,0,0,2],dates)[3];
    expect(zero).toMatchObject({median:0, deltaPercent:null});
    expect(projectMarkerBaseline(zero,'u',String)?.comparison).toBe('Latest 2 u above baseline');
    expect(buildMarkerBaselines([-3,-2,-1,-1],dates)[3]).toMatchObject({median:-2,delta:1,deltaPercent:50});
    expect(projectMarkerBaseline(buildMarkerBaselines([5,5,5,5],dates)[3],'u',String)?.comparison).toBe('Latest matches baseline');
  });

  it('never reuses a baseline for a different compared date', () => {
    const marker = {personalBaselines:buildMarkerBaselines([5,5,5,9],dates)};
    expect(baselineForDate(marker,3,dates[3])).not.toBeNull();
    expect(baselineForDate(marker,3,dates[4])).toBeNull();
    expect(projectMarkerBaseline(null,'u',String)).toBeNull();
  });

  it('keeps baseline metadata absent until a recorded result has enough prior history', () => {
    for (const count of [1,3,4]) {
      Object.assign(state,{unitSystem:'EU',dateRangeFilter:'all', importedData:{entries:dates.slice(0,count).map(date=>({date,markers:{'biochemistry.glucose':5}}))}});
      invalidateActiveDataCache();
      const marker = getActiveData().categories.biochemistry!.markers.glucose!;
      if (count < 4) expect(Object.hasOwn(marker,'personalBaselines')).toBe(false);
      else expect(marker.personalBaselines?.[3]).toMatchObject({median:5,count:3});
    }
  });

  it('projects the same baseline through unit conversion, chart date filtering and chat', () => {
    Object.assign(state,{unitSystem:'US',dateRangeFilter:'all', importedData:{entries:dates.map((date,index)=>({date,markers:{'biochemistry.glucose':[5,5.2,4.8,9,10][index]}}))}});
    invalidateActiveDataCache();
    const data = getActiveData();
    const marker = data.categories.biochemistry!.markers.glucose!;
    const baseline = marker.personalBaselines![3]!;
    expect(baseline.median).toBeCloseTo(90.09,1);
    expect(baseline.deltaPercent).toBeCloseTo(80,1);
    expect(formatMarkerValuesForChat(marker,data)).toContain('Personal baseline:');
    expect(formatMarkerValuesForChat(marker,data)).toContain('n=4 prior draws');
    expect(formatMarkerValuesForChat(marker,data)).toContain('compared=2026-05-01');
    expect(CHAT_SYSTEM_PROMPT).toContain('not a healthy target');
    expect(getEffectiveRangeForDate(marker,3)).not.toEqual({min:baseline.median,max:baseline.median});
    state.dateRangeFilter = '3m';
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-02T12:00:00Z'));
    const filtered = filterDatesByRange(data);
    expect(filtered.dates).toEqual(dates.slice(2));
    for (const [index,date] of filtered.dates.entries()) {
      expect(filtered.categories.biochemistry!.markers.glucose!.personalBaselines![index])
        .toEqual(marker.personalBaselines![data.dates.indexOf(date)]);
    }
    const prior = {...marker,values:marker.values.slice(0,3),personalBaselines:marker.personalBaselines!.slice(0,3)};
    expect(formatMarkerValuesForChat(prior,{dates:dates.slice(0,3)})).not.toContain('Personal baseline:');
    expect(CHAT_SYSTEM_PROMPT).toContain('A familiar abnormal value remains abnormal');
  });
});
