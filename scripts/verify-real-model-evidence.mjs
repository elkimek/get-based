import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const SCENARIOS = {
  knowledge: 'real MiniLM indexes, searches and reloads without downloading weights again',
  voice: 'downloads Kokoro and Whisper, then completes a speech round trip',
};

export function verifyRealModelEvidence(report, model) {
  const title = SCENARIOS[model];
  if (!title) throw new Error('Unknown real-model scenario.');
  const stats = report?.stats;
  if (!stats || stats.expected !== 1 || stats.unexpected !== 0 || stats.flaky !== 0 || stats.skipped !== 0) {
    throw new Error('Real-model evidence requires exactly one passing case, with no skipped, flaky or failed cases.');
  }
  const specs = [];
  const visit = suites => {
    for (const suite of suites || []) {
      specs.push(...(suite.specs || []));
      visit(suite.suites);
    }
  };
  visit(report.suites);
  const spec = specs[0];
  const test = spec?.tests?.[0];
  if (specs.length !== 1 || spec.title !== title || spec.tests.length !== 1
      || test.expectedStatus !== 'passed' || test.results?.length !== 1 || test.results[0].status !== 'passed'
      || (report.errors || []).length) {
    throw new Error('The report does not prove the selected real-model scenario completed successfully.');
  }
  return { model, title, passed: 1 };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [, , model, reportPath] = process.argv;
  verifyRealModelEvidence(JSON.parse(fs.readFileSync(reportPath, 'utf8')), model);
  console.log(`Verified one completed ${model} real-model scenario.`);
}
