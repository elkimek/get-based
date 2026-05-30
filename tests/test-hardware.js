#!/usr/bin/env node
// test-hardware.js — Model advisor hardware detection + assessment
//
// Run: node tests/test-hardware.js  (or via npm test)

import './_node-shim.js';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf-8');

let pass = 0, fail = 0;
function assert(name, condition, detail) {
  if (condition) { pass++; console.log(`  PASS: ${name}`); }
  else { fail++; console.log(`  FAIL: ${name}${detail ? ' — ' + detail : ''}`); }
}

console.log('=== Hardware & Model Advisor Tests ===\n');
  // ═══════════════════════════════════════
  // 1. Module exports
  // ═══════════════════════════════════════
  console.log('%c 1. Module Exports ', 'font-weight:bold;color:#f59e0b');

  const hw = await import('../js/hardware.js');
  assert('detectHardware exported', typeof hw.detectHardware === 'function');
  assert('assessModel exported', typeof hw.assessModel === 'function');
  assert('getModelSuggestions exported', typeof hw.getModelSuggestions === 'function');
  assert('saveHardwareOverride exported', typeof hw.saveHardwareOverride === 'function');
  assert('getHardwareOverride exported', typeof hw.getHardwareOverride === 'function');

  // ═══════════════════════════════════════
  // 2. assessModel logic
  // ═══════════════════════════════════════
  console.log('%c 2. assessModel Tiers ', 'font-weight:bold;color:#f59e0b');

  const smallModel = { name: 'llama3.2:3b', size: 2_000_000_000 }; // 2 GB file → ~2.3 GB VRAM
  const bigModel = { name: 'llama3.1:70b', size: 40_000_000_000 }; // 40 GB file → ~46 GB VRAM
  const medModel = { name: 'qwen2.5:14b', size: 9_000_000_000 }; // 9 GB file → ~10.35 GB VRAM

  const gpu16 = { gpu: { name: 'RTX 4080', vram: 16, unified: false }, ram: { gb: 32 }, cpuThreads: 16 };
  const gpu8 = { gpu: { name: 'RTX 3060', vram: 8, unified: false }, ram: { gb: 16 }, cpuThreads: 8 };
  const appleM3 = { gpu: { name: 'Apple M3 Pro', vram: 18, unified: true }, ram: { gb: 18 }, cpuThreads: 12 };

  const r1 = hw.assessModel(smallModel, gpu16);
  assert('Small model on 16GB = fits', r1.tier === 'fits', `got: ${r1.tier}, needed: ${r1.vramNeeded.toFixed(1)} GB`);

  const r2 = hw.assessModel(bigModel, gpu16);
  assert('70B model on 16GB = toobig', r2.tier === 'toobig', `got: ${r2.tier}, needed: ${r2.vramNeeded.toFixed(1)} GB`);

  const r3 = hw.assessModel(medModel, gpu8);
  assert('14B model on 8GB = toobig', r3.tier === 'toobig', `got: ${r3.tier}, needed: ${r3.vramNeeded.toFixed(1)} GB`);

  const r4 = hw.assessModel(smallModel, gpu8);
  assert('3B model on 8GB = fits', r4.tier === 'fits', `got: ${r4.tier}`);

  // Apple Silicon unified memory uses 75% of total → 18*0.75=13.5 usable, 13.5*0.85=11.475 threshold
  // 9GB file → 10.35 GB VRAM → fits within 11.475
  const r5 = hw.assessModel(medModel, appleM3);
  assert('14B on M3 Pro 18GB unified = fits', r5.tier === 'fits', `got: ${r5.tier}, needed: ${r5.vramNeeded.toFixed(1)} GB, usable: ${(18*0.75).toFixed(1)} GB`);

  // ═══════════════════════════════════════
  // 3. assessModel edge cases
  // ═══════════════════════════════════════
  console.log('%c 3. Edge Cases ', 'font-weight:bold;color:#f59e0b');

  const noVram = { gpu: { name: null, vram: null, unified: false }, ram: { gb: 8 }, cpuThreads: 4 };
  const r6 = hw.assessModel(smallModel, noVram);
  assert('No VRAM = unknown tier', r6.tier === 'unknown');

  const noSize = { name: 'mystery-model', size: 0 };
  const r7 = hw.assessModel(noSize, gpu16);
  assert('No model size = unknown tier', r7.tier === 'unknown');

  // ═══════════════════════════════════════
  // 4. detectHardware runs without error
  // ═══════════════════════════════════════
  console.log('%c 4. detectHardware ', 'font-weight:bold;color:#f59e0b');

  const detected = await hw.detectHardware();
  assert('detectHardware returns gpu object', detected.gpu && typeof detected.gpu === 'object');
  assert('detectHardware returns ram object', detected.ram && typeof detected.ram === 'object');
  assert('gpu.source is a string', typeof detected.gpu.source === 'string', `source: ${detected.gpu.source}`);
  if (detected.gpu.vram) {
    assert('GPU VRAM is a positive number', detected.gpu.vram > 0, `${detected.gpu.name}: ${detected.gpu.vram} GB`);
  }

  // ═══════════════════════════════════════
  // 5. Hardware override
  // ═══════════════════════════════════════
  console.log('%c 5. Hardware Override ', 'font-weight:bold;color:#f59e0b');

  const prevOverride = hw.getHardwareOverride();
  hw.saveHardwareOverride(24);
  assert('Override saved', hw.getHardwareOverride() === 24);
  const withOverride = await hw.detectHardware();
  assert('Override applies to detectHardware', withOverride.gpu.vram === 24);
  assert('Override source is manual', withOverride.gpu.source === 'manual');
  hw.saveHardwareOverride(prevOverride); // restore

  // ═══════════════════════════════════════
  // 6. Model suggestions
  // ═══════════════════════════════════════
  console.log('%c 6. Model Suggestions ', 'font-weight:bold;color:#f59e0b');

  const sug8 = hw.getModelSuggestions(gpu8);
  assert('8GB GPU gets suggestions', sug8.length > 0, sug8.map(s => s.model).join(', '));
  assert('Suggestions have model + why', sug8.every(s => s.model && s.why));

  const sugNone = hw.getModelSuggestions(noVram);
  assert('No VRAM = no suggestions', sugNone.length === 0);

  // ═══════════════════════════════════════
  // 7. Model fitness for lab analysis
  // ═══════════════════════════════════════
  console.log('%c 7. Model Fitness ', 'font-weight:bold;color:#f59e0b');

  assert('assessFitness exported', typeof hw.assessFitness === 'function');
  assert('getBestModel exported', typeof hw.getBestModel === 'function');
  assert('getUpgradeSuggestion exported', typeof hw.getUpgradeSuggestion === 'function');

  const f1 = hw.assessFitness('qwen2.5:14b');
  assert('qwen2.5:14b = recommended', f1 && f1.tier === 'recommended', f1?.note);

  const f2 = hw.assessFitness('llama3.1:8b');
  assert('llama3.1:8b = capable', f2 && f2.tier === 'capable', f2?.note);

  const f3 = hw.assessFitness('phi3:3.5b');
  assert('phi3 = inadequate', f3 && f3.tier === 'inadequate', f3?.note);

  const f4 = hw.assessFitness('codellama:7b');
  assert('codellama = inadequate', f4 && f4.tier === 'inadequate', f4?.note);

  const f5 = hw.assessFitness('llama3.2:3b');
  assert('llama3.2:3b = underpowered', f5 && f5.tier === 'underpowered', f5?.note);

  const f6 = hw.assessFitness('totally-unknown-model:latest');
  assert('Unknown model = null', f6 === null);

  // getBestModel picks highest-fitness model that fits
  const testModels = [
    { name: 'phi3:3.5b', size: 2_000_000_000 },
    { name: 'qwen2.5:14b', size: 9_000_000_000 },
    { name: 'llama3.1:8b', size: 4_700_000_000 },
  ];
  const bestFor16 = hw.getBestModel(testModels, gpu16);
  assert('Best for 16GB = qwen2.5:14b (recommended + fits)', bestFor16 && bestFor16.name === 'qwen2.5:14b', bestFor16?.name);

  const bestFor4 = hw.getBestModel(testModels, { gpu: { vram: 4, unified: false }, ram: { gb: 8 }, cpuThreads: 4 });
  assert('Best for 4GB = phi3 (only one that fits)', bestFor4 && bestFor4.name === 'phi3:3.5b', bestFor4?.name);

  // getUpgradeSuggestion — recommends upgrade when no "recommended" model installed
  const weakModels = [{ name: 'llama3.1:8b', size: 4_700_000_000 }];
  const upg1 = hw.getUpgradeSuggestion(weakModels, gpu16);
  assert('Suggests upgrade when only capable model', upg1 && upg1.model, upg1?.model);

  const strongModels = [{ name: 'qwen2.5:14b', size: 9_000_000_000 }];
  const upg2 = hw.getUpgradeSuggestion(strongModels, gpu16);
  assert('No upgrade when recommended model present', upg2 === null);

  // ═══════════════════════════════════════
  // 8. checkOllama modelDetails field
  // ═══════════════════════════════════════
  console.log('%c 7. checkOllama Return Shape ', 'font-weight:bold;color:#f59e0b');

  const piiSrc = read('js/pii.js');
  assert('checkOllama returns modelDetails', piiSrc.includes('modelDetails'));
  assert('modelDetails includes size', piiSrc.includes('size: m.size'));
  assert('modelDetails includes quantLevel', piiSrc.includes('quantization_level'));
  assert('modelDetails includes paramSize', piiSrc.includes('parameter_size'));

  // ═══════════════════════════════════════
  // 8. Settings integration
  // ═══════════════════════════════════════
  console.log('%c 8. Settings Integration ', 'font-weight:bold;color:#f59e0b');

  const ppSrc = read('js/provider-panels.js');
  const localAiControlsSrc = read('js/provider-local-ai-controls.js');
  const panelRenderSrc = read('js/provider-panel-renderers.js');
  assert('Provider local AI controls imports hardware.js', localAiControlsSrc.includes("from './hardware.js'"));
  assert('Provider renderer has advisor placeholder', panelRenderSrc.includes('local-ai-advisor'));
  assert('Provider local AI controls calls renderModelAdvisor', localAiControlsSrc.includes('renderModelAdvisor'));
  assert('Provider panels exports copyOllamaPullCmd', ppSrc.includes('copyOllamaPullCmd'));
  assert('Provider local AI controls validates base URL before fetch', localAiControlsSrc.includes('normalizeLocalAiBaseUrl'));

  // ═══════════════════════════════════════
  // 9. Local AI URL validation
  // ═══════════════════════════════════════
  console.log('%c 9. Local AI URL Validation ', 'font-weight:bold;color:#f59e0b');

  const localAiControls = await import('../js/provider-local-ai-controls.js');
  const originalGetElementById = document.getElementById;
  const originalFetch = globalThis.fetch;
  const hadLocation = Object.prototype.hasOwnProperty.call(globalThis, 'location');
  const originalLocation = globalThis.location;
  let fetchCalls = 0;
  const makeDot = () => {
    const dot = { className: '', classes: new Set() };
    dot.classList = {
      add: (cls) => dot.classes.add(cls),
      remove: (cls) => dot.classes.delete(cls),
      contains: (cls) => dot.classes.has(cls),
    };
    return dot;
  };

  try {
    globalThis.location = { protocol: 'http:' };
    globalThis.fetch = async () => {
      fetchCalls++;
      throw new Error('Malformed Local AI URL should be rejected before fetch');
    };

    const mainDot = makeDot();
    const mainText = { textContent: '' };
    let elements = {
      'local-ai-url-input': { value: 'htp://localhost:11434' },
      'local-ai-dot': mainDot,
      'local-ai-status-text': mainText,
    };
    document.getElementById = (id) => elements[id] || null;
    await localAiControls.testOllamaConnection();
    assert('Malformed main Local AI URL shows protocol guidance',
      mainText.textContent === 'Local AI URL must start with http:// or https://',
      mainText.textContent);
    assert('Malformed main Local AI URL does not fetch', fetchCalls === 0, `fetch calls: ${fetchCalls}`);

    const piiDot = makeDot();
    const piiText = { textContent: '' };
    elements = {
      'pii-local-url-input': { value: 'htp://localhost:11434' },
      'pii-local-dot': piiDot,
      'pii-local-status-text': piiText,
    };
    await localAiControls.testPIIOllamaConnection();
    assert('Malformed PII Local AI URL shows protocol guidance',
      piiText.textContent === 'Local AI URL must start with http:// or https://',
      piiText.textContent);
    assert('Malformed PII Local AI URL does not fetch', fetchCalls === 0, `fetch calls: ${fetchCalls}`);

    fetchCalls = 0;
    globalThis.fetch = async () => {
      fetchCalls++;
      throw new TypeError('Failed to fetch');
    };
    elements = {
      'local-ai-url-input': { value: 'http://localhost:65535' },
      'local-ai-dot': mainDot,
      'local-ai-status-text': mainText,
    };
    mainText.textContent = '';
    await localAiControls.testOllamaConnection();
    assert('Unreachable main Local AI URL does not show CORS guidance',
      mainText.textContent === 'Not connected \u2014 check URL and ensure your server is running',
      mainText.textContent);
    assert('Unreachable main Local AI URL probes before failing', fetchCalls > 1, `fetch calls: ${fetchCalls}`);

    elements = {
      'pii-local-url-input': { value: 'http://localhost:65535' },
      'pii-local-dot': piiDot,
      'pii-local-status-text': piiText,
    };
    piiText.textContent = '';
    await localAiControls.testPIIOllamaConnection();
    assert('Unreachable PII Local AI URL does not show CORS guidance',
      piiText.textContent === 'Not connected \u2014 check URL and ensure your server is running',
      piiText.textContent);

    let noCorsProbeCalls = 0;
    globalThis.fetch = async (_url, options = {}) => {
      fetchCalls++;
      if (options.mode === 'no-cors') {
        noCorsProbeCalls++;
        return { type: 'opaque' };
      }
      throw new TypeError('Failed to fetch');
    };
    elements = {
      'local-ai-url-input': { value: 'http://localhost:11434' },
      'local-ai-dot': mainDot,
      'local-ai-status-text': mainText,
    };
    mainText.textContent = '';
    await localAiControls.testOllamaConnection();
    assert('Reachable server with blocked normal fetch shows CORS guidance',
      mainText.textContent.includes('Blocked by CORS'),
      mainText.textContent);
    assert('CORS classification uses no-cors reachability probe', noCorsProbeCalls === 1, `no-cors calls: ${noCorsProbeCalls}`);
  } finally {
    document.getElementById = originalGetElementById;
    globalThis.fetch = originalFetch;
    if (hadLocation) globalThis.location = originalLocation;
    else delete globalThis.location;
  }

  // ═══════════════════════════════════════
  // Results
  // ═══════════════════════════════════════
console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
