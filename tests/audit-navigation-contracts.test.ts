import { expect, it } from 'vitest';
import { sourceFactoryPropertyHasInitializer, sourceFunctionReturnsChainContaining, sourceFunctionVariableCallHasArgument, sourceFunctionHasStatement } from './helpers/native-source-contracts.js';
import { calculateCycleStats } from '../js/cycle-summary.js';
it('matches the actual factory property and rejects inert strings or a different owner', () => {
  const expression = `(category, data) => showPreparedRoute(category, 'Category', () => isReady(), () => Promise.all([loadBody(), loadStyles()]), () => render(category, data))`;
  const config = `const _navigate = createNavigate({ routeHandlers: { category: ${expression} } });`;
  const check = (source: string) => sourceFactoryPropertyHasInitializer(source, '_navigate', 'createNavigate', ['routeHandlers', 'category'], expression);
  expect(check(config)).toBe(true); expect(check(config.replace('loadStyles()', 'skipStyles()'))).toBe(false);
  expect(check(config.replace('_navigate', 'anotherOwner'))).toBe(false); expect(check(config.replace('createNavigate', 'differentFactory'))).toBe(false);
  expect(check(`const inert = ${JSON.stringify(config)};`)).toBe(false);
});
it('requires an awaited rendering step in the returned preparation chain, not an unused callback', () => {
  const expression = 'prepare().then(async () => { await render(); return true; })';
  const source = `function showRoute() { return ${expression}.catch(() => false); }`;
  const check = (source: string) => sourceFunctionReturnsChainContaining(source, 'showRoute', expression);
  expect(check(source)).toBe(true); expect(check(source.replace('await render()', 'render()'))).toBe(false);
  expect(check(source.replace(`return ${expression}`, `const unused = ${expression}; return Promise.resolve(true)`))).toBe(false);
  expect(check(`function showRoute() { /* ${expression} */ return false; }`)).toBe(false);
});
it('keeps known-period predicates tied to the real variable and callback', () => {
  const source = 'function calculateCycleStats() { const periodLengths = sorted.filter(p => p.endDate && p.endDateKnown !== false).map(p => p); }';
  const check = (source: string) => sourceFunctionVariableCallHasArgument(source, 'calculateCycleStats', 'periodLengths', 'filter', 'p => p.endDate && p.endDateKnown !== false');
  expect(check(source)).toBe(true); expect(check(source.replace(' && p.endDateKnown !== false', ''))).toBe(false);
  expect(check(source.replace('periodLengths', 'differentVariable'))).toBe(false);
  expect(check(`function calculateCycleStats() { const periodLengths = sorted; /* ${source} */ }`)).toBe(false);
});
it('accepts equivalent optional-call parentheses without accepting a stale data read', () => {
  const source = 'function refresh() { const data = getActiveData(); (buildSidebar)?.(data); navigate(data); }';
  expect(sourceFunctionHasStatement(source, 'refresh', 'buildSidebar?.(data);')).toBe(true);
  expect(sourceFunctionHasStatement(source, 'refresh', 'const data = getActiveData();')).toBe(true);
  expect(sourceFunctionHasStatement(source.replace('getActiveData()', 'cachedData'), 'refresh', 'const data = getActiveData();')).toBe(false);
});
it('does not turn an explicitly unknown period end into a measured duration', () => {
  const unknown = { startDate: '2026-10-01', endDate: '2026-10-02', endDateKnown: false };
  expect(calculateCycleStats([unknown]).periodLength).toBeNull();
  expect(calculateCycleStats([{ startDate: '2026-10-01' }]).periodLength).toBeNull();
  expect(calculateCycleStats([unknown, { startDate: '2026-10-20', endDate: '2026-10-24', endDateKnown: true }]).periodLength).toBe(5);
});
