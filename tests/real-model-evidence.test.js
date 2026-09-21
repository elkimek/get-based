import { expect, it } from 'vitest';
import { verifyRealModelEvidence } from '../scripts/verify-real-model-evidence.mjs';
const titles = { knowledge: 'real MiniLM indexes, searches and reloads without downloading weights again', voice: 'downloads Kokoro and Whisper, then completes a speech round trip' };
function report(model = 'knowledge') {
  return { stats: { expected: 1, unexpected: 0, flaky: 0, skipped: 0 }, suites: [{ suites: [{ specs: [{ title: titles[model], tests: [{ expectedStatus: 'passed', results: [{ status: 'passed' }] }] }] }] }], errors: [] };
}
it.each(['knowledge', 'voice'])('accepts completed %s evidence', model => {
  expect(verifyRealModelEvidence(report(model), model)).toEqual({ model, title: titles[model], passed: 1 });
});
it.each(['unexpected', 'flaky', 'skipped'])('rejects %s cases even if the test command exits successfully', field => {
  const value = report(); value.stats[field] = 1;
  expect(() => verifyRealModelEvidence(value, 'knowledge')).toThrow();
});
it('rejects empty and wrong-scenario reports', () => {
  expect(() => verifyRealModelEvidence({ stats: { expected: 0 } }, 'knowledge')).toThrow();
  expect(() => verifyRealModelEvidence(report('voice'), 'knowledge')).toThrow();
  expect(() => verifyRealModelEvidence(report(), 'invalid')).toThrow();
});
it('requires an actual passed execution instead of relying on summary counts', () => {
  const value = report(); value.suites[0].suites[0].specs[0].tests[0].results = [{ status: 'skipped' }];
  expect(() => verifyRealModelEvidence(value, 'knowledge')).toThrow();
});
it('rejects report-level errors even when the selected case passed', () => {
  const value = report(); value.errors.push({ message: 'Reporter or teardown failed' });
  expect(() => verifyRealModelEvidence(value, 'knowledge')).toThrow();
});
