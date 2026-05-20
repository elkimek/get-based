#!/usr/bin/env node
// test-demo.js — Verify demo data onboarding redesign
//
// Run: node tests/test-demo.js  (or via npm test)

import './_node-shim.js';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel.replace(/^\//, '')), 'utf-8');

let pass = 0, fail = 0;
function assert(name, condition, detail) {
  if (condition) { pass++; console.log(`  PASS: ${name}`); }
  else { fail++; console.log(`  FAIL: ${name}${detail ? ' — ' + detail : ''}`); }
}

console.log('=== Demo Data Onboarding Tests ===\n');

// export.js exposes window.loadDemoData via Object.assign(window, ...).
await import('../js/state.js');
await import('../js/export.js');

  // ── 1. Source: dashboard-page-view.js ──
  console.log('\n1. dashboard-page-view.js — Onboarding HTML');
  const dashboardPageViewSrc = read('js/dashboard-page-view.js');
  assert('Has welcome-demo-section', dashboardPageViewSrc.includes('welcome-demo-section'));
  assert('Has welcome-section-label', dashboardPageViewSrc.includes('welcome-section-label'));
  assert('Old onboarding divider markup removed', !dashboardPageViewSrc.includes('onboarding-divider'));
  assert('Has demo-cards container', dashboardPageViewSrc.includes('demo-cards'));
  assert('Has demo-card class', dashboardPageViewSrc.includes('demo-card'));
  assert('Has female card with loadDemoData(\'female\')', dashboardPageViewSrc.includes("loadDemoData('female')"));
  assert('Has male card with loadDemoData(\'male\')', dashboardPageViewSrc.includes("loadDemoData('male')"));
  assert('Has Sarah, 34 label', dashboardPageViewSrc.includes('Sarah, 34'));
  assert('Has Alex, 38 label', dashboardPageViewSrc.includes('Alex, 38'));
  assert('Has demo-card-avatar', dashboardPageViewSrc.includes('demo-card-avatar'));
  assert('Has demo-card-name', dashboardPageViewSrc.includes('demo-card-name'));
  assert('Has demo-card-desc', dashboardPageViewSrc.includes('demo-card-desc'));
  assert('No old onboarding-demo-btn', !dashboardPageViewSrc.includes('onboarding-demo-btn'));

  // ── 2. Source: export.js ──
  console.log('\n2. export.js — loadDemoData(sex)');
  const exportSrc = read('js/export.js');
  assert('loadDemoData accepts sex param', exportSrc.includes("loadDemoData(sex = 'male')"));
  assert('References demo-female.json', exportSrc.includes('demo-female.json'));
  assert('References demo-male.json', exportSrc.includes('demo-male.json'));
  assert('Calls setProfileSex', exportSrc.includes('setProfileSex'));
  assert('Calls setProfileDob', exportSrc.includes('setProfileDob'));
  assert('Sets DOB 1991-08-15 for female', exportSrc.includes('1991-08-15'));
  assert('Sets DOB 1987-11-22 for male', exportSrc.includes('1987-11-22'));
  assert('Sets onboarded to profile-set', exportSrc.includes("'profile-set'"));
  assert('Dynamic import of profile.js', exportSrc.includes("import('./profile.js')"));

  // ── 3. Source: styles.css ──
  console.log('\n3. styles.css — Demo card styles');
  const cssSrc = read('styles.css');
  assert('Has .welcome-demo-section rule', cssSrc.includes('.welcome-demo-section'));
  assert('Has .welcome-section-label rule', cssSrc.includes('.welcome-section-label'));
  assert('Old .onboarding-divider rules removed', !cssSrc.includes('.onboarding-divider'));
  assert('Has .demo-cards rule', cssSrc.includes('.demo-cards'));
  assert('Has .demo-card rule', cssSrc.includes('.demo-card {'));
  assert('Has .demo-card:hover rule', cssSrc.includes('.demo-card:hover'));
  assert('Has .demo-card-avatar rule', cssSrc.includes('.demo-card-avatar'));
  assert('Has .demo-card-name rule', cssSrc.includes('.demo-card-name'));
  assert('Has .demo-card-desc rule', cssSrc.includes('.demo-card-desc'));
  assert('No old .onboarding-demo-btn rule', !cssSrc.includes('.onboarding-demo-btn'));
  assert('Demo cards grid layout', cssSrc.includes('.demo-cards { display: grid'));
  assert('Demo card cursor pointer', cssSrc.includes('cursor: pointer'));
  assert('Hidden drop zone stays invisible without progress', cssSrc.includes('.drop-zone-hidden:not(:has(.import-progress-bar)) { display: none; }'));
  assert('Mobile 480px: demo-cards stay two-column grid', cssSrc.includes('.demo-cards { grid-template-columns: 1fr 1fr; }'));

  // ── 4. Computed styles (if onboarding visible) ──
  console.log('\n4. Computed styles (live DOM)');
  const welcomeDemo = document.querySelector('.welcome-demo-section');
  if (welcomeDemo) {
    assert('.welcome-demo-section exists in DOM', !!welcomeDemo);
    const demoStyle = getComputedStyle(welcomeDemo);
    assert('.welcome-demo-section is constrained', demoStyle.maxWidth === '760px');

    const cards = document.querySelectorAll('.demo-card');
    assert('Two .demo-card buttons in DOM', cards.length === 2);
    if (cards.length === 2) {
      assert('First card onclick has female', cards[0].getAttribute('onclick').includes("'female'"));
      assert('Second card onclick has male', cards[1].getAttribute('onclick').includes("'male'"));
      const cardStyle = getComputedStyle(cards[0]);
      assert('Demo card has pointer cursor', cardStyle.cursor === 'pointer');
    }

    const chatPanel = document.querySelector('.welcome-chat-panel');
    assert('Primary chat-first empty-state panel exists', !!chatPanel);
  } else {
    console.log('  ⚠️  Empty dashboard not visible (data already loaded) — skipping DOM checks');
  }

  // ── 5. Window exports ──
  console.log('\n5. Window exports');
  assert('loadDemoData on window', typeof window.loadDemoData === 'function');

  // ── 6. Service worker ──
  console.log('\n6. service-worker.js — Cache version');
  const swSrc = read('service-worker.js');
  assert('SW uses importScripts for version', swSrc.includes("importScripts('/version.js')"));
  assert('SW CACHE_NAME uses semver', swSrc.includes('`labcharts-v${self.APP_VERSION}`'));

  // ── Summary ──
console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
