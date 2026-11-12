import fs from 'node:fs';
import {describe, expect, it} from 'vitest';
import {MARKER_SCHEMA} from '../js/marker-schema.js';
import {projectDemoFixture} from '../scripts/readonly-demo-data.mjs';
import {sparkline} from '../js/readonly-demo-model.js';
import {DEMO_CSP} from '../scripts/build-readonly-demo.mjs';

describe('isolated public sample projection', () => {
  it.each(['female', 'male'] as const)('projects only the committed %s sample, including exact date and unit identities', id => {
    const fixture = JSON.parse(fs.readFileSync(`data/demo-${id}.json`, 'utf8')) as Parameters<typeof projectDemoFixture>[1];
    const profile = projectDemoFixture(id, fixture, MARKER_SCHEMA);
    expect(profile.id).toBe(id);
    expect(profile.labs).toHaveLength(6);
    expect(profile.drawCount).toBe(new Set(fixture.entries.map(entry => entry.date)).size);
    for (const series of profile.labs) {
      const [category, marker] = series.id.split('.');
      expect(series.unit).toBe(MARKER_SCHEMA[category!]!.markers[marker!]!.unit);
      expect(series.points.length).toBeGreaterThan(2);
      for (const point of series.points) {
        const reading = fixture.entries.filter(entry => entry.date === point.date && typeof entry.markers[series.id] === 'number').at(-1);
        expect(point.value).toBe(reading!.markers[series.id]);
      }
    }
    expect(profile.snps.length).toBeGreaterThan(0);
    expect(profile.body[0]!.points).toEqual(fixture.biometrics.weight);
    expect(profile.sessions.length).toBeGreaterThan(0);
    expect(() => projectDemoFixture(id, {...fixture, _source: 'personal'}, MARKER_SCHEMA)).toThrow('fictional fixtures');
    expect(JSON.stringify(profile)).not.toMatch(/contextHealth|healthGoals|changeHistory|apiKey|token|connectedSince/);
  });
  it('keeps constant and single-reading charts finite without changing the data', () => {
    const points = [{date: '2026-01-01', value: 0}, {date: '2026-02-01', value: 0}];
    expect(sparkline(points)).toBe('16,126 584,126');
    expect(sparkline(points.slice(0, 1))).toBe('16,126');
    expect(points.map(point => point.value)).toEqual([0, 0]);
    expect(DEMO_CSP).toContain("connect-src 'none'");
    expect(DEMO_CSP).toContain("form-action 'none'");
    expect(DEMO_CSP).not.toContain('unsafe-inline');
  });
});
