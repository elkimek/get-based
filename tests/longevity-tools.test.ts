import { describe, expect, it } from 'vitest';
import { LONGEVITY_TOOLS, LONGEVITY_PARAM_SOURCES, buildLongevityToolUrl } from '../js/longevity-tools-catalog.js';
import { collectLongevityValues, latestMarkerValues } from '../js/longevity-tools-values.js';

const entries = [
  { date: '2025-11-20', markers: { 'lipids.apoAI': 1.4, 'biochemistry.glucose': 5.0, 'differential.lymphocytesPct': 0.31 } },
  { date: '2026-03-14', markers: { 'lipids.apoAI': 1.31, 'biochemistry.alp': 1.12, 'differential.lymphocytesPct': 0.284, 'hematology.rbc': 4.87 } },
];
const values = collectLongevityValues({ entries, ageYears: 52, sex: 'male', weight: { kg: 76.81, date: '2026-03-20' }, heightCm: 171, bp: { sys: 131, dia: 84, date: '2026-02-28' }, waistCm: null });

describe('longevity-tools', () => {
  it('takes the latest stored value per marker with its draw date', () => {
    const m = latestMarkerValues(entries);
    expect(m.get('lipids.apoAI')).toEqual({ value: 1.31, date: '2026-03-14' });
    expect(m.get('biochemistry.glucose')).toEqual({ value: 5.0, date: '2025-11-20' });
  });
  it('builds the documented hash format (/ → ~, unit suffix)', () => {
    const tool = LONGEVITY_TOOLS.find(t => t.path === '/biomarker/S-ApoA1')!;
    expect(buildLongevityToolUrl(tool, values).url).toBe('https://www.longevity-tools.com/biomarker/S-ApoA1#S-ApoA1=1.31_g~L');
  });
  it('converts lymphocyte fraction to % and keeps profile params', () => {
    const tool = LONGEVITY_TOOLS.find(t => t.path === '/humanitys-bortz-blood-age')!;
    const { url, missing } = buildLongevityToolUrl(tool, values);
    expect(url).toContain('LYM=28.4_%25');
    expect(url).toContain('age=52_years');
    expect(url).toContain('gender=male');
    expect(url).toContain('RBC=4.87_x10e12~L');
    expect(url).toContain('S-ALP=1.12_ukat~L');
    expect(missing).toContain('S-cystatin-C');
  });
  it('sends bare numbers to the legacy Levine page', () => {
    const tool = LONGEVITY_TOOLS.find(t => t.path === '/levine-pheno-age')!;
    expect(buildLongevityToolUrl(tool, values).url).toContain('S-glucose=5&');
  });
  it('fills CVD PREVENT body inputs', () => {
    const tool = LONGEVITY_TOOLS.find(t => t.path === '/cvd-prevent-risk-interpreter')!;
    const { url } = buildLongevityToolUrl(tool, values);
    expect(url).toContain('BP-sys=131_mmHg');
    expect(url).toContain('weight=76.8_kg');
    expect(url).toContain('height=171_cm');
  });
  it('every biomarker page has a mapped source', () => {
    for (const t of LONGEVITY_TOOLS.filter(t => t.kind === 'biomarker')) {
      expect(LONGEVITY_PARAM_SOURCES[t.inputs[0]!] || ['BP-sys'].includes(t.inputs[0]!), t.path).toBeTruthy();
    }
  });
});
