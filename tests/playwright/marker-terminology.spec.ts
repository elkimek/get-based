import { createModuleUrl } from '../helpers/browser-module-url.js';
import { expect, test } from './coverage-fixture.js';

const moduleUrl = createModuleUrl('markerTerminology');

test('terminology lookups preserve exact codes, specimens and immutable metadata in the browser', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });
  const result = await page.evaluate(async url => {
    const registry = await import(url) as typeof import('../../js/marker-terminology.js');
    const glucose = registry.getMarkerTerminologyMappings('gb:marker:glucose');
    const nclp = registry.getMarkerTerminologyMappings('gb:marker:glucose', 'nclp');
    const original = registry.MARKER_TERMINOLOGY_REGISTRY['gb:marker:glucose']!;
    const deeplyFrozen = (value: unknown): boolean => !value || typeof value !== 'object'
      || (Object.isFrozen(value) && Object.values(value).every(deeplyFrozen));
    return {
      codes: glucose.map(mapping => `${mapping.terminology}:${mapping.code}`),
      specimens: nclp.map(mapping => mapping.context.system),
      originalIdentity: glucose === original,
      reverseIdentity: registry.findMarkerTerminologyMapping('nclp', '01896') === original[2],
      rejectsNumericCode: registry.findMarkerTerminologyMapping('nclp', 1896) === null,
      rejectsUnknownTerminology: registry.getMarkerTerminologyMappings('gb:marker:glucose', 'missing').length === 0,
      frozen: deeplyFrozen(registry.MARKER_TERMINOLOGY_REGISTRY) && deeplyFrozen(registry.TERMINOLOGY_CATALOGS) && deeplyFrozen(nclp),
    };
  }, moduleUrl('/js/marker-terminology.js'));
  expect(result).toEqual({
    codes: ['loinc:14749-6', 'npu:NPU02192', 'nclp:01896', 'nclp:01898'],
    specimens: ['P', 'S'], originalIdentity: true, reverseIdentity: true,
    rejectsNumericCode: true, rejectsUnknownTerminology: true, frozen: true,
  });
});
