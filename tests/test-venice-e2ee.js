#!/usr/bin/env node
// test-venice-e2ee.js — Venice E2EE crypto and integration tests
//
// Run: node tests/test-venice-e2ee.js  (or via npm test)

import './_node-shim.js';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf-8');

let pass = 0, fail = 0;
const results = [];
function assert(name, condition, detail) {
  if (condition) { pass++; results.push('  PASS: ' + name); }
  else { fail++; results.push('  FAIL: ' + name + (detail ? ' — ' + detail : '')); }
}

console.log('=== Venice E2EE Tests ===\n');

// Import api.js directly for Venice provider helpers.
const api = await import('../js/api.js');
const cryptoMod = await import('../js/crypto.js');
const chatRuntime = await import('../js/chat-runtime.js');

// 1. Source: api.js has isE2EEModel and E2EE branch
const apiSrc = read('js/api.js');
const apiVeniceSrc = read('js/api-venice.js');
const apiModelsSrc = read('js/api-models.js');
const apiProviderStorageSrc = read('js/api-provider-storage.js');
const serviceWorkerSrc = read('service-worker.js');
assert('isE2EEModel exported through api.js', apiSrc.includes('isE2EEModel,'));
assert('e2ee prefix detection', apiProviderStorageSrc.includes("modelId.startsWith('e2ee-')"));
assert('callVeniceAPI has E2EE import', apiVeniceSrc.includes("import('../vendor/venice-e2ee.js')"));
assert('callVeniceAPI requires browser-side DCAP verification',
  apiVeniceSrc.includes("import('../vendor/venice-dcap.js')")
    && apiVeniceSrc.includes('dcapVerifier: dcapModule.createDcapVerifier()')
    && apiVeniceSrc.includes('requireDcap: true'));
assert('callVeniceAPI requires signed NVIDIA NRAS verification',
  apiVeniceSrc.includes("import('../vendor/venice-nvidia.js')")
    && apiVeniceSrc.includes('nvidiaModule.createNrasTokenVerifier()')
    && apiVeniceSrc.includes('nvidiaModule.createNvidiaVerifier({')
    && apiVeniceSrc.includes('fetchImpl: fetchVeniceNrasAttestation')
    && apiVeniceSrc.includes('requireGpu: true'));
assert('service worker keeps NVIDIA attestation requests network-only',
  serviceWorkerSrc.includes("'nras.attestation.nvidia.com'")
    && serviceWorkerSrc.includes("'/vendor/venice-nvidia.js'"));
assert('supportsWebSearch excludes E2EE', apiModelsSrc.includes('isVeniceE2EEActive()'));
assert('supportsVision excludes E2EE', apiModelsSrc.includes('isVeniceE2EEActive()') && apiModelsSrc.includes('return false'));
assert('fetchVeniceModels excludes unsupported e2ee-prefixed regular models', apiModelsSrc.includes("!m.id.startsWith('e2ee-')"));
assert('Venice E2EE supports forced non-stream retry path',
  /forceNonStream/.test(apiVeniceSrc)
  && /requestTimeoutMs/.test(apiVeniceSrc)
  && /stream:\s*useStream/.test(apiVeniceSrc)
  && /if\s*\(!useStream\)/.test(apiVeniceSrc)
  && /decryptChunk\(session\.privateKey,\s*encryptedContent\)/.test(apiVeniceSrc));
assert('Venice GLM E2EE handles hidden reasoning without a transport-chunk cutoff',
  apiVeniceSrc.includes('disable_thinking: true')
    && apiVeniceSrc.includes('isGlm52E2EE')
    && apiVeniceSrc.includes('isGlmE2EE && !isGlm52E2EE')
    && !apiVeniceSrc.includes('reasoning: { enabled: false }')
    && !apiVeniceSrc.includes('MAX_HIDDEN_REASONING_CHUNKS'));

// 2. api.js module exports
assert('api.isE2EEModel is function', typeof api.isE2EEModel === 'function');
assert('api.clearVeniceE2EESession is function', typeof api.clearVeniceE2EESession === 'function');
assert('Venice E2EE clear stays module-scoped',
  apiVeniceSrc.includes('export function clearVeniceE2EESession()')
    && !apiVeniceSrc.includes('apiWindow.clearE2EESession'));
assert('e2ee-llama-3.3-70b is E2EE', api.isE2EEModel('e2ee-llama-3.3-70b'));
assert('llama-3.3-70b is not E2EE', !api.isE2EEModel('llama-3.3-70b'));
assert('empty string is not E2EE', !api.isE2EEModel(''));
assert('null is not E2EE', !api.isE2EEModel(null));
assert('undefined is not E2EE', !api.isE2EEModel(undefined));

// 3. venice-e2ee.js module loads and exports
const e2eeMod = await import('../vendor/venice-e2ee.js');
const dcapMod = await import('../vendor/venice-dcap.js');
const nvidiaMod = await import('../vendor/venice-nvidia.js');
const chatAttestationMod = await import('../js/chat-attestation.js');
assert('createVeniceE2EE exported', typeof e2eeMod.createVeniceE2EE === 'function');
assert('generateKeypair exported', typeof e2eeMod.generateKeypair === 'function');
assert('deriveAESKey exported', typeof e2eeMod.deriveAESKey === 'function');
assert('encryptMessage exported', typeof e2eeMod.encryptMessage === 'function');
assert('decryptChunk exported', typeof e2eeMod.decryptChunk === 'function');
assert('decryptSSEStream exported', typeof e2eeMod.decryptSSEStream === 'function');
assert('verifyAttestation exported', typeof e2eeMod.verifyAttestation === 'function');
assert('isE2EEModel exported', typeof e2eeMod.isE2EEModel === 'function');
assert('pinned browser DCAP verifier exported',
  typeof dcapMod.createDcapVerifier === 'function'
    && typeof dcapMod.createDcapVerifier() === 'function'
    && dcapMod.PHALA_PCCS_URL === 'https://pccs.phala.network');
assert('pinned browser NVIDIA verifier exports NRAS and signed-token checks',
  typeof nvidiaMod.createNvidiaVerifier === 'function'
    && typeof nvidiaMod.createNrasTokenVerifier === 'function'
    && nvidiaMod.NRAS_GPU_URL === 'https://nras.attestation.nvidia.com/v3/attest/gpu'
    && nvidiaMod.NRAS_JWKS_URL === 'https://nras.attestation.nvidia.com/.well-known/jwks.json');
assert('toHex exported', typeof e2eeMod.toHex === 'function');
assert('fromHex exported', typeof e2eeMod.fromHex === 'function');
const veniceClient = e2eeMod.createVeniceE2EE({ apiKey: 'test-client' });
assert('client exposes attestation and response-signature fetches',
  typeof veniceClient.attest === 'function' && typeof veniceClient.fetchResponseSignature === 'function');
let requiredGpuWithoutAttestationError = '';
try {
  e2eeMod.createVeniceE2EE({ apiKey: 'test-v0.4-gpu-policy', verifyAttestation: false, requireGpu: true });
} catch (error) {
  requiredGpuWithoutAttestationError = error.message;
}
assert('v0.4 rejects required GPU verification when attestation is disabled',
  requiredGpuWithoutAttestationError.includes('Attestation policy cannot be required'));
assert('attestationTooltip exported', typeof chatAttestationMod.attestationTooltip === 'function');
assert('e2eeLockHTML exported', typeof chatAttestationMod.e2eeLockHTML === 'function');
assert('e2eeLockFootnote exported', typeof chatAttestationMod.e2eeLockFootnote === 'function');
assert('attestationTooltip null-safe', chatAttestationMod.attestationTooltip(null) === 'TEE attestation: no data');
const maliciousAttestation = {
  nonceVerified: true,
  signingKeyBound: true,
  debugMode: false,
  dcapVerified: true,
  dcap: { status: '"><img src=x onerror=alert(1)>' }
};
const maliciousLock = chatAttestationMod.e2eeLockHTML(maliciousAttestation);
assert('chat attestation title escapes quotes', maliciousLock.includes('&quot;&gt;&lt;img src=x onerror=alert(1)&gt;'), maliciousLock);
assert('chat attestation title does not inject raw image tag', !maliciousLock.includes('"><img'), maliciousLock);

// 4. noble-secp256k1 is bundled inside venice-e2ee.js
assert('generateKeypair works (noble bundled)', typeof e2eeMod.generateKeypair() === 'object');

// 5. Keypair generation
const keypair = e2eeMod.generateKeypair();
assert('keypair: privateKey is Uint8Array(32)', keypair.privateKey instanceof Uint8Array && keypair.privateKey.length === 32);
assert('keypair: publicKey is Uint8Array(65)', keypair.publicKey instanceof Uint8Array && keypair.publicKey.length === 65);
assert('keypair: pubKeyHex is 130 chars', keypair.pubKeyHex.length === 130);
assert('keypair: pubKeyHex starts with 04', keypair.pubKeyHex.startsWith('04'));
assert('keypair: pubKeyHex is lowercase hex', /^[0-9a-f]+$/.test(keypair.pubKeyHex));

// 6. ECDH + AES key derivation (self-ECDH for testing)
try {
  const aesKey = await e2eeMod.deriveAESKey(keypair.privateKey, keypair.pubKeyHex);
  assert('AES key derived', aesKey instanceof CryptoKey);

  const plaintext = 'What are my omega-3 levels?';
  const encrypted = await e2eeMod.encryptMessage(aesKey, keypair.publicKey, plaintext);
  assert('encrypted is hex string', typeof encrypted === 'string' && /^[0-9a-f]+$/.test(encrypted));
  assert('encrypted length > 154', encrypted.length > 154);
  assert('encrypted starts with pubkey', encrypted.startsWith(keypair.pubKeyHex));

  const decrypted = await e2eeMod.decryptChunk(keypair.privateKey, encrypted);
  assert('round-trip decryption matches', decrypted === plaintext);

  const enc2 = await e2eeMod.encryptMessage(aesKey, keypair.publicKey, plaintext);
  assert('different nonces produce different ciphertexts', enc2 !== encrypted);
  const dec2 = await e2eeMod.decryptChunk(keypair.privateKey, enc2);
  assert('second ciphertext also decrypts correctly', dec2 === plaintext);

  const encEmpty = await e2eeMod.encryptMessage(aesKey, keypair.publicKey, '');
  const decEmpty = await e2eeMod.decryptChunk(keypair.privateKey, encEmpty);
  assert('empty string round-trip', decEmpty === '');

  const unicodeText = 'Vitamin D ☀️ level: 85 nmol/L — český text';
  const encUni = await e2eeMod.encryptMessage(aesKey, keypair.publicKey, unicodeText);
  const decUni = await e2eeMod.decryptChunk(keypair.privateKey, encUni);
  assert('unicode round-trip', decUni === unicodeText);
} catch (e) {
  assert('crypto operations threw no error', false, e.message);
}

// 11. decryptChunk fails closed for non-encrypted model output
let plaintextError = '';
try { await e2eeMod.decryptChunk(keypair.privateKey, 'hello'); } catch (e) { plaintextError = e.message; }
assert('short non-hex response fails closed', plaintextError.includes('unencrypted content'), plaintextError);
const pt2 = await e2eeMod.decryptChunk(keypair.privateKey, '');
assert('empty string passes through', pt2 === '');
const pt3 = await e2eeMod.decryptChunk(keypair.privateKey, ' \n');
assert('whitespace-only response passes through', pt3 === ' \n');
let nullError = '';
try { await e2eeMod.decryptChunk(keypair.privateKey, null); } catch (e) { nullError = e.message; }
assert('non-string response fails closed', nullError.includes('must be a string'), nullError);

// 12. createVeniceE2EE factory
const instance = e2eeMod.createVeniceE2EE({ apiKey: 'test-key', verifyAttestation: false });
assert('factory returns createSession', typeof instance.createSession === 'function');
assert('factory returns encrypt', typeof instance.encrypt === 'function');
assert('factory returns decryptChunk', typeof instance.decryptChunk === 'function');
assert('factory returns decryptStream', typeof instance.decryptStream === 'function');
assert('factory returns clearSession', typeof instance.clearSession === 'function');
instance.clearSession();
assert('clearSession runs without error', true);

// 13. E2EE toggle + model-driven state
assert('api.setVeniceE2EE is function', typeof api.setVeniceE2EE === 'function');
assert('api.getVeniceE2EE is function', typeof api.getVeniceE2EE === 'function');
assert('api.isVeniceE2EEActive is function', typeof api.isVeniceE2EEActive === 'function');
const savedE2EE = localStorage.getItem('labcharts-venice-e2ee');
const savedModel = localStorage.getItem('labcharts-venice-model');
api.setVeniceE2EE(true);
assert('setVeniceE2EE(true) persists', api.getVeniceE2EE() === true);
api.setVeniceModel('e2ee-qwen3-30b-a3b-p');
assert('isVeniceE2EEActive true with e2ee model', api.isVeniceE2EEActive());
api.setVeniceModel('llama-3.3-70b');
assert('isVeniceE2EEActive false with regular model', !api.isVeniceE2EEActive());
api.setVeniceE2EE(false);
assert('setVeniceE2EE(false) persists', api.getVeniceE2EE() === false);
if (savedModel) localStorage.setItem('labcharts-venice-model', savedModel);
if (savedE2EE) localStorage.setItem('labcharts-venice-e2ee', savedE2EE);
else localStorage.removeItem('labcharts-venice-e2ee');

// 13b. Model setters refresh active chat UI immediately
let veniceHeaderRefreshCount = 0;
let veniceWebToggleRefreshCount = 0;
const savedChatRuntimeCallbacks = chatRuntime.configureChatRuntimeCallbacks({
  updateChatHeaderModel: () => { veniceHeaderRefreshCount += 1; },
  refreshWebSearchToggle: () => { veniceWebToggleRefreshCount += 1; },
});
api.setVeniceModel('llama-3.3-70b');
assert('setVeniceModel refreshes chat header', veniceHeaderRefreshCount === 1, `count=${veniceHeaderRefreshCount}`);
assert('setVeniceModel refreshes web-search state', veniceWebToggleRefreshCount === 1, `count=${veniceWebToggleRefreshCount}`);
chatRuntime.configureChatRuntimeCallbacks(savedChatRuntimeCallbacks);
if (savedModel) localStorage.setItem('labcharts-venice-model', savedModel);
else localStorage.removeItem('labcharts-venice-model');

// 14. supportsWebSearch respects E2EE model
const savedProvider = localStorage.getItem('labcharts-ai-provider');
api.setAIProvider('venice');
api.setVeniceModel('e2ee-qwen3-30b-a3b-p');
assert('supportsWebSearch false with E2EE model', !api.supportsWebSearch());
api.setVeniceModel('llama-3.3-70b');
assert('supportsWebSearch true with regular model', api.supportsWebSearch());
if (savedModel) localStorage.setItem('labcharts-venice-model', savedModel);
if (savedProvider) api.setAIProvider(savedProvider);
else localStorage.removeItem('labcharts-ai-provider');

// 15. Venice model cache handles stale E2EE selections
const savedVeniceModels = localStorage.getItem('labcharts-venice-models');
const savedVeniceE2EEModels = localStorage.getItem('labcharts-venice-e2ee-models');
const savedVeniceFetchedAt = localStorage.getItem('labcharts-venice-models-fetched-at');
const savedVeniceModelRegular = localStorage.getItem('labcharts-venice-model-regular');
const savedVeniceModelE2EE = localStorage.getItem('labcharts-venice-model-e2ee');
const originalFetch = globalThis.fetch;
try {
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      data: [
        { id: 'e2ee-qwen3-30b-a3b-p', name: 'Old E2EE Qwen', type: 'text', model_spec: { capabilities: { supportsE2EE: false } } },
        { id: 'e2ee-qwen3-5-122b-a10b', name: 'Current E2EE Qwen', type: 'text', model_spec: { capabilities: { supportsE2EE: true } } },
        { id: 'llama-3.3-70b', name: 'Llama 3.3 70B', type: 'text', model_spec: { capabilities: { supportsE2EE: false } } },
      ]
    })
  });
  api.setVeniceE2EE(true);
  api.setVeniceModel('e2ee-qwen3-30b-a3b-p');
  await api.fetchVeniceModels('test-key');
  const cachedE2EE = JSON.parse(localStorage.getItem('labcharts-venice-e2ee-models') || '[]');
  const cachedRegular = JSON.parse(localStorage.getItem('labcharts-venice-models') || '[]');
  assert('fetchVeniceModels uses supportsE2EE capability', cachedE2EE.length === 1 && cachedE2EE[0].id === 'e2ee-qwen3-5-122b-a10b', JSON.stringify(cachedE2EE.map(m => m.id)));
  assert('unsupported e2ee prefix is not cached as regular Venice model', !cachedRegular.some(m => m.id === 'e2ee-qwen3-30b-a3b-p'), JSON.stringify(cachedRegular.map(m => m.id)));
  assert('stale E2EE model replaced with current E2EE model', api.getVeniceModel() === 'e2ee-qwen3-5-122b-a10b', api.getVeniceModel());
  assert('stale E2EE prefix no longer active after capability cache', !api.isE2EEModel('e2ee-qwen3-30b-a3b-p'));
} catch (e) {
  assert('Venice E2EE model cache refresh threw no error', false, e.message);
} finally {
  if (originalFetch) globalThis.fetch = originalFetch;
  else delete globalThis.fetch;
  if (savedVeniceModels) localStorage.setItem('labcharts-venice-models', savedVeniceModels);
  else localStorage.removeItem('labcharts-venice-models');
  if (savedVeniceE2EEModels) localStorage.setItem('labcharts-venice-e2ee-models', savedVeniceE2EEModels);
  else localStorage.removeItem('labcharts-venice-e2ee-models');
  if (savedVeniceFetchedAt) localStorage.setItem('labcharts-venice-models-fetched-at', savedVeniceFetchedAt);
  else localStorage.removeItem('labcharts-venice-models-fetched-at');
  if (savedVeniceModelRegular) localStorage.setItem('labcharts-venice-model-regular', savedVeniceModelRegular);
  else localStorage.removeItem('labcharts-venice-model-regular');
  if (savedVeniceModelE2EE) localStorage.setItem('labcharts-venice-model-e2ee', savedVeniceModelE2EE);
  else localStorage.removeItem('labcharts-venice-model-e2ee');
  if (savedModel) localStorage.setItem('labcharts-venice-model', savedModel);
  else localStorage.removeItem('labcharts-venice-model');
  if (savedE2EE) localStorage.setItem('labcharts-venice-e2ee', savedE2EE);
  else localStorage.removeItem('labcharts-venice-e2ee');
}

// 15b. callVeniceAPI reconciles E2EE capability cache before guarding
{
  const savedVeniceModelsB = localStorage.getItem('labcharts-venice-models');
  const savedVeniceE2EEModelsB = localStorage.getItem('labcharts-venice-e2ee-models');
  const savedVeniceFetchedAtB = localStorage.getItem('labcharts-venice-models-fetched-at');
  const savedVeniceModelRegularB = localStorage.getItem('labcharts-venice-model-regular');
  const savedVeniceModelE2EEB = localStorage.getItem('labcharts-venice-model-e2ee');
  const savedVeniceKeyB = localStorage.getItem('labcharts-venice-key');
  const savedVeniceCachedKeyB = cryptoMod.getCachedKey('labcharts-venice-key');
  const originalFetchB = globalThis.fetch;
  try {
    cryptoMod.updateKeyCache('labcharts-venice-key', 'test-key');
    localStorage.setItem('labcharts-venice-models', JSON.stringify([
      { id: 'llama-3.3-70b', name: 'Llama 3.3 70B', type: 'text', model_spec: { capabilities: { supportsE2EE: false } } }
    ]));
    localStorage.setItem('labcharts-venice-e2ee-models', JSON.stringify([]));
    localStorage.setItem('labcharts-venice-models-fetched-at', String(Date.now()));
    localStorage.removeItem('labcharts-venice-model-regular');
    localStorage.removeItem('labcharts-venice-model-e2ee');
    api.setVeniceE2EE(false);
    api.setVeniceModel('e2ee-qwen3-30b-a3b-p');

    let capturedModel = '';
    globalThis.fetch = async (_url, options) => {
      capturedModel = JSON.parse(options.body).model;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 1, completion_tokens: 1 }
        })
      };
    };

    await api.callVeniceAPI({ messages: [{ role: 'user', content: 'hi' }], maxTokens: 1 });
    assert('deprecated E2EE prefix migrates to regular Venice model', capturedModel === 'llama-3.3-70b', capturedModel);
    assert('deprecated E2EE prefix is inactive with empty capability cache', !api.isE2EEModel('e2ee-qwen3-30b-a3b-p'));
    assert('deprecated E2EE prefix does not enable Venice E2EE', api.getVeniceE2EE() === false);
  } catch (e) {
    assert('deprecated E2EE prefix Venice call threw no error', false, e.message);
  } finally {
    if (originalFetchB) globalThis.fetch = originalFetchB;
    else delete globalThis.fetch;
    if (savedVeniceModelsB) localStorage.setItem('labcharts-venice-models', savedVeniceModelsB);
    else localStorage.removeItem('labcharts-venice-models');
    if (savedVeniceE2EEModelsB) localStorage.setItem('labcharts-venice-e2ee-models', savedVeniceE2EEModelsB);
    else localStorage.removeItem('labcharts-venice-e2ee-models');
    if (savedVeniceFetchedAtB) localStorage.setItem('labcharts-venice-models-fetched-at', savedVeniceFetchedAtB);
    else localStorage.removeItem('labcharts-venice-models-fetched-at');
    if (savedVeniceModelRegularB) localStorage.setItem('labcharts-venice-model-regular', savedVeniceModelRegularB);
    else localStorage.removeItem('labcharts-venice-model-regular');
    if (savedVeniceModelE2EEB) localStorage.setItem('labcharts-venice-model-e2ee', savedVeniceModelE2EEB);
    else localStorage.removeItem('labcharts-venice-model-e2ee');
    if (savedVeniceKeyB) localStorage.setItem('labcharts-venice-key', savedVeniceKeyB);
    else localStorage.removeItem('labcharts-venice-key');
    if (savedVeniceCachedKeyB) cryptoMod.updateKeyCache('labcharts-venice-key', savedVeniceCachedKeyB);
    else cryptoMod.updateKeyCache('labcharts-venice-key', null);
    if (savedModel) localStorage.setItem('labcharts-venice-model', savedModel);
    else localStorage.removeItem('labcharts-venice-model');
    if (savedE2EE) localStorage.setItem('labcharts-venice-e2ee', savedE2EE);
    else localStorage.removeItem('labcharts-venice-e2ee');
  }
}

// 15c. Missing current E2EE models must fail without mutating the toggle
{
  const savedVeniceModelsC = localStorage.getItem('labcharts-venice-models');
  const savedVeniceE2EEModelsC = localStorage.getItem('labcharts-venice-e2ee-models');
  const savedVeniceFetchedAtC = localStorage.getItem('labcharts-venice-models-fetched-at');
  const savedVeniceKeyC = localStorage.getItem('labcharts-venice-key');
  const savedVeniceCachedKeyC = cryptoMod.getCachedKey('labcharts-venice-key');
  const originalFetchC = globalThis.fetch;
  try {
    cryptoMod.updateKeyCache('labcharts-venice-key', 'test-key');
    localStorage.setItem('labcharts-venice-models', JSON.stringify([
      { id: 'llama-3.3-70b', name: 'Llama 3.3 70B', type: 'text', model_spec: { capabilities: { supportsE2EE: false } } }
    ]));
    localStorage.setItem('labcharts-venice-e2ee-models', JSON.stringify([]));
    localStorage.setItem('labcharts-venice-models-fetched-at', String(Date.now()));
    api.setVeniceE2EE(true);
    api.setVeniceModel('llama-3.3-70b');

    let completionCalls = 0;
    globalThis.fetch = async () => {
      completionCalls += 1;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 1, completion_tokens: 1 }
        })
      };
    };

    let errorMessage = '';
    try {
      await api.callVeniceAPI({ messages: [{ role: 'user', content: 'hi' }], maxTokens: 1 });
    } catch (e) {
      errorMessage = e.message;
    }
    assert('missing Venice E2EE models blocks unencrypted fallback', errorMessage.includes('no current Venice E2EE model'), errorMessage);
    assert('missing Venice E2EE models preserves E2EE toggle', api.getVeniceE2EE() === true);
    assert('missing Venice E2EE models skips completion request', completionCalls === 0, `calls=${completionCalls}`);
  } catch (e) {
    assert('missing Venice E2EE model guard threw no unexpected error', false, e.message);
  } finally {
    if (originalFetchC) globalThis.fetch = originalFetchC;
    else delete globalThis.fetch;
    if (savedVeniceModelsC) localStorage.setItem('labcharts-venice-models', savedVeniceModelsC);
    else localStorage.removeItem('labcharts-venice-models');
    if (savedVeniceE2EEModelsC) localStorage.setItem('labcharts-venice-e2ee-models', savedVeniceE2EEModelsC);
    else localStorage.removeItem('labcharts-venice-e2ee-models');
    if (savedVeniceFetchedAtC) localStorage.setItem('labcharts-venice-models-fetched-at', savedVeniceFetchedAtC);
    else localStorage.removeItem('labcharts-venice-models-fetched-at');
    if (savedVeniceKeyC) localStorage.setItem('labcharts-venice-key', savedVeniceKeyC);
    else localStorage.removeItem('labcharts-venice-key');
    if (savedVeniceCachedKeyC) cryptoMod.updateKeyCache('labcharts-venice-key', savedVeniceCachedKeyC);
    else cryptoMod.updateKeyCache('labcharts-venice-key', null);
    if (savedModel) localStorage.setItem('labcharts-venice-model', savedModel);
    else localStorage.removeItem('labcharts-venice-model');
    if (savedE2EE) localStorage.setItem('labcharts-venice-e2ee', savedE2EE);
    else localStorage.removeItem('labcharts-venice-e2ee');
  }
}

// 16. Settings + Chat source checks
const providerSrc = read('js/provider-panels.js');
const providerRenderSrc = read('js/provider-panel-renderers.js');
const providerModelControlsSrc = read('js/provider-model-controls.js');
assert('provider renderer has venice-e2ee-toggle', providerRenderSrc.includes('venice-e2ee-toggle'));
assert('provider renderer has venice-e2ee-indicator', providerRenderSrc.includes('venice-e2ee-indicator'));
assert('provider model controls has toggleVeniceE2EE', providerModelControlsSrc.includes('function toggleVeniceE2EE'));
assert('provider model controls has Venice model change handler', providerModelControlsSrc.includes('function onVeniceModelDropdownChange'));
assert('Venice model dropdown uses delegated change handler',
  providerRenderSrc.includes('data-provider-panel-change="venice-model"') &&
    providerModelControlsSrc.includes('data-provider-panel-change="venice-model"') &&
    providerSrc.includes('onVeniceModelDropdownChange,'));
const chatSrc = read('js/chat.js');
const chatSendSrc = read('js/chat-send.js');
const chatAttestationSrc = read('js/chat-attestation.js');
assert('chat send uses isVeniceE2EEActive', chatSendSrc.includes('isVeniceE2EEActive'));
assert('chat send imports E2EE attestation helpers', chatSendSrc.includes("from './chat-attestation.js'"));
assert('chat attestation shows lock emoji for E2EE', chatAttestationSrc.includes('\\uD83D\\uDD12'));
const limitedVenice = {
  verificationLevel: 'binding',
  nonceVerified: true,
  signingKeyBound: true,
  debugMode: false,
  dcapVerified: false,
  measurementsVerified: null,
  errors: []
};
const limitedTooltip = chatAttestationMod.attestationTooltip(limitedVenice);
const limitedLock = chatAttestationMod.e2eeLockHTML(limitedVenice);
assert('Venice tooltip distinguishes binding checks from full verification',
  limitedTooltip.includes('basic checks only')
    && limitedTooltip.includes('Intel TDX environment not verified')
    && limitedTooltip.includes('source of each response is not independently verified'),
  limitedTooltip);
assert('Venice binding-only lock is amber and not verified',
  limitedLock.includes('#f59e0b') && limitedLock.includes('basic') && !limitedLock.includes('#22c55e'),
  limitedLock);
const dcapVenice = {
  verificationLevel: 'dcap',
  nonceVerified: true,
  signingKeyBound: true,
  debugMode: false,
  dcapVerified: true,
  dcap: { status: 'UpToDate', advisoryIds: [] },
  measurementsVerified: null,
  errors: []
};
const dcapTooltip = chatAttestationMod.attestationTooltip(dcapVenice);
const dcapLock = chatAttestationMod.e2eeLockHTML(dcapVenice);
assert('Venice DCAP lock has a distinct non-green tier',
  dcapLock.includes('#38bdf8')
    && dcapLock.includes('TEE')
    && dcapLock.includes('class="e2ee-attestation-badge"')
    && dcapLock.includes('data-attestation-tooltip=')
    && !dcapLock.includes('#22c55e'),
  dcapLock);
assert('Venice DCAP tooltip does not claim full workload verification',
  dcapTooltip.includes('TEE check passed')
    && dcapTooltip.includes('Intel TDX environment (DCAP: UpToDate)')
    && dcapTooltip.includes('Approved code measurements are not independently checked')
    && dcapTooltip.includes('source of each response is not independently verified'),
  dcapTooltip);
const gpuVenice = {
  ...dcapVenice,
  gpuVerified: true,
  gpu: {
    overallResult: true,
    eatNonce: 'verified-session-nonce',
    arch: 'HOPPER',
    gpus: { 'GPU-0': {} },
    tokensVerified: true,
    rawTokens: { overall: 'signed-token', perGpu: { 'GPU-0': 'signed-gpu-token' } },
  },
};
const gpuTooltip = chatAttestationMod.attestationTooltip(gpuVenice);
const gpuLock = chatAttestationMod.e2eeLockHTML(gpuVenice);
assert('Venice NRAS lock distinguishes signed GPU and DCAP verification',
  gpuLock.includes('#a78bfa') && gpuLock.includes('TEE + GPU') && !gpuLock.includes('DG') && !gpuLock.includes('#22c55e'),
  gpuLock);
assert('Venice NRAS tooltip reports signed tokens and the co-location limit',
  gpuTooltip.includes('TEE + GPU checks passed')
    && gpuTooltip.includes('NVIDIA GPU evidence (NRAS, ES384 signed, HOPPER)')
    && gpuTooltip.includes('TDX and GPU are each verified, but not proven to run together'),
  gpuTooltip);
assert('Venice provider copy leads with a readable summary and keeps technical detail available',
  providerRenderSrc.includes('TEE + GPU checked')
    && providerRenderSrc.includes('Encrypted Mode')
    && providerRenderSrc.includes('What is checked &mdash; and what is not')
    && providerRenderSrc.includes('Checked in your browser')
    && providerRenderSrc.includes('Intel TDX confidential-computing environment (TEE, verified with DCAP)')
    && providerRenderSrc.includes("NVIDIA's signed GPU result (NRAS)")
    && providerRenderSrc.includes('they do not prove that both are running together')
    && providerRenderSrc.includes('Venice still sees your API key')
    && providerRenderSrc.includes('deployment proxy relays GPU evidence to NRAS')
    && providerRenderSrc.includes('verifies the signed result in your browser'));
assert('chat exports refreshWebSearchToggle', chatSrc.includes('refreshWebSearchToggle'));

console.log(results.join('\n'));
console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
