import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { updateKeyCache } from '../js/crypto.js';
import { callOpenRouterAPI } from '../js/api-openrouter.js';
import { configureAppExtension } from '../js/app-extension-runtime.js';

const originalFetch = globalThis.fetch;
const params = ['reasoning', 'reasoning_effort', 'temperature', 'response_format'];
const schema = { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'], additionalProperties: false };
const response = (status = 200, message = '') => new Response(JSON.stringify(status === 200 ? {
  choices: [{ message: { content: '{"ok":true}' }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 2, completion_tokens: 3 },
} : { error: { message } }), { status });
const routingError = () => response(404, 'No endpoints found that can handle the requested parameters.');
const catalogResponse = data => new Response(JSON.stringify({ data }));
const request = (modelOverride, extra = {}) => ({
  modelOverride, messages: [{ role: 'user', content: 'synthetic test' }],
  jsonMode: true, jsonSchema: schema, temperature: 0, reasoningEffort: 'none',
  requestRetries: 0, ...extra,
});
const bodyAt = index => JSON.parse(globalThis.fetch.mock.calls[index][1].body);

beforeEach(() => {
  localStorage.clear();
  updateKeyCache('labcharts-openrouter-key', 'test-key');
  globalThis.fetch = vi.fn(async () => response());
  configureAppExtension(null);
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  updateKeyCache('labcharts-openrouter-key', '');
  configureAppExtension(null);
  vi.restoreAllMocks();
});

// Representative public catalog shapes, checked 2026-09-27. Synthetic IDs
// prevent these contract tests from depending on future vendor releases.
const cases = [
  ['non-reasoning', { supported_parameters: ['temperature', 'response_format'] }, undefined, 0],
  ['Sonnet-style', { supported_parameters: ['reasoning', 'response_format'], reasoning: {
    mandatory: false, default_enabled: true, supported_efforts: ['max', 'xhigh', 'high', 'medium', 'low'],
  } }, false, undefined],
  ['Grok-style Off', { supported_parameters: params, reasoning: {
    mandatory: false, default_enabled: true, supported_efforts: ['high', 'medium', 'low', 'none'],
  } }, 'none', 0],
  ['Gemini-style temperature', { supported_parameters: params, reasoning: {
    mandatory: true, default_enabled: true, supported_efforts: ['high', 'medium', 'low', 'minimal'],
  } }, 'minimal', 0],
  ['mandatory no efforts', { supported_parameters: params, reasoning: { mandatory: true } }, undefined, 0],
  ['mandatory empty efforts', { supported_parameters: params, reasoning: { mandatory: true, supported_efforts: [] } }, undefined, 0],
  ['mandatory null efforts', { supported_parameters: params, reasoning: { mandatory: true, supported_efforts: null } }, undefined, 0],
  ['optional null efforts', { supported_parameters: params, reasoning: { default_enabled: true, supported_efforts: null } }, 'none', 0],
  ['optional no efforts', { supported_parameters: params, reasoning: { default_enabled: true } }, 'none', 0],
  ['default-off accepts Off', { supported_parameters: params, reasoning: { default_enabled: false, supported_efforts: ['low', 'none'] } }, 'none', 0],
  ['mandatory overrides conflicting Off', { supported_parameters: params, reasoning: { mandatory: true, supported_efforts: ['low', 'none'] } }, 'low', 0],
  ['unknown parameters', { reasoning: { mandatory: true, supported_efforts: ['high'] } }, 'high', 0],
  ['unknown model', {}, 'none', 0],
];

describe.each([false, true])('OpenRouter jsonMode=%s', jsonMode => {
  it.each(cases)('%s respects independent reasoning and temperature capabilities', async (name, model, effort, temperature) => {
    const id = `test/${name}`;
    localStorage.setItem('labcharts-openrouter-models', JSON.stringify([{ id, ...model }]));
    const opts = Object.freeze(request(id, { jsonMode }));
    const result = await callOpenRouterAPI(opts);
    expect(result.text).toBe('{"ok":true}');
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const body = bodyAt(0);
    if (effort === undefined) expect(body).not.toHaveProperty('reasoning');
    else expect(body.reasoning).toEqual(effort === false ? { enabled: false } : { effort });
    expect(body).not.toHaveProperty('reasoning_effort');
    if (temperature === undefined) expect(body).not.toHaveProperty('temperature');
    else expect(body.temperature).toBe(temperature);
    expect(opts.reasoningEffort).toBe('none');
    expect(opts.temperature).toBe(0);
    if (jsonMode) {
      expect(body.provider.require_parameters).toBe(true);
      expect(body.response_format.json_schema.schema).toEqual(schema);
    } else expect(body).not.toHaveProperty('response_format');
  });
});

it.each([undefined, 'low', 'high'])('drops unsupported temperature independently of effort=%s', async effort => {
  localStorage.setItem('labcharts-openrouter-models', JSON.stringify([{
    id: 'test/no-temperature', supported_parameters: ['reasoning', 'response_format'],
    reasoning: { mandatory: true, supported_efforts: ['low', 'high'] },
  }]));
  await callOpenRouterAPI(request('test/no-temperature', { reasoningEffort: effort }));
  expect(bodyAt(0)).not.toHaveProperty('temperature');
  expect(bodyAt(0).reasoning?.effort).toBe(effort);
});

it('preserves default reasoning and temperature when no explicit controls were requested', async () => {
  await callOpenRouterAPI(request('test/defaults', { temperature: undefined, reasoningEffort: undefined }));
  expect(bodyAt(0)).not.toHaveProperty('temperature');
  expect(bodyAt(0)).not.toHaveProperty('reasoning');
});

it('uses the override model rather than the selected model capabilities', async () => {
  localStorage.setItem('labcharts-openrouter-model', 'test/selected');
  localStorage.setItem('labcharts-openrouter-models', JSON.stringify([
    { id: 'test/selected', supported_parameters: ['response_format'] },
    { id: 'test/override', supported_parameters: params, reasoning: { supported_efforts: ['none', 'high'] } },
  ]));
  await callOpenRouterAPI(request('test/override'));
  expect(bodyAt(0)).toMatchObject({ model: 'test/override', temperature: 0, reasoning: { effort: 'none' } });
});

it.each(['missing', 'stale', 'malformed'])('refreshes %s metadata after the specific routing 404 and keeps request constraints', async cache => {
  const id = `test/refresh-${cache}`;
  if (cache === 'stale') localStorage.setItem('labcharts-openrouter-models', JSON.stringify([{ id, supported_parameters: params }]));
  if (cache === 'malformed') localStorage.setItem('labcharts-openrouter-models', '{broken');
  const originalCatalog = localStorage.getItem('labcharts-openrouter-models');
  configureAppExtension({ id: 'routing-test', ai: { getRequestOptions: () => ({ provider: { zdr: true, only: ['test-provider'], allow_fallbacks: false } }) } });
  globalThis.fetch.mockReset().mockResolvedValueOnce(routingError())
    .mockResolvedValueOnce(catalogResponse([{ id, supported_parameters: ['reasoning', 'response_format'],
      reasoning: { mandatory: false, default_enabled: true, supported_efforts: ['high', 'low'] } }]))
    .mockImplementation(async () => response());
  await callOpenRouterAPI(request(id));
  expect(globalThis.fetch).toHaveBeenCalledTimes(3);
  const lookup = globalThis.fetch.mock.calls[1];
  expect(lookup[0]).toBe('https://openrouter.ai/api/v1/models');
  expect(lookup[1]).not.toHaveProperty('body');
  expect(lookup[1]).not.toHaveProperty('headers');
  const before = bodyAt(0), after = bodyAt(2);
  expect(after.reasoning).toEqual({ enabled: false });
  expect(after).not.toHaveProperty('temperature');
  expect(after.provider).toEqual(before.provider);
  expect(after.provider).toMatchObject({ require_parameters: true, zdr: true, only: ['test-provider'], allow_fallbacks: false });
  expect(after.response_format).toEqual(before.response_format);
  expect(after.messages).toEqual(before.messages);
  expect(after.model).toBe(before.model);
  expect(localStorage.getItem('labcharts-openrouter-models')).toBe(originalCatalog);
  // Reuse fresh capabilities without another failed inference attempt.
  await callOpenRouterAPI(request(id));
  expect(globalThis.fetch).toHaveBeenCalledTimes(4);
  expect(bodyAt(3).reasoning).toEqual({ enabled: false });
});

it('refreshes a non-reasoning model without discarding temperature', async () => {
  const id = 'test/refresh-non-reasoning';
  globalThis.fetch.mockReset().mockResolvedValueOnce(routingError())
    .mockResolvedValueOnce(catalogResponse([{ id, supported_parameters: ['temperature', 'response_format'] }]))
    .mockResolvedValueOnce(response());
  await callOpenRouterAPI(request(id));
  expect(bodyAt(2)).not.toHaveProperty('reasoning');
  expect(bodyAt(2).temperature).toBe(0);
});

it('does not turn a supported Off selection on during recovery', async () => {
  const id = 'test/refresh-off';
  globalThis.fetch.mockReset().mockResolvedValueOnce(routingError())
    .mockResolvedValueOnce(catalogResponse([{ id, supported_parameters: ['reasoning', 'response_format'],
      reasoning: { default_enabled: true, supported_efforts: ['high', 'low', 'none'] } }]))
    .mockResolvedValueOnce(response());
  await callOpenRouterAPI(request(id));
  expect(bodyAt(2).reasoning).toEqual({ effort: 'none' });
});

it.each([
  [404, 'No endpoints found that match your data policy.'],
  [404, 'Model not found'], [401, 'Unauthorized'], [402, 'Insufficient credits'],
  [429, 'Rate limit'], [500, 'Server error'],
])('does not refresh or replay an unrelated %i error: %s', async (status, message) => {
  globalThis.fetch.mockResolvedValue(response(status, message));
  await expect(callOpenRouterAPI(request(`test/error-${status}-${message}`))).rejects.toThrow();
  expect(globalThis.fetch).toHaveBeenCalledTimes(1);
});

it.each(['unchanged', 'missing', 'failed', 'invalid-json', 'network'])('preserves routing failure when metadata is %s', async state => {
  const id = `test/no-recovery-${state}`;
  const next = state === 'unchanged' ? catalogResponse([{ id, supported_parameters: params, reasoning: { supported_efforts: ['none'] } }])
    : state === 'failed' ? response(503, 'unavailable')
      : state === 'invalid-json' ? new Response('not JSON') : catalogResponse([]);
  globalThis.fetch.mockReset().mockResolvedValueOnce(routingError());
  if (state === 'network') globalThis.fetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
  else globalThis.fetch.mockResolvedValueOnce(next);
  await expect(callOpenRouterAPI(request(id, state === 'unchanged' ? { temperature: undefined } : {}))).rejects.toThrow('404');
  expect(globalThis.fetch).toHaveBeenCalledTimes(2);
});

it.each([[false, false], [false, true], [true, false], [true, true]])('recovers endpoint-specific temperature rejection with cold cache=%s, jsonMode=%s', async (coldCache, jsonMode) => {
  const id = `test/vertex-temperature-${coldCache}-${jsonMode}`;
  const model = { id, supported_parameters: params, reasoning: { mandatory: true, supported_efforts: ['high', 'medium', 'low'] } };
  if (!coldCache) localStorage.setItem('labcharts-openrouter-models', JSON.stringify([model]));
  configureAppExtension({ id: 'restricted-routing', ai: { getRequestOptions: () => ({
    provider: { only: ['google-vertex'], zdr: true, data_collection: 'deny', allow_fallbacks: false },
  }) } });
  globalThis.fetch.mockImplementation(async (url, init) => {
    if (url.endsWith('/models')) return catalogResponse([model]);
    const body = JSON.parse(init.body);
    return body.temperature !== undefined || body.reasoning?.effort === 'none' ? routingError() : response();
  });
  const result = await callOpenRouterAPI(request(id, { maxTokens: 16384, jsonMode }));
  expect(result.diagnostics.temperatureControlFallback).toBe(true);
  const attempts = globalThis.fetch.mock.calls.filter(([, init]) => init.body).map(([, init]) => JSON.parse(init.body));
  expect(attempts).toHaveLength(coldCache ? 3 : 2);
  const last = attempts.at(-1);
  expect(last).not.toHaveProperty('temperature');
  expect(last.reasoning).toEqual({ effort: 'low' });
  expect(last.max_tokens).toBe(16384);
  expect(last.provider).toEqual({ only: ['google-vertex'], zdr: true, data_collection: 'deny', allow_fallbacks: false, ...(jsonMode ? { require_parameters: true } : {}) });
  expect(last.response_format).toEqual(attempts[0].response_format);
  expect(last.messages).toEqual(attempts[0].messages);
  const lookup = globalThis.fetch.mock.calls.find(([url]) => url.endsWith('/models'));
  expect(lookup[1]).not.toHaveProperty('headers');
  expect(lookup[1]).not.toHaveProperty('body');
});

it.each([false, true])('bounds endpoint fallback and preserves an explicit reasoning choice, jsonMode=%s', async jsonMode => {
  const id = `test/endpoint-bounded-${jsonMode}`;
  const model = { id, supported_parameters: params, reasoning: { supported_efforts: ['high'] } };
  localStorage.setItem('labcharts-openrouter-models', JSON.stringify([model]));
  globalThis.fetch.mockImplementation(async url => url.endsWith('/models') ? catalogResponse([model]) : routingError());
  await expect(callOpenRouterAPI(request(id, { jsonMode, reasoningEffort: 'high' }))).rejects.toThrow('404');
  expect(globalThis.fetch).toHaveBeenCalledTimes(3);
  expect(bodyAt(2).reasoning).toEqual({ effort: 'high' });
  expect(bodyAt(2)).not.toHaveProperty('temperature');
});

it.each([
  ['mandatory effort', { supported_parameters: params, reasoning: { mandatory: true, supported_efforts: ['high', 'low'] } }, { effort: 'low' }],
  ['mandatory default', { supported_parameters: params, reasoning: { mandatory: true } }, undefined],
  ['no reasoning', { supported_parameters: ['temperature', 'response_format'] }, undefined],
])('removes a stale disable switch when refreshed capabilities require %s', async (name, fresh, expected) => {
  const id = `test/stale-disabled-${name}`;
  localStorage.setItem('labcharts-openrouter-models', JSON.stringify([{ id, supported_parameters: params,
    reasoning: { mandatory: false, supported_efforts: ['high', 'low'] } }]));
  globalThis.fetch.mockReset().mockResolvedValueOnce(routingError())
    .mockResolvedValueOnce(catalogResponse([{ id, ...fresh }]))
    .mockResolvedValueOnce(response());
  await callOpenRouterAPI(request(id, { temperature: undefined }));
  expect(bodyAt(0).reasoning).toEqual({ enabled: false });
  expect(globalThis.fetch).toHaveBeenCalledTimes(3);
  expect(bodyAt(2).reasoning).toEqual(expected);
  expect(bodyAt(2).response_format).toEqual(bodyAt(0).response_format);
  expect(bodyAt(2).messages).toEqual(bodyAt(0).messages);
});

it('keeps endpoint fallback through a subsequent schema validation retry', async () => {
  const id = 'test/endpoint-schema-fallback';
  const model = { id, supported_parameters: params, reasoning: { supported_efforts: ['none'] } };
  localStorage.setItem('labcharts-openrouter-models', JSON.stringify([model]));
  globalThis.fetch.mockReset().mockResolvedValueOnce(routingError())
    .mockResolvedValueOnce(catalogResponse([model]))
    .mockResolvedValueOnce(response(400, 'response_format json_schema unsupported'))
    .mockResolvedValueOnce(response());
  const result = await callOpenRouterAPI(request(id));
  expect(result.diagnostics).toMatchObject({ temperatureControlFallback: true, structuredOutputFallback: true });
  expect(globalThis.fetch).toHaveBeenCalledTimes(4);
  for (const index of [2, 3]) {
    expect(bodyAt(index)).not.toHaveProperty('temperature');
    expect(bodyAt(index).reasoning).toEqual({ effort: 'none' });
    expect(bodyAt(index).provider.require_parameters).toBe(true);
  }
});

it('bounds routing recovery to one changed retry', async () => {
  const id = 'test/bounded-retry';
  globalThis.fetch.mockReset().mockResolvedValueOnce(routingError())
    .mockResolvedValueOnce(catalogResponse([{ id, supported_parameters: ['response_format'] }]))
    .mockResolvedValueOnce(routingError());
  await expect(callOpenRouterAPI(request(id))).rejects.toThrow('404');
  expect(globalThis.fetch).toHaveBeenCalledTimes(3);
});

it('retains 400/422 validation recovery after capability shaping', async () => {
  const id = 'test/validation-fallbacks';
  globalThis.fetch.mockReset().mockResolvedValueOnce(response(400, 'reasoning is mandatory and cannot be disabled'))
    .mockResolvedValueOnce(response(422, 'temperature is not supported'))
    .mockResolvedValueOnce(response(400, 'response_format is unsupported'))
    .mockResolvedValueOnce(response());
  const result = await callOpenRouterAPI(request(id));
  expect(globalThis.fetch).toHaveBeenCalledTimes(4);
  expect(result.diagnostics).toMatchObject({ reasoningControlFallback: true, temperatureControlFallback: true, structuredOutputFallback: true });
});

it('preserves streaming, usage, finish reason, and headers after shaping', async () => {
  localStorage.setItem('labcharts-openrouter-models', JSON.stringify([{ id: 'test/stream', supported_parameters: ['reasoning', 'response_format'],
    reasoning: { mandatory: true, supported_efforts: ['low', 'high'] } }]));
  globalThis.fetch.mockResolvedValue(new Response([
    'data: {"choices":[{"delta":{"content":"ok"},"finish_reason":null}]}\n\n',
    'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":2,"completion_tokens":3}}\n\n',
    'data: [DONE]\n\n',
  ].join(''), { headers: { 'Content-Type': 'text/event-stream' } }));
  const onStream = vi.fn();
  const result = await callOpenRouterAPI(request('test/stream', { onStream }));
  expect(result).toMatchObject({ text: 'ok', usage: { inputTokens: 2, outputTokens: 3 }, finishReason: 'stop' });
  expect(onStream).toHaveBeenCalled();
  expect(bodyAt(0)).toMatchObject({ stream: true, stream_options: { include_usage: true }, reasoning: { effort: 'low' } });
  expect(bodyAt(0)).not.toHaveProperty('temperature');
  expect(globalThis.fetch.mock.calls[0][1].headers).toMatchObject({ Authorization: 'Bearer test-key', 'X-Title': 'getbased' });
});

it('cancels a metadata lookup without replaying the prompt', async () => {
  const controller = new AbortController();
  globalThis.fetch.mockReset().mockResolvedValueOnce(routingError()).mockImplementationOnce(async (_url, init) => {
    controller.abort(new DOMException('Aborted by user', 'AbortError'));
    expect(init.signal.aborted).toBe(true);
    throw init.signal.reason;
  });
  await expect(callOpenRouterAPI(request('test/abort-refresh', { signal: controller.signal }))).rejects.toThrow(/abort/i);
  expect(globalThis.fetch).toHaveBeenCalledTimes(2);
});

it('bounds a stalled metadata lookup and preserves the original routing error', async () => {
  vi.useFakeTimers();
  try {
    globalThis.fetch.mockReset().mockResolvedValueOnce(routingError()).mockImplementationOnce((_url, init) => new Promise((_, reject) => {
      init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true });
    }));
    const result = expect(callOpenRouterAPI(request('test/metadata-timeout'))).rejects.toThrow('404');
    await vi.advanceTimersByTimeAsync(5001);
    await result;
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  } finally { vi.useRealTimers(); }
});

it('does not contact OpenRouter when a managed request is denied', async () => {
  configureAppExtension({ id: 'denied-openrouter', ai: {
    isCredentialOwned: () => true, authorizeRequest: async () => false,
  } });
  await expect(callOpenRouterAPI(request('test/denied'))).rejects.toThrow(/not authorized/);
  expect(globalThis.fetch).not.toHaveBeenCalled();
});

it('passes shaped options to an authorized edition-owned transport without public fallback', async () => {
  localStorage.setItem('labcharts-openrouter-models', JSON.stringify([{ id: 'test/managed', supported_parameters: ['reasoning'],
    reasoning: { mandatory: true, supported_efforts: ['low'] } }]));
  const callProvider = vi.fn(async () => ({ text: 'managed' }));
  configureAppExtension({ id: 'owned-openrouter', ai: {
    isCredentialOwned: () => true, authorizeRequest: async () => true,
    isProviderCallOwned: () => true, callProvider,
  } });
  expect(await callOpenRouterAPI(request('test/managed'))).toEqual({ text: 'managed' });
  const forwarded = callProvider.mock.calls[0][0].request;
  expect(forwarded.reasoningEffort).toBe('low');
  expect(forwarded).not.toHaveProperty('temperature');
  expect(globalThis.fetch).not.toHaveBeenCalled();
});

it('keeps refreshed capabilities through subsequent structured-output validation fallback', async () => {
  const id = 'test/refresh-then-schema-fallback';
  globalThis.fetch.mockReset().mockResolvedValueOnce(routingError())
    .mockResolvedValueOnce(catalogResponse([{ id, supported_parameters: ['reasoning', 'response_format'],
      reasoning: { supported_efforts: ['low', 'high'] } }]))
    .mockResolvedValueOnce(response(400, 'response_format json_schema unsupported'))
    .mockResolvedValueOnce(response());
  const result = await callOpenRouterAPI(request(id));
  expect(result.diagnostics.structuredOutputFallback).toBe(true);
  expect(globalThis.fetch).toHaveBeenCalledTimes(4);
  for (const index of [2, 3]) {
    expect(bodyAt(index).reasoning).toEqual({ effort: 'low' });
    expect(bodyAt(index)).not.toHaveProperty('temperature');
    expect(bodyAt(index).provider.require_parameters).toBe(true);
  }
  expect(bodyAt(3)).not.toHaveProperty('response_format');
});

it('expires refreshed metadata so later model capability changes can be recovered', async () => {
  vi.useFakeTimers();
  try {
    const id = 'test/expiring-metadata';
    globalThis.fetch.mockReset().mockResolvedValueOnce(routingError())
      .mockResolvedValueOnce(catalogResponse([{ id, supported_parameters: ['response_format'] }]))
      .mockImplementation(async () => response());
    await callOpenRouterAPI(request(id));
    await vi.advanceTimersByTimeAsync(60001);
    await callOpenRouterAPI(request(id));
    expect(bodyAt(3).reasoning).toEqual({ effort: 'none' });
    expect(bodyAt(3).temperature).toBe(0);
  } finally { vi.useRealTimers(); }
});
