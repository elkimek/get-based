import type { Page } from '@playwright/test';

interface BrowserMessage { kind: string; text: string; }
interface BrowserScriptOptions { viewport?: Parameters<Page['setViewportSize']>[0]; readyTimeout?: number; settleMs?: number; }
interface FixtureWindow extends Window {
  fetchWithRetry?: (url: RequestInfo | URL, retries?: number) => Promise<string>;
  __TEST_RESULTS?: unknown;
  __testResults?: unknown;
}

import { expect } from '@playwright/test';

function buildFailureMessage(testPath: string, failures: readonly string[], pageErrors: readonly string[], recentMessages: readonly BrowserMessage[]) {
  const parts = [`${testPath} reported browser-fixture failures.`];
  if (failures.length) {
    parts.push('\nFailures:');
    parts.push(failures.map(line => `- ${line}`).join('\n'));
  }
  if (pageErrors.length) {
    parts.push('\nPage errors:');
    parts.push(pageErrors.map(line => `- ${line}`).join('\n'));
  }
  if (recentMessages.length) {
    parts.push('\nRecent browser console:');
    parts.push(recentMessages.slice(-20).map(({ kind, text }) => `- ${kind}: ${text}`).join('\n'));
  }
  return parts.join('\n');
}

export async function runBrowserScript(page: Page, testPath: string, options: BrowserScriptOptions = {}) {
  const pageErrors: string[] = [];
  const onPageError = (error: Error) => {
    pageErrors.push(error?.message || String(error));
  };
  page.on('pageerror', onPageError);

  try {
    if (options.viewport) await page.setViewportSize(options.viewport);
    await page.goto('/app', { waitUntil: 'load' });
    await page.waitForFunction(async () => {
      const { state } = await import('/js/state.js');
      return state && document.getElementById('main-content');
    }, null, {
      timeout: options.readyTimeout ?? 15_000,
    });

    const result = await page.evaluate(async ({ testPath, settleMs }) => {
      const failures: string[] = [];
      const messages: BrowserMessage[] = [];
      const originalLog = console.log;
      const originalError = console.error;

      function cleanConsoleTextInPage(args: readonly unknown[]) {
        return args
          .map(value => {
            if (typeof value === 'string') return value;
            try { return JSON.stringify(value); }
            catch (_) { return String(value); }
          })
          .join(' ')
          .replace(/%c/g, '')
          .replace(/(?:color|background|font-weight|font-size|font-family|padding|border-radius|margin|display)\s*:[^;]+;?/g, '')
          .trim();
      }

      function collectResultFailuresInPage(results: unknown, prefix = 'window.__TEST_RESULTS') {
        if (!results || typeof results !== 'object') return;
        const failed = Number((results as Record<string, unknown>).fail ?? (results as Record<string, unknown>).failed);
        if (Number.isFinite(failed) && failed > 0) {
          const passed = Number((results as Record<string, unknown>).pass ?? (results as Record<string, unknown>).passed ?? 0);
          failures.push(`${prefix}: ${passed} passed, ${failed} failed`);
        }
        for (const [key, value] of Object.entries(results)) {
          if (value && typeof value === 'object') collectResultFailuresInPage(value, `${prefix}.${key}`);
        }
      }

      function record(kind: string, args: readonly unknown[]) {
        const clean = cleanConsoleTextInPage(args);
        if (!clean) return;
        messages.push({ kind, text: clean });
        for (const line of clean.split('\n').map(part => part.trim()).filter(Boolean)) {
          if (line.startsWith('FAIL ') || line.startsWith('FAIL:') || /[\u2717\u2718\u274c]/i.test(line)) {
            failures.push(line);
          }
          const summary = line.match(/(\d+)\s+passed[,\s]+(\d+)\s+failed/i);
          if (summary && Number(summary[2]) > 0) {
            failures.push(`SUMMARY: ${summary[2]} failed - ${line}`);
          }
        }
      }

      console.log = (...args) => {
        record('log', args);
        originalLog(...args);
      };
      console.error = (...args) => {
        record('error', args);
        originalError(...args);
      };

      let returnValue: unknown = null;
      try {
        if (!(window as FixtureWindow).fetchWithRetry) {
          (window as FixtureWindow).fetchWithRetry = async function(url, retries = 3) {
            for (let i = 0; i < retries; i++) {
              try {
                return await fetch(url).then(response => {
                  if (!response.ok) throw new (Error as new (message: unknown) => Error)(response.status);
                  return response.text();
                });
              } catch (error) {
                if (i === retries - 1) throw new Error(`Failed to fetch ${url} after ${retries} attempts`);
              }
            }
            return '';
          };
        }
        const response = await fetch(testPath);
        if (!response.ok) throw new Error(`Failed to fetch ${testPath}: ${response.status}`);
        const source = await response.text();
        returnValue = await Function(source)();
        await new Promise(resolve => setTimeout(resolve, settleMs));
        collectResultFailuresInPage(returnValue, 'returnValue');
        collectResultFailuresInPage((window as FixtureWindow).__TEST_RESULTS);
        collectResultFailuresInPage((window as FixtureWindow).__testResults, 'window.__testResults');
      } catch (error) {
        failures.push(`CRASH ${testPath}: ${(error as { message?: unknown } | null)?.message || String(error)}`);
      } finally {
        console.log = originalLog;
        console.error = originalError;
      }

      return { failures, messages, returnValue };
    }, {
      testPath,
      settleMs: options.settleMs ?? 150,
    });

    const failures = [...result.failures, ...pageErrors.map(error => `PAGE ERROR: ${error}`)];
    const failureText = buildFailureMessage(testPath, result.failures, pageErrors, result.messages);
    expect(failures, failureText).toEqual([]);

    return result;
  } finally {
    page.off('pageerror', onPageError);
  }
}
