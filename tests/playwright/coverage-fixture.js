import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { expect, test as base } from '@playwright/test';
import { sourceFingerprint } from '../../scripts/coverage-model-helpers.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const coverageDir = process.env.PLAYWRIGHT_COVERAGE_DIR ||
  path.join(repoRoot, 'tests', '.playwright-coverage');
const startedPages = new WeakSet();
const coverageStates = new WeakMap();
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
const TEST_CLOUD_AI_CONSENT_KEY = 'labcharts-cloud-ai-consent';
const TEST_CLOUD_AI_CONSENT = {
  version: '2026-08-31',
  approvals: Object.fromEntries([
    'openrouter',
    'ppq',
    'venice',
    'xai',
    'elevenlabs',
    'routstr:https://routstr.example',
    'custom:https://custom.example',
  ].map(scope => [scope, { accepted: true, acceptedAt: '2026-08-31T00:00:00.000Z' }])),
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

async function seedCurrentLegalAcceptance(page) {
  await page.addInitScript(({ key, payload, aiKey, aiPayload, cloudKey, cloudPayload, routeKey, routePayload }) => {
    try {
      localStorage.setItem(key, JSON.stringify(payload));
      localStorage.setItem(aiKey, JSON.stringify(aiPayload));
      localStorage.setItem(cloudKey, JSON.stringify(cloudPayload));
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
    cloudKey: TEST_CLOUD_AI_CONSENT_KEY,
    cloudPayload: TEST_CLOUD_AI_CONSENT,
    routeKey: TEST_AI_ROUTE_CONFIRMATION_KEY,
    routePayload: TEST_AI_ROUTE_CONFIRMATION,
  });
}

async function waitForAppReadiness(page) {
  const current = new URL(page.url());
  if (current.pathname === '/app') {
    await page.locator('html[data-app-ready]').waitFor({
      state: 'attached',
      timeout: 15_000,
    });
  }
}

function installAppReadinessAwareNavigation(page) {
  for (const method of ['goto', 'reload', 'goBack', 'goForward']) {
    const original = page[method].bind(page);
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

function safeName(value) {
  return String(value || 'test')
    .replace(/[^a-z0-9_.-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 140) || 'test';
}

function titlePathFor(testInfo) {
  if (typeof testInfo.titlePath === 'function') return testInfo.titlePath();
  if (Array.isArray(testInfo.titlePath)) return testInfo.titlePath;
  return [testInfo.title];
}

function coverageFile(testInfo, label) {
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

function shrinkEntry(entry) {
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

async function startWorkerCoverage(page) {
  const client = await page.context().newCDPSession(page);
  const sessions = new Map();
  const pending = new Map();
  let nextId = 1;

  const sendToTarget = async (sessionId, method, params = {}) => {
    const id = nextId;
    nextId += 1;
    const key = `${sessionId}:${id}`;
    const response = new Promise((resolve, reject) => {
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
    let parsed;
    try {
      parsed = JSON.parse(message);
    } catch {
      return;
    }
    if (!parsed.id) return;
    const key = `${sessionId}:${parsed.id}`;
    const waiter = pending.get(key);
    if (!waiter) return;
    pending.delete(key);
    clearTimeout(waiter.timer);
    if (parsed.error) waiter.reject(new Error(parsed.error.message || JSON.stringify(parsed.error)));
    else waiter.resolve(parsed.result || {});
  });

  client.on('Target.attachedToTarget', async ({ sessionId, targetInfo }) => {
    const isWorker = targetInfo?.type === 'worker' || targetInfo?.type === 'shared_worker';
    if (isWorker) sessions.set(sessionId, { targetInfo, started: false, detached: false });
    try {
      if (isWorker) {
        await sendToTarget(sessionId, 'Profiler.enable');
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

async function stopWorkerCoverage(workerState) {
  if (!workerState) return [];
  const entries = [];
  try {
    for (const [sessionId, session] of workerState.sessions) {
      if (!session.started || session.detached) continue;
      try {
        const coverage = await workerState.sendToTarget(sessionId, 'Profiler.takePreciseCoverage');
        for (const entry of coverage.result || []) {
          entries.push({
            url: entry.url,
            functions: entry.functions,
            rawScriptCoverage: { functions: entry.functions },
          });
        }
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

export async function startPageCoverage(page) {
  if (!isCoverageEnabled() || startedPages.has(page)) return;
  let workerState = null;
  try {
    workerState = await startWorkerCoverage(page);
  } catch {
    workerState = null;
  }
  await page.coverage.startJSCoverage({
    resetOnNavigation: false,
    reportAnonymousScripts: false,
    includeRawScriptCoverage: true,
  });
  startedPages.add(page);
  coverageStates.set(page, { workerState });
}

export async function stopPageCoverage(page, testInfo, label = 'page') {
  if (!isCoverageEnabled() || !startedPages.has(page)) return;
  const state = coverageStates.get(page) || {};
  let entries = [];
  let coverageError = null;
  try {
    entries = await page.coverage.stopJSCoverage();
  } catch (error) {
    coverageError = error;
  } finally {
    startedPages.delete(page);
    coverageStates.delete(page);
  }
  entries.push(...await stopWorkerCoverage(state.workerState));
  fs.mkdirSync(coverageDir, { recursive: true });
  fs.writeFileSync(coverageFile(testInfo, label), JSON.stringify({
    title: testInfo.title,
    titlePath: titlePathFor(testInfo),
    file: path.relative(repoRoot, testInfo.file).split(path.sep).join('/'),
    label,
    generatedAt: new Date().toISOString(),
    entries: entries.map(shrinkEntry),
  }));
  if (coverageError) throw coverageError;
}

export const test = base.extend({
  seedLegalAcceptance: [true, { option: true }],
  page: async ({ page, seedLegalAcceptance }, use, testInfo) => {
    if (seedLegalAcceptance) await seedCurrentLegalAcceptance(page);
    installAppReadinessAwareNavigation(page);

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

export { expect };
