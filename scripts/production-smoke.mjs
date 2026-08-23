#!/usr/bin/env node

import { pathToFileURL } from 'node:url';

import { OFFICIAL_WEARABLE_CLIENT_IDS } from '../lib/proxy-policy.js';

const DEFAULT_BASE_URL = 'https://app.getbased.health';
const DEFAULT_ATTEMPTS = 12;
const DEFAULT_RETRY_DELAY_MS = 5_000;
const DEFAULT_TIMEOUT_MS = 10_000;

function assertResponse(condition, message) {
  if (!condition) throw new Error(message);
}

async function request(fetchImpl, url, init, timeoutMs) {
  try {
    return await fetchImpl(url, {
      ...init,
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    let target = url;
    try {
      target = new URL(url).pathname;
    } catch {}
    const method = init?.method || 'GET';
    const detail = error?.message || String(error);
    throw new Error(`${method} ${target} failed: ${detail}`, { cause: error });
  }
}

export async function waitForExpectedDeployment({
  baseUrl,
  expectedSha,
  fetchImpl = fetch,
  attempts = DEFAULT_ATTEMPTS,
  retryDelayMs = DEFAULT_RETRY_DELAY_MS,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
}) {
  let lastSeen = 'unavailable';
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await request(fetchImpl, `${baseUrl}/api/commit`, {}, timeoutMs);
      const body = response.ok ? await response.json() : {};
      lastSeen = body?.sha || `HTTP ${response.status}`;
      if (response.ok && body?.sha === expectedSha && body?.ref === 'main') return body;
    } catch (error) {
      lastSeen = error?.message || String(error);
    }
    if (attempt < attempts) await sleep(retryDelayMs);
  }
  throw new Error(
    `Production did not converge to ${expectedSha}; last /api/commit result: ${lastSeen}`,
  );
}

export async function smokeProductionApis({
  baseUrl,
  fetchImpl = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  const allowedOrigin = new URL(baseUrl).origin;
  const evilOrigin = 'https://runtime-canary.invalid';
  const allowedProxy = await request(fetchImpl, `${baseUrl}/api/proxy`, {
    method: 'OPTIONS',
    headers: { origin: allowedOrigin },
  }, timeoutMs);
  assertResponse(allowedProxy.status === 204, `/api/proxy preflight returned ${allowedProxy.status}`);
  assertResponse(
    allowedProxy.headers.get('access-control-allow-origin') === allowedOrigin,
    '/api/proxy omitted its allowed-origin CORS header',
  );

  const blockedProxy = await request(fetchImpl, `${baseUrl}/api/proxy`, {
    method: 'OPTIONS',
    headers: { origin: evilOrigin },
  }, timeoutMs);
  assertResponse(blockedProxy.status === 403, `/api/proxy rejected-origin probe returned ${blockedProxy.status}`);
  assertResponse(
    !blockedProxy.headers.has('access-control-allow-origin'),
    '/api/proxy reflected a rejected origin',
  );

  const methodProbe = await request(fetchImpl, `${baseUrl}/api/proxy`, {
    method: 'GET',
    headers: { origin: allowedOrigin },
  }, timeoutMs);
  assertResponse(methodProbe.status === 405, `/api/proxy method probe returned ${methodProbe.status}`);

  // The 2026-07-26 Withings incident left OPTIONS and GET looking healthy
  // while every POST invocation hung until Vercel's function timeout. Exercise
  // a secret-free runtime-config POST and the Withings-specific validation
  // branch so future entrypoint/adapter regressions fail the deployment smoke.
  const runtimeConfig = await request(fetchImpl, `${baseUrl}/api/proxy`, {
    method: 'POST',
    headers: {
      origin: allowedOrigin,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ wearable_runtime_config: true }),
  }, timeoutMs);
  const runtimeConfigBody = await runtimeConfig.json().catch(() => null);
  assertResponse(runtimeConfig.status === 200, `/api/proxy runtime-config probe returned ${runtimeConfig.status}`);
  assertResponse(
    runtimeConfig.headers.get('access-control-allow-origin') === allowedOrigin,
    '/api/proxy runtime-config probe omitted its allowed-origin CORS header',
  );
  assertResponse(
    runtimeConfigBody?.overrides
      && typeof runtimeConfigBody.overrides === 'object'
      && !Array.isArray(runtimeConfigBody.overrides),
    '/api/proxy runtime-config probe returned an invalid payload',
  );

  const withingsValidation = await request(fetchImpl, `${baseUrl}/api/proxy`, {
    method: 'POST',
    headers: {
      origin: allowedOrigin,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      withings_token_exchange: {
        client_id: OFFICIAL_WEARABLE_CLIENT_IDS.withings,
        redirect_uri: `${baseUrl}/`,
      },
    }),
  }, timeoutMs);
  const withingsValidationBody = await withingsValidation.json().catch(() => null);
  assertResponse(
    withingsValidation.status === 400,
    `/api/proxy Withings validation probe returned ${withingsValidation.status}`,
  );
  assertResponse(
    withingsValidation.headers.get('access-control-allow-origin') === allowedOrigin,
    '/api/proxy Withings validation probe omitted its allowed-origin CORS header',
  );
  assertResponse(
    withingsValidationBody?.error === 'withings_token_exchange requires code, redirect_uri, client_id',
    '/api/proxy Withings validation probe returned an unexpected payload',
  );

  const allowedShare = await request(fetchImpl, `${baseUrl}/api/share`, {
    method: 'OPTIONS',
    headers: { origin: allowedOrigin },
  }, timeoutMs);
  assertResponse(allowedShare.status === 204, `/api/share preflight returned ${allowedShare.status}`);
  assertResponse(
    allowedShare.headers.get('access-control-allow-origin') === allowedOrigin,
    '/api/share omitted its allowed-origin CORS header',
  );
}

export async function runProductionSmoke({
  baseUrl = process.env.PRODUCTION_BASE_URL || DEFAULT_BASE_URL,
  expectedSha = process.env.EXPECTED_COMMIT_SHA || '',
  ...options
} = {}) {
  assertResponse(/^[a-f0-9]{40}$/i.test(expectedSha), 'EXPECTED_COMMIT_SHA must be a full Git SHA.');
  const normalizedBaseUrl = String(baseUrl).replace(/\/+$/, '');
  await waitForExpectedDeployment({
    baseUrl: normalizedBaseUrl,
    expectedSha,
    ...options,
  });
  await smokeProductionApis({ baseUrl: normalizedBaseUrl, ...options });
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === invokedPath) {
  runProductionSmoke()
    .then(() => console.log('Production API smoke passed.'))
    .catch(error => {
      console.error(error?.message || error);
      process.exitCode = 1;
    });
}
