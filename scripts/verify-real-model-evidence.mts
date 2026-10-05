import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

type ScenarioStatsReader = { expected?: unknown; unexpected?: unknown; flaky?: unknown; skipped?: unknown };
type ScenarioTestReader = { expectedStatus?: unknown; results?: { length?: unknown; 0?: { status?: unknown } | null } | null };
type ScenarioSpecReader = { title?: unknown; tests?: { length?: unknown; 0?: ScenarioTestReader | null } | null };
type ScenarioSuiteReader = { specs?: Iterable<ScenarioSpecReader | null | undefined> | null; suites?: unknown };
type ScenarioReportReader = { stats?: ScenarioStatsReader | null; suites?: unknown; errors?: { length?: unknown } | null };
const SCENARIOS = {
  knowledge: 'real MiniLM indexes, searches and reloads without downloading weights again',
  voice: 'downloads Kokoro and Whisper, then completes a speech round trip',
};

export function verifyRealModelEvidence(report: unknown, model: unknown) {
  const title = (SCENARIOS as Record<PropertyKey, unknown>)[model as PropertyKey];
  if (!title) throw new Error('Unknown real-model scenario.');
  const stats = (report as ScenarioReportReader | null | undefined)?.stats;
  if (!stats || stats.expected !== 1 || stats.unexpected !== 0 || stats.flaky !== 0 || stats.skipped !== 0) {
    throw new Error('Real-model evidence requires exactly one passing case, with no skipped, flaky or failed cases.');
  }
  const specs: Array<ScenarioSpecReader | null | undefined> = [];
  const visit = (suites: unknown) => {
    for (const suite of (suites || []) as Iterable<ScenarioSuiteReader>) {
      specs.push(...(suite.specs || []));
      visit(suite.suites);
    }
  };
  visit((report as ScenarioReportReader).suites);
  const spec = specs[0];
  const test = spec?.tests?.[0];
  if (specs.length !== 1 || spec!.title !== title || spec!.tests!.length !== 1
      || test!.expectedStatus !== 'passed' || test!.results?.length !== 1 || test!.results![0]!.status !== 'passed'
      || ((report as ScenarioReportReader).errors || []).length) {
    throw new Error('The report does not prove the selected real-model scenario completed successfully.');
  }
  return { model, title, passed: 1 };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [, , model, reportPath] = process.argv;
  verifyRealModelEvidence(JSON.parse(fs.readFileSync(reportPath!, 'utf8')), model);
  console.log(`Verified one completed ${model} real-model scenario.`);
}
