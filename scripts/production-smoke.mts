#!/usr/bin/env node

import { pathToFileURL } from 'node:url';

import { OFFICIAL_WEARABLE_CLIENT_IDS } from '../lib/proxy-policy.js';

export interface ProductionSmokeOptions {
  baseUrl?: unknown; expectedSha?: unknown; fetchImpl?: typeof fetch;
  attempts?: number; retryDelayMs?: number; timeoutMs?: number; sleep?: (ms: number) => unknown;
}
type DeploymentOptions = Omit<ProductionSmokeOptions, 'baseUrl' | 'expectedSha'> & {baseUrl: unknown; expectedSha: unknown};
type ApiSmokeOptions = Pick<ProductionSmokeOptions, 'fetchImpl' | 'timeoutMs'> & {baseUrl: unknown};
// Response bodies and caught values are raw; these views add no validation.
type CommitReader = {sha?: unknown; ref?: unknown};
type RuntimeConfigReader = {overrides?: unknown};
type WithingsReader = {error?: unknown};
type ErrorReader = {message?: unknown};

const DEFAULT_BASE_URL = 'https://app.getbased.health';
const DEFAULT_ATTEMPTS = 12;
const DEFAULT_RETRY_DELAY_MS = 5_000;
const DEFAULT_TIMEOUT_MS = 10_000;

function assertResponse(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

async function request(fetchImpl: typeof fetch, url: string, init: RequestInit, timeoutMs: number) {
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
    const detail = (error as ErrorReader | null | undefined)?.message || String(error);
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
}: DeploymentOptions) {
  let lastSeen: unknown = 'unavailable';
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await request(fetchImpl, `${baseUrl}/api/commit`, {}, timeoutMs);
      const body: unknown = response.ok ? await response.json() : {};
      lastSeen = (body as CommitReader | null | undefined)?.sha || `HTTP ${response.status}`;
      if (response.ok && (body as CommitReader | null | undefined)?.sha === expectedSha && (body as CommitReader | null | undefined)?.ref === 'main') return body;
    } catch (error) {
      lastSeen = (error as ErrorReader | null | undefined)?.message || String(error);
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
}: ApiSmokeOptions) {
  const allowedOrigin = new URL(baseUrl as string).origin;
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
  const runtimeConfigBody: unknown = await runtimeConfig.json().catch(() => null);
  assertResponse(runtimeConfig.status === 200, `/api/proxy runtime-config probe returned ${runtimeConfig.status}`);
  assertResponse(
    runtimeConfig.headers.get('access-control-allow-origin') === allowedOrigin,
    '/api/proxy runtime-config probe omitted its allowed-origin CORS header',
  );
  assertResponse(
    (runtimeConfigBody as RuntimeConfigReader | null | undefined)?.overrides
      && typeof (runtimeConfigBody as RuntimeConfigReader).overrides === 'object'
      && !Array.isArray((runtimeConfigBody as RuntimeConfigReader).overrides),
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
  const withingsValidationBody: unknown = await withingsValidation.json().catch(() => null);
  assertResponse(
    withingsValidation.status === 400,
    `/api/proxy Withings validation probe returned ${withingsValidation.status}`,
  );
  assertResponse(
    withingsValidation.headers.get('access-control-allow-origin') === allowedOrigin,
    '/api/proxy Withings validation probe omitted its allowed-origin CORS header',
  );
  assertResponse(
    (withingsValidationBody as WithingsReader | null | undefined)?.error === 'withings_token_exchange requires code, redirect_uri, client_id',
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
}: ProductionSmokeOptions = {}) {
  assertResponse(/^[a-f0-9]{40}$/i.test(expectedSha as string), 'EXPECTED_COMMIT_SHA must be a full Git SHA.');
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
      console.error((error as ErrorReader | null | undefined)?.message || error);
      process.exitCode = 1;
    });
}
