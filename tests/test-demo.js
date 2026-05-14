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

  // ── 1. Source: views.js ──
  console.log('\n1. views.js — Onboarding HTML');
  const viewsSrc = read('js/views.js');
  assert('Has onboarding-divider', viewsSrc.includes('onboarding-divider'));
  assert('Has onboarding-divider-line', viewsSrc.includes('onboarding-divider-line'));
  assert('Has onboarding-divider-text', viewsSrc.includes('onboarding-divider-text'));
  assert('Has demo-cards container', viewsSrc.includes('demo-cards'));
  assert('Has demo-card class', viewsSrc.includes('demo-card'));
  assert('Has female card with loadDemoData(\'female\')', viewsSrc.includes("loadDemoData('female')"));
  assert('Has male card with loadDemoData(\'male\')', viewsSrc.includes("loadDemoData('male')"));
  assert('Has Sarah, 34 label', viewsSrc.includes('Sarah, 34'));
  assert('Has Alex, 38 label', viewsSrc.includes('Alex, 38'));
  assert('Has demo-card-avatar', viewsSrc.includes('demo-card-avatar'));
  assert('Has demo-card-name', viewsSrc.includes('demo-card-name'));
  assert('Has demo-card-desc', viewsSrc.includes('demo-card-desc'));
  assert('No old onboarding-demo-btn', !viewsSrc.includes('onboarding-demo-btn'));

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
  assert('Has .onboarding-divider rule', cssSrc.includes('.onboarding-divider'));
  assert('Has .onboarding-divider-line rule', cssSrc.includes('.onboarding-divider-line'));
  assert('Has .onboarding-divider-text rule', cssSrc.includes('.onboarding-divider-text'));
  assert('Has .demo-cards rule', cssSrc.includes('.demo-cards'));
  assert('Has .demo-card rule', cssSrc.includes('.demo-card {'));
  assert('Has .demo-card:hover rule', cssSrc.includes('.demo-card:hover'));
  assert('Has .demo-card-avatar rule', cssSrc.includes('.demo-card-avatar'));
  assert('Has .demo-card-name rule', cssSrc.includes('.demo-card-name'));
  assert('Has .demo-card-desc rule', cssSrc.includes('.demo-card-desc'));
  assert('No old .onboarding-demo-btn rule', !cssSrc.includes('.onboarding-demo-btn'));
  assert('Demo cards flex layout', cssSrc.includes('.demo-cards { display: flex'));
  assert('Demo card cursor pointer', cssSrc.includes('cursor: pointer'));
  assert('Mobile 480px: demo-cards flex-direction column', cssSrc.includes('.demo-cards { flex-direction: column'));

  // ── 4. Computed styles (if onboarding visible) ──
  console.log('\n4. Computed styles (live DOM)');
  const step1 = document.querySelector('.onboarding-step1');
  if (step1) {
    const step1Style = getComputedStyle(step1);
    assert('.onboarding-step1 has text-align center', step1Style.textAlign === 'center');

    const divider = document.querySelector('.onboarding-divider');
    assert('.onboarding-divider exists in DOM', !!divider);
    if (divider) {
      const divStyle = getComputedStyle(divider);
      assert('.onboarding-divider has flex display', divStyle.display === 'flex');
    }

    const cards = document.querySelectorAll('.demo-card');
    assert('Two .demo-card buttons in DOM', cards.length === 2);
    if (cards.length === 2) {
      assert('First card onclick has female', cards[0].getAttribute('onclick').includes("'female'"));
      assert('Second card onclick has male', cards[1].getAttribute('onclick').includes("'male'"));
      const cardStyle = getComputedStyle(cards[0]);
      assert('Demo card has pointer cursor', cardStyle.cursor === 'pointer');
    }

    const importBtn = document.querySelector('.onboarding-import-btn');
    assert('.onboarding-import-btn exists', !!importBtn);
    if (importBtn) {
      const btnStyle = getComputedStyle(importBtn);
      assert('Import btn is inline-block (centered by text-align)', btnStyle.display === 'inline-block');
    }
  } else {
    console.log('  ⚠️  Onboarding step 1 not visible (data already loaded) — skipping DOM checks');
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
