import fs from 'node:fs';
import path from 'node:path';
import type { FullConfig, FullResult, Reporter, Suite, TestCase, TestResult } from '@playwright/test/reporter';

export const KIT_PROJECTS = ['kit-chromium', 'kit-firefox', 'kit-webkit', 'kit-mobile-webkit'] as const;
export interface KitCase {
  id: string; file: string; project: string; title: string;
  titlePath?: string[]; repeatEachIndex?: number; declaredExpectedStatus?: string;
  declaredAnnotations?: {type: string; description?: string}[]; outcome?: string; attemptCount?: number;
  status?: string | undefined; expectedStatus?: string | undefined; annotations?: {type: string; description?: string}[];
}
const nonChromium = ['kit-firefox', 'kit-webkit', 'kit-mobile-webkit'];
const desktopSupplementExcluded = ['kit-firefox', 'kit-webkit'];
const capabilitySkips = [
  {file: 'sveltekit-release-accessibility.spec.ts', title: 'true headless browser zoom retains keyboard Settings/provider journeys and private draft disposal', projects: nonChromium,
    reason: 'The genuine chrome.tabs zoom proof uses bundled Chromium; keyboard Nutrition runs cross-engine separately.'},
  {file: 'sveltekit-startup-performance.spec.ts', title: 'defers Settings CSS and optional attestation vendors until needed', projects: nonChromium,
    reason: 'CDP startup diagnostics are Chromium-specific'},
  {file: 'sveltekit-main-route-acceptance.spec.ts', title: 'Dark main routes retain keyboard access, scoped accessibility and unchanged profiles after a stopped-origin launch', projects: desktopSupplementExcluded,
    reason: 'This finite supplement selects desktop Chromium and emulated mobile WebKit only.'},
  {file: 'sveltekit-main-route-acceptance.spec.ts', title: 'Biometric empty-metric calls to action retain readable text across six themes and two widths', projects: desktopSupplementExcluded,
    reason: 'Finite desktop Chromium and emulated mobile WebKit contrast check.'},
  {file: 'sveltekit-category.spec.ts', title: 'Category high-status badges and settled adverse trends retain semantic red and readable contrast across six themes', projects: desktopSupplementExcluded,
    reason: 'Finite actual desktop Chromium and emulated mobile WebKit contrast matrix.'},
  {file: 'sveltekit-install.spec.ts', title: 'actual headless PWA install, standalone launch and zero-client offline launch retain local state', projects: nonChromium,
    reason: 'The installed-app protocol is specific to Chromium; other engines have separate browser acceptance.'},
];
export function allowedKitSkip(test: KitCase): boolean {
  const annotations = (test.annotations || []).filter(annotation => annotation.type === 'skip' || annotation.type === 'fixme');
  return annotations.length === 1 && annotations[0]!.type === 'skip' && capabilitySkips.some(rule =>
    path.posix.basename(test.file.replaceAll('\\', '/')) === rule.file && test.title === rule.title
      && rule.projects.includes(test.project) && annotations[0]!.description === rule.reason);
}
export function validateKitCases(tests: KitCase[], execution: boolean, allowCapabilityOnlyShard = false): string[] {
  const issues: string[] = [];
  if (!tests.length) issues.push('No SvelteKit acceptance cases were collected');
  const ids = new Set<string>();
  for (const test of tests) {
    if (ids.has(test.id)) issues.push(`Duplicate test identity: ${test.id}`);
    ids.add(test.id);
    if (!(KIT_PROJECTS as readonly string[]).includes(test.project)) issues.push(`Unexpected project ${test.project}: ${test.id}`);
    if (!/^tests\/pwa\/sveltekit[^/]*\.spec\.ts$/.test(test.file.replaceAll('\\', '/'))) issues.push(`Unexpected test owner: ${test.file}`);
    if (test.declaredExpectedStatus !== undefined && test.declaredExpectedStatus !== 'passed'
      && !(test.declaredExpectedStatus === 'skipped' && allowedKitSkip({...test, annotations: test.declaredAnnotations || []}))) issues.push(`Unapproved declared expectation: ${test.id}`);
    if (!execution) continue;
    if (test.attemptCount !== undefined && test.attemptCount !== 1) issues.push(`Unexpected attempt count: ${test.id} (${test.attemptCount})`);
    if (test.outcome !== undefined && !['expected', 'skipped'].includes(test.outcome)) issues.push(`Unexpected outcome: ${test.id} (${test.outcome})`);
    if (!test.status) issues.push(`Missing terminal result: ${test.id}`);
    else if (test.status === 'skipped') {
      if (test.expectedStatus !== 'skipped') issues.push(`Skipped case lacks expected skipped status: ${test.id}`);
      if (!allowedKitSkip(test)) issues.push(`Unapproved skip: ${test.id}`);
    } else if (test.status !== 'passed' || test.expectedStatus !== 'passed') issues.push(`Unsuccessful acceptance case: ${test.id} (${test.status}/${test.expectedStatus})`);
  }
  if (execution && !tests.some(test => test.status && test.status !== 'skipped')
    && !(allowCapabilityOnlyShard && tests.length > 0 && tests.every(test => test.status === 'skipped' && test.expectedStatus === 'skipped' && allowedKitSkip(test)))) issues.push('No SvelteKit acceptance case executed');
  return issues;
}
export function portableKitIdentity(file: string, project: string, titlePath: string[], repeatEachIndex: number, root = process.cwd()): Pick<KitCase, 'id' | 'file' | 'project' | 'titlePath' | 'repeatEachIndex'> {
  const portableFile = path.relative(root, file).replaceAll('\\', '/');
  return {id: JSON.stringify([project, portableFile, titlePath, repeatEachIndex]), file: portableFile, project, titlePath, repeatEachIndex};
}
function identity(test: TestCase, root: string): KitCase {
  return {...portableKitIdentity(test.location.file, test.parent.project()?.name || '', test.titlePath(), test.repeatEachIndex, root), title: test.title,
    declaredExpectedStatus: test.expectedStatus, declaredAnnotations: [...test.annotations]};
}
/** Fail closed on wrong projects, missing execution and newly skipped acceptance. */
export default class KitAcceptanceReporter implements Reporter {
  private cases: KitCase[] = [];
  private readonly runnerIds = new Map<string, KitCase>();
  private readonly execution = !process.argv.some(argument => argument === '--list' || argument.startsWith('--list='));
  private readonly enforce = process.env['CI'] === 'true' || process.env['GITHUB_ACTIONS'] === 'true' || process.env['GETBASED_KIT_ACCEPTANCE_GUARD'] === '1';
  onBegin(config: FullConfig, suite: Suite): void {
    const root = config.configFile ? path.dirname(config.configFile) : process.cwd();
    this.cases = suite.allTests().map(test => {
      const entry = identity(test, root); this.runnerIds.set(test.id, entry); return entry;
    });
  }
  onTestEnd(test: TestCase, result: TestResult): void {
    const entry = this.runnerIds.get(test.id);
    if (!entry) throw new Error(`Result for uncollected SvelteKit test: ${test.id}`);
    Object.assign(entry, {status: result.status, expectedStatus: test.expectedStatus, annotations: result.annotations, outcome: test.outcome(), attemptCount: (entry.attemptCount || 0) + 1});
  }
  async onEnd(result: FullResult): Promise<{status?: FullResult['status']}> {
    const issues = validateKitCases(this.cases, this.execution, true);
    const output = process.env['GETBASED_KIT_GUARD_REPORT'];
    if (output) {
      fs.mkdirSync(path.dirname(output), {recursive: true});
      fs.writeFileSync(output, JSON.stringify({schemaVersion: 1, execution: this.execution, status: result.status, context: {commit: process.env['GITHUB_SHA'] || null, runId: process.env['GITHUB_RUN_ID'] || null, runAttempt: process.env['GITHUB_RUN_ATTEMPT'] || null}, issues, tests: this.cases}, null, 2) + '\n');
    }
    if (this.enforce && issues.length) {
      console.error(`SvelteKit acceptance guard failed:\n${issues.join('\n')}`);
      return {status: 'failed'};
    }
    return {};
  }
}
