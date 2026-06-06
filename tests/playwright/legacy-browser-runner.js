import { expect } from '@playwright/test';

function buildFailureMessage(testPath, failures, pageErrors, recentMessages) {
  const parts = [`${testPath} reported browser-test failures.`];
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

export async function runLegacyBrowserScript(page, testPath, options = {}) {
  const pageErrors = [];
  const onPageError = error => {
    pageErrors.push(error?.message || String(error));
  };
  page.on('pageerror', onPageError);

  try {
    if (options.viewport) await page.setViewportSize(options.viewport);
    await page.goto('/app', { waitUntil: 'load' });
    await page.waitForFunction(() => window._labState && typeof window.navigate === 'function', null, {
      timeout: options.readyTimeout ?? 15_000,
    });

    const result = await page.evaluate(async ({ testPath, settleMs }) => {
      const failures = [];
      const messages = [];
      const originalLog = console.log;
      const originalError = console.error;

      function cleanConsoleTextInPage(args) {
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

      function collectResultFailuresInPage(results, prefix = 'window.__TEST_RESULTS') {
        if (!results || typeof results !== 'object') return;
        const failed = Number(results.fail ?? results.failed);
        if (Number.isFinite(failed) && failed > 0) {
          const passed = Number(results.pass ?? results.passed ?? 0);
          failures.push(`${prefix}: ${passed} passed, ${failed} failed`);
        }
        for (const [key, value] of Object.entries(results)) {
          if (value && typeof value === 'object') collectResultFailuresInPage(value, `${prefix}.${key}`);
        }
      }

      function record(kind, args) {
        const clean = cleanConsoleTextInPage(args);
        if (!clean) return;
        messages.push({ kind, text: clean });
        for (const line of clean.split('\n').map(part => part.trim()).filter(Boolean)) {
          if (line.startsWith('FAIL ') || line.startsWith('FAIL:') || line.includes('\u274c') || line.includes('\u274C')) {
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

      let returnValue = null;
      try {
        const response = await fetch(testPath);
        if (!response.ok) throw new Error(`Failed to fetch ${testPath}: ${response.status}`);
        const source = await response.text();
        returnValue = await Function(source)();
        await new Promise(resolve => setTimeout(resolve, settleMs));
        collectResultFailuresInPage(returnValue, 'returnValue');
        collectResultFailuresInPage(window.__TEST_RESULTS);
        collectResultFailuresInPage(window.__testResults, 'window.__testResults');
      } catch (error) {
        failures.push(`CRASH ${testPath}: ${error?.message || String(error)}`);
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
