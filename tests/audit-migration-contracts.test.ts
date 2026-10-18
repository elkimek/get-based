import './_node-shim.js';
import { beforeAll, expect, it } from 'vitest';
import { auditMarkupSafe, auditMigrationWitnesses } from './helpers/audit-migration-contracts.js';

let audit: Awaited<ReturnType<typeof auditMigrationWitnesses>>;
beforeAll(async () => { audit = await auditMigrationWitnesses(); });
it('executes genuine current Svelte leaves with hostile text and quoted attributes across every migrated audit surface', () => {
  expect(audit.contracts).toEqual({
    trendName: true, trendCategory: true, flaggedName: true, categoryLabel: true, markerUnit: true,
    correlationName: true, sidebarLabel: true, focusReason: true, navTabindex: true, navRole: true,
    compareHeading: true, correlationsHeading: true,
  });
  for (const witness of Object.values(audit.witnesses)) expect(witness.html.length).toBeGreaterThan(0);
});
it.each(['trendName', 'trendCategory', 'flaggedName', 'categoryLabel', 'markerUnit', 'correlationName', 'sidebarLabel', 'focusReason'] as const)(
  'rejects injected markup, event attributes and changed visible text in the complete %s output', key => {
    const witness = audit.witnesses[key];
    expect(auditMarkupSafe(witness.html, witness.checks)).toBe(true);
    expect(auditMarkupSafe(witness.html + '<img src=x data-audit-injected="yes">', witness.checks)).toBe(false);
    expect(auditMarkupSafe(witness.html + '<div onclick="alert(1)">injected</div>', witness.checks)).toBe(false);
    const changed = witness.html.replaceAll('audit', 'foreign');
    expect(changed).not.toBe(witness.html);
    expect(auditMarkupSafe(changed, witness.checks)).toBe(false);
  },
);
it('retains public chart/fatty renderers as valid controls while all nine unsafe IDs return exactly empty before reading data', () => {
  expect(audit.invalidIds).toHaveLength(9);
  expect(audit.unsafeChart).toEqual(Array(9).fill(''));
  expect(audit.unsafeFatty).toEqual(Array(9).fill(''));
  expect(audit.markerReads).toBe(0);
  expect(audit.categoryReads).toBe(0);
  expect(audit.chartGuard).toBe(true);
  expect(audit.fattyGuard).toBe(true);
  expect(audit.validChart).toContain('Audit marker');
  expect(audit.validFatty).toContain('Audit marker');
});
