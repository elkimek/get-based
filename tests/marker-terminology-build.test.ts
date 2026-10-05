import { expect, it } from 'vitest';
import { MARKER_TERMINOLOGY_DEFINITIONS } from '../js/marker-terminology/index.js';
import { renderMarkerTerminology } from '../scripts/build-marker-terminology.mjs';

const mapping = MARKER_TERMINOLOGY_DEFINITIONS[0]!;
const invalidMappings: Array<[string, Record<string, unknown>, string]> = [
  ['unknown marker', { markerId: 'gb:marker:missing' }, 'Unknown marker id'],
  ['unsupported terminology', { terminology: 'missing' }, 'Unsupported marker terminology'],
  ['malformed LOINC code', { code: '147496' }, 'Invalid loinc code'],
  ['malformed NPU code', { terminology: 'npu', code: 'NPU2192' }, 'Invalid npu code'],
  ['malformed NČLP code', { terminology: 'nclp', code: '1896' }, 'Invalid nclp code'],
  ['duplicate code', { code: '2951-2', source: { ...mapping.source, url: 'https://loinc.org/2951-2' } }, 'Duplicate terminology code'],
  ['blank display', { display: ' ' }, 'display must be a non-empty string'],
  ['unsupported status', { status: 'unknown' }, 'Invalid status'],
  ['missing context field', { context: {} }, 'context must contain exactly'],
  ['extra context field', { context: { ...mapping.context, extra: 'unexpected' } }, 'context must contain exactly'],
  ...(['system', 'component', 'property'] as const).map(key =>
    [`blank ${key}`, { context: { ...mapping.context, [key]: ' ' } }, `${key} must be a non-empty string`] as [string, Record<string, unknown>, string]),
  ...(['timeAspect', 'scale', 'method'] as const).map(key =>
    [`invalid ${key}`, { context: { ...mapping.context, [key]: 12 } }, `${key} must be a non-empty string or null`] as [string, Record<string, unknown>, string]),
  ['missing units', { ucumUnits: null }, 'must declare at least one UCUM unit'],
  ['empty units', { ucumUnits: [] }, 'must declare at least one UCUM unit'],
  ['duplicate units', { ucumUnits: ['mmol/L', 'mmol/L'] }, 'contains duplicate UCUM units'],
  ['non-ASCII units', { ucumUnits: ['µmol/L'] }, 'invalid UCUM unit expression'],
  ['empty source URL', { source: { ...mapping.source, url: ' ' } }, 'source URL must be a non-empty string'],
  ['malformed source URL', { source: { ...mapping.source, url: 'invalid' } }, 'source URL must be a valid URL'],
  ['insecure source URL', { source: { ...mapping.source, url: 'http://loinc.org/14749-6' } }, 'source URL must use HTTPS'],
  ['wrong LOINC source', { source: { ...mapping.source, url: 'https://loinc.org/2951-2' } }, 'LOINC source URL must identify 14749-6'],
  ['blank release', { source: { ...mapping.source, release: ' ' } }, 'source release must be a non-empty string'],
  ['impossible date', { source: { ...mapping.source, verifiedOn: '2026-02-30' } }, 'Invalid verification date'],
];

it.each(invalidMappings)('rejects %s before emitting a registry', (_label, patch, message) => {
  const saved = { ...mapping };
  try {
    // Exercise validation of malformed authoring input despite its native type contract.
    Object.assign(mapping, patch);
    expect(renderMarkerTerminology).toThrow(message);
  } finally {
    Object.assign(mapping, saved);
  }
});

it('emits complete reviewed metadata, including semicolons in NPU descriptions', () => {
  const registry: Record<string, typeof MARKER_TERMINOLOGY_DEFINITIONS> = {};
  for (const entry of MARKER_TERMINOLOGY_DEFINITIONS) (registry[entry.markerId] ||= []).push(entry);
  const rendered = renderMarkerTerminology();
  expect(rendered).toContain(JSON.stringify(registry));
  expect(rendered).toContain('substance concentration = ? millimole per litre');
});
