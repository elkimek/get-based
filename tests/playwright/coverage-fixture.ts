import type { Page, Response, TestInfo } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { expect, test as base } from '@playwright/test';
import { sourceFingerprint } from '../../scripts/coverage-model-helpers.mjs';

interface BrowserCoverageEntry {
  url: string;
  scriptId?: string;
  source?: unknown;
  text?: unknown;
  ranges?: unknown;
  functions?: unknown;
  rawScriptCoverage?: { functions?: unknown } | undefined;
}
interface WorkerCoverageReply { result?: BrowserCoverageEntry[]; scriptSource?: string; }
interface ParsedWorkerReply {
  id?: unknown;
  error?: { message?: unknown } | null;
  result?: WorkerCoverageReply | null;
}
type CoverageTestInfo = Pick<TestInfo, 'title' | 'file' | 'workerIndex' | 'repeatEachIndex'> & {
  titlePath?: string[] | (() => string[]);
};
type WorkerState = Awaited<ReturnType<typeof startWorkerCoverage>>;

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const coverageDir = process.env.PLAYWRIGHT_COVERAGE_DIR ||
  path.join(repoRoot, 'tests', '.playwright-coverage');
interface PageCoverageState {
  workerState: WorkerState | null;
  entries: ReturnType<typeof shrinkEntry>[];
}
const coverageStates = new WeakMap<Page, PageCoverageState>();
const coverageNavigationInstalled = new WeakSet<Page>();
const LEGAL_ACCEPTANCE_KEY = 'labcharts-legal-acceptance';
const TEST_LEGAL_ACCEPTANCE = {
  accepted: true,
  termsVersion: '2026-08-22',
  privacyVersion: '2026-08-22',
  policyScope: 'self-hosted-notice',
  acceptedAt: '2026-06-23T00:00:00.000Z',
  appVersion: 'playwright-fixture',
  location: 'playwright-fixture',
};
const TEST_AI_TRANSPARENCY_KEY = 'labcharts-ai-transparency-acknowledgement';
const TEST_AI_TRANSPARENCY = {
  version: '2026-08-31',
  acknowledged: true,
  acknowledgedAt: '2026-08-31T00:00:00.000Z',
};
const TEST_AI_ROUTE_CONFIRMATION_KEY = 'labcharts-ai-route-confirmations';
const TEST_AI_ROUTE_CONFIRMATION = {
  version: '2026-08-31',
  confirmations: {
    'ollama:http://10.222.88.195:11434': {
      confirmed: true,
      confirmedAt: '2026-08-31T00:00:00.000Z',
    },
  },
};

async function seedCurrentLegalAcceptance(page: Page) {
  await page.addInitScript(({ key, payload, aiKey, aiPayload, routeKey, routePayload }) => {
    try {
      localStorage.setItem(key, JSON.stringify(payload));
      localStorage.setItem(aiKey, JSON.stringify(aiPayload));
      localStorage.setItem(routeKey, JSON.stringify(routePayload));
    } catch {
      // Individual tests that deliberately exercise blocked storage can still
      // remove/override this after navigation. The default browser-suite
      // contract is an already-accepted returning user so feature tests are
      // not hidden behind the mandatory legal gate.
    }
  }, {
    key: LEGAL_ACCEPTANCE_KEY,
    payload: TEST_LEGAL_ACCEPTANCE,
    aiKey: TEST_AI_TRANSPARENCY_KEY,
    aiPayload: TEST_AI_TRANSPARENCY,
    routeKey: TEST_AI_ROUTE_CONFIRMATION_KEY,
    routePayload: TEST_AI_ROUTE_CONFIRMATION,
  });
}

async function waitForAppReadiness(page: Page) {
  const current = new URL(page.url());
  if (current.pathname === '/app') {
    await page.locator('html[data-app-ready]').waitFor({
      state: 'attached',
      timeout: 15_000,
    });
  }
}

function installAppReadinessAwareNavigation(page: Page) {
  for (const method of ['goto', 'reload', 'goBack', 'goForward'] as const) {
    const original = (page[method] as (...args: unknown[]) => Promise<Response | null>).bind(page);
    page[method] = async (...args) => {
      const response = await original(...args);
      await waitForAppReadiness(page);
      return response;
    };
  }
}

function isCoverageEnabled() {
  return process.env.PLAYWRIGHT_SUITE_COVERAGE === '1' ||
    process.env.PLAYWRIGHT_SUITE_COVERAGE === 'true';
}

function safeName(value: unknown) {
  return String(value || 'test')
    .replace(/[^a-z0-9_.-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 140) || 'test';
}

function titlePathFor(testInfo: CoverageTestInfo) {
  if (typeof testInfo.titlePath === 'function') return testInfo.titlePath();
  if (Array.isArray(testInfo.titlePath)) return testInfo.titlePath;
  return [testInfo.title];
}

function coverageFile(testInfo: CoverageTestInfo, label: string) {
  const title = safeName(titlePathFor(testInfo).join(' '));
  const suffix = [
    safeName(label),
    `w${testInfo.workerIndex}`,
    `r${testInfo.repeatEachIndex}`,
    process.pid,
    Date.now(),
    Math.random().toString(36).slice(2, 8),
  ].join('-');
  return path.join(coverageDir, `${title}-${suffix}.json`);
}

function shrinkEntry(entry: BrowserCoverageEntry) {
  const source = entry.source || entry.text || '';
  return {
    url: entry.url,
    ranges: entry.ranges,
    functions: entry.functions,
    ...sourceFingerprint(source),
    rawScriptCoverage: entry.rawScriptCoverage
      ? { functions: entry.rawScriptCoverage.functions }
      : undefined,
  };
}

async function startWorkerCoverage(page: Page) {
  const client = await page.context().newCDPSession(page);
  const sessions = new Map<string, { targetInfo: unknown; started: boolean; detached: boolean; ready: Promise<void> }>();
  const pending = new Map<string, { resolve: (value: WorkerCoverageReply) => void; reject: (reason?: unknown) => void; timer: ReturnType<typeof setTimeout> }>();
  let nextId = 1;

  const sendToTarget = async (sessionId: string, method: string, params: Record<string, unknown> = {}) => {
    const id = nextId;
    nextId += 1;
    const key = `${sessionId}:${id}`;
    const response = new Promise<WorkerCoverageReply>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(key);
        reject(new Error(`CDP ${method} timed out for worker target`));
      }, 5000);
      pending.set(key, { resolve, reject, timer });
    });
    try {
      await client.send('Target.sendMessageToTarget', {
        sessionId,
        message: JSON.stringify({ id, method, params }),
      });
    } catch (error) {
      const waiter = pending.get(key);
      if (waiter) {
        pending.delete(key);
        clearTimeout(waiter.timer);
      }
      throw error;
    }
    return response;
  };

  client.on('Target.receivedMessageFromTarget', ({ sessionId, message }) => {
    let parsed: ParsedWorkerReply;
    try {
      parsed = JSON.parse(message) as ParsedWorkerReply;
    } catch {
      return;
    }
    if (!parsed.id) return;
    const key = `${sessionId}:${parsed.id}`;
    const waiter = pending.get(key);
    if (!waiter) return;
    pending.delete(key);
    clearTimeout(waiter.timer);
    if (parsed.error) waiter.reject(new Error((parsed.error.message || JSON.stringify(parsed.error)) as string));
    else waiter.resolve(parsed.result || {});
  });

  client.on('Target.attachedToTarget', async ({ sessionId, targetInfo }) => {
    const isWorker = targetInfo?.type === 'worker' || targetInfo?.type === 'shared_worker';
    const session = { targetInfo, started: false, detached: false, ready: Promise.resolve() };
    if (isWorker) sessions.set(sessionId, session);
    session.ready = (async () => {
      try {
        if (isWorker) {
          await Promise.all([
            sendToTarget(sessionId, 'Profiler.enable'),
            sendToTarget(sessionId, 'Debugger.enable'),
          ]);
          await sendToTarget(sessionId, 'Profiler.startPreciseCoverage', {
            callCount: true,
            detailed: true,
          });
          const session = sessions.get(sessionId);
          if (session) session.started = true;
        }
      } catch {
        // Short-lived workers can detach before profiler setup completes.
      } finally {
        await sendToTarget(sessionId, 'Runtime.runIfWaitingForDebugger').catch(() => {});
      }
    })();
    await session.ready;
  });

  client.on('Target.detachedFromTarget', ({ sessionId }) => {
    const session = sessions.get(sessionId);
    if (session) session.detached = true;
  });

  await client.send('Target.setAutoAttach', {
    autoAttach: true,
    waitForDebuggerOnStart: true,
    flatten: false,
  });

  return { client, sessions, sendToTarget };
}

async function stopWorkerCoverage(workerState: WorkerState | null | undefined) {
  if (!workerState) return [];
  const entries: BrowserCoverageEntry[] = [];
  try {
    for (const [sessionId, session] of workerState.sessions) {
      await session.ready;
      if (!session.started || session.detached) continue;
      try {
        const coverage = await workerState.sendToTarget(sessionId, 'Profiler.takePreciseCoverage');
        const scripts = await Promise.all((coverage.result || []).map(async entry => {
          if (!entry.url || !entry.scriptId) return null;
          const source = await workerState.sendToTarget(sessionId, 'Debugger.getScriptSource', {scriptId: entry.scriptId})
            .catch(() => null);
          if (!source?.scriptSource) return null;
          return {url: entry.url, source: source.scriptSource, functions: entry.functions,
            rawScriptCoverage: {functions: entry.functions}};
        }));
        for (const script of scripts) if (script) entries.push(script);
        await workerState.sendToTarget(sessionId, 'Profiler.stopPreciseCoverage').catch(() => {});
        await workerState.sendToTarget(sessionId, 'Profiler.disable').catch(() => {});
      } catch {
        // Workers can disappear during page teardown; page coverage remains useful.
      }
    }
  } finally {
    await workerState.client.send('Target.setAutoAttach', {
      autoAttach: false,
      waitForDebuggerOnStart: false,
      flatten: false,
    }).catch(() => {});
    await workerState.client.detach().catch(() => {});
  }
  return entries;
}

async function beginPageRecording(page: Page) {
  await page.coverage.startJSCoverage({ resetOnNavigation: false, reportAnonymousScripts: false });
}

async function appendPageRecording(page: Page, state: PageCoverageState) {
  for (const entry of await page.coverage.stopJSCoverage()) state.entries.push(shrinkEntry(entry));
}

function installCoverageNavigation(page: Page) {
  if (coverageNavigationInstalled.has(page)) return;
  coverageNavigationInstalled.add(page);
  for (const method of ['goto', 'reload', 'goBack', 'goForward'] as const) {
    const original = (page[method] as (...args: unknown[]) => Promise<Response | null>).bind(page);
    page[method] = async (...args) => {
      const state = coverageStates.get(page);
      if (state && page.url() !== 'about:blank') {
        // V8 may collect the old document before the test ends even with
        // resetOnNavigation disabled. Capture its evidence before leaving it.
        await appendPageRecording(page, state);
        await beginPageRecording(page);
      }
      return original(...args);
    };
  }
}

export async function startPageCoverage(page: Page) {
  if (!isCoverageEnabled() || coverageStates.has(page)) return;
  let workerState: WorkerState | null = null;
  try {
    workerState = await startWorkerCoverage(page);
  } catch {
    workerState = null;
  }
  await beginPageRecording(page);
  coverageStates.set(page, { workerState, entries: [] });
  installCoverageNavigation(page);
}

/** Playwright also resumes new workers; await profiler setup before measured work. */
export async function waitForWorkerCoverage(page: Page) {
  const state = coverageStates.get(page)?.workerState;
  if (state) await Promise.all([...state.sessions.values()].map(session => session.ready));
}

export async function stopPageCoverage(page: Page, testInfo: CoverageTestInfo, label = 'page') {
  const state = coverageStates.get(page);
  if (!state) return;
  let coverageError: unknown = null;
  try {
    await appendPageRecording(page, state);
  } catch (error) {
    coverageError = error;
  } finally {
    coverageStates.delete(page);
  }
  for (const entry of await stopWorkerCoverage(state.workerState)) state.entries.push(shrinkEntry(entry));
  fs.mkdirSync(coverageDir, { recursive: true });
  fs.writeFileSync(coverageFile(testInfo, label), JSON.stringify({
    title: testInfo.title,
    titlePath: titlePathFor(testInfo),
    file: path.relative(repoRoot, testInfo.file).split(path.sep).join('/'),
    label,
    generatedAt: new Date().toISOString(),
    entries: state.entries,
  }));
  if (coverageError) throw coverageError;
}

// Component and lifecycle fixtures own their initial browser state. Collect
// their real execution without adding acceptance data or readiness waits.
export const coverageOnlyTest = base.extend({
  page: async ({ page }, use, testInfo) => {
    if (!isCoverageEnabled()) {
      await use(page);
      return;
    }

    await startPageCoverage(page);
    try {
      await use(page);
    } finally {
      await stopPageCoverage(page, testInfo);
    }
  },
});

export const test = coverageOnlyTest.extend<{ seedLegalAcceptance: boolean }>({
  seedLegalAcceptance: [true, { option: true }],
  page: async ({ page, seedLegalAcceptance }, use) => {
    if (seedLegalAcceptance) await seedCurrentLegalAcceptance(page);
    installAppReadinessAwareNavigation(page);
    await use(page);
  },
});

export { expect };
