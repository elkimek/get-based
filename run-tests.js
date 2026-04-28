#!/usr/bin/env node
// Headless browser test runner for Get Based
// Usage: node run-tests.js (requires http server on :8000)
// Or:    ./run-tests.sh (starts server automatically)

import puppeteer from 'puppeteer';

const TEST_FILES = [
  'tests/test-crypto.js',
  'tests/test-folder-backup.js',
  'tests/test-chat-threads.js',
  'tests/test-chat-actions.js',
  'tests/test-mobile.js',
  'tests/test-demo.js',
  'tests/test-openrouter.js',
  'tests/test-tour.js',
  'tests/test-phase-ranges.js',
  'tests/test-cycle-improvements.js',
  'tests/test-cycle-tour.js',
  'tests/test-custom-personality.js',
  'tests/test-changelog.js',
  'tests/test-audit.js',
  'tests/test-prelab.js',
  'tests/test-schema.js',
  'tests/test-unit-import.js',
  'tests/test-pii.js',
  'tests/test-image-utils.js',
  'tests/test-emf.js',
  'tests/test-integration-batch2.js',
  'tests/test-hardware.js',
  'tests/test-dna.js',
  'tests/test-dna-illumina-and-valence.js',
  'tests/test-dna-mtdna-subclades.js',
  'tests/test-wearables.js',
  'tests/test-wearables-manual.js',
  'tests/test-wearables-fetchers.js',
  'tests/test-wearables-sync-flow.js',
  'tests/test-wearables-ui-flows.js',
  'tests/test-wearables-runtime-config.js',
  'tests/test-lens-multi-query.js',
  'tests/test-dashboard-knowledge-base.js',
  'tests/test-dashboard-data-protection.js',
  'tests/test-dashboard-genetics-empty.js',
  'tests/test-chat-panel-ux.js',
  'tests/test-venice-e2ee.js',
  'tests/test-change-history.js',
  'tests/test-sync.js',
  'tests/test-biometrics.js',
  'tests/test-recommendations.js',
  'tests/test-dna-recommendations.js',
  'tests/test-cashu-wallet.js',
  'tests/test-custom-api.js',
  'tests/test-custom-lens.js',
  'tests/test-adapters.js',
  'tests/test-biostarks-adapter.js',
  'tests/test-provenance.js',
  'tests/test-supplement-impact.js',
  'tests/test-export-import.js',
  'tests/test-ui-flows.js',
  'tests/test-normalize-units.js',
  'tests/test-trend-alerts.js',
  'tests/test-data-pipeline.js',
  'tests/test-calculated-markers.js',
  'tests/test-lens-parsers.js',
  'tests/test-lens-local-worker.js',
  'tests/test-markdown.js'
];

const PORT = process.env.PORT || 8000;

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();

  const fails = [];
  let listening = false;

  page.on('console', msg => {
    if (!listening) return;
    const text = msg.text();

    // Strip %c style args for clean terminal output
    const clean = text.replace(/%c/g, '').replace(/(?:color|background|font-weight|font-size|font-family|padding|border-radius|margin|display)\s*:[^;]+;?/g, '').trim();
    if (!clean) return;

    // Per-assert failure line (both "FAIL " and "FAIL:" formats)
    if (clean.startsWith('FAIL ') || clean.startsWith('FAIL:') || clean.startsWith('PAGE ERROR') || clean.includes('\u274C')) {
      fails.push(clean);
      console.log('\x1b[31m' + clean + '\x1b[0m');
      return;
    }
    // Summary lines like "115 passed, 25 failed, 140 total" — flag if any failed
    const summaryMatch = clean.match(/(\d+)\s+passed[,\s]+(\d+)\s+failed/i);
    if (summaryMatch && parseInt(summaryMatch[2], 10) > 0) {
      const failedCount = parseInt(summaryMatch[2], 10);
      fails.push(`SUMMARY: ${failedCount} failed — ${clean}`);
      console.log('\x1b[31m' + clean + '\x1b[0m');
      return;
    }
    if (clean.includes('passed') || clean.includes('Results')) {
      console.log('\x1b[36m' + clean + '\x1b[0m');
    } else if (clean.startsWith('\u25B6')) {
      console.log('\x1b[1m' + clean + '\x1b[0m');
    }
  });

  page.on('pageerror', err => {
    if (!listening) return;
    const msg = 'PAGE ERROR: ' + err.message;
    fails.push(msg);
    console.log('\x1b[31m' + msg + '\x1b[0m');
  });

  try {
    await page.goto(`http://localhost:${PORT}/app`, { waitUntil: 'networkidle2', timeout: 15000 });
  } catch (e) {
    console.error(`\x1b[31mCannot connect to http://localhost:${PORT}/ — is the server running?\x1b[0m`);
    console.error('Start it with: node dev-server.js ' + PORT);
    await browser.close();
    process.exit(2);
  }

  // Disable service worker to prevent context-destroying reloads during test execution
  await page.setBypassServiceWorker(true);
  // Also unregister any existing SW registrations
  try {
    await page.evaluate(async () => {
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const r of regs) await r.unregister();
    });
  } catch (e) { /* context destroyed by SW — harmless, we bypass it anyway */ }

  // Reload clean (no SW interference)
  await page.goto(`http://localhost:${PORT}/app`, { waitUntil: 'networkidle2', timeout: 15000 });

  console.log(`Running ${TEST_FILES.length} test files...\n`);
  listening = true;

  // Run each test file individually to survive context destruction
  for (const testFile of TEST_FILES) {
    try {
      await page.evaluate(async (t) => {
        // Inject fetchWithRetry before each test (page context can be lost between runs)
        if (!window.fetchWithRetry) {
          window.fetchWithRetry = async function(url, retries = 3) {
            for (let i = 0; i < retries; i++) {
              try { return await fetch(url).then(r => { if (!r.ok) throw new Error(r.status); return r.text(); }); }
              catch (e) { if (i === retries - 1) throw new Error(`Failed to fetch ${url} after ${retries} attempts`); }
            }
          };
        }
        console.log(`\u25B6 Running ${t}`);
        try {
          const src = await fetch(t).then(r => r.text());
          await Function(src)();
        } catch (e) {
          console.log(`FAIL ${t}: ${e.message}`);
        }
      }, testFile);
    } catch (e) {
      if (e.message.includes('Execution context was destroyed')) {
        console.log(`\x1b[33mWARN: ${testFile} destroyed context — reloading\x1b[0m`);
        await page.goto(`http://localhost:${PORT}/app`, { waitUntil: 'networkidle2', timeout: 15000 });
      } else {
        fails.push(`CRASH ${testFile}: ${e.message}`);
        console.log(`\x1b[31mCRASH ${testFile}: ${e.message}\x1b[0m`);
      }
    }
  }

  // Wait for async console logs to flush
  await new Promise(r => setTimeout(r, 3000));
  listening = false;

  await browser.close();

  // Final summary
  console.log('\n' + '='.repeat(50));
  if (fails.length === 0) {
    console.log('\x1b[32m\x1b[1m  ALL TESTS PASSED\x1b[0m');
  } else {
    console.log(`\x1b[31m\x1b[1m  ${fails.length} FAILURE(S):\x1b[0m`);
    fails.forEach(f => console.log('  \x1b[31m' + f + '\x1b[0m'));
  }
  console.log('='.repeat(50));

  process.exit(fails.length > 0 ? 1 : 0);
})();
