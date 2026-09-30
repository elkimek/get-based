import { afterEach, describe, expect, it, vi } from 'vitest';

import { callOpenAICompatibleAPI } from '../js/api-openai-compatible.js';

afterEach(() => {
  vi.useRealTimers();
});


describe('custom secure fetch request timeout lifecycle', () => {
  it('sends schema-constrained JSON output to cloud-compatible vision models', async () => {
    const compatibleFetch = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: '{"mealName":"Soup"}' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    await callOpenAICompatibleAPI(
      'https://provider.example.test/v1/chat/completions',
      'test-key',
      'x-ai/grok-4.6',
      'OpenRouter',
      {
        messages: [{ role: 'user', content: 'analyze' }],
        maxTokens: 64,
        forceNonStream: true,
        jsonMode: true,
        jsonSchema: { type: 'object', properties: { mealName: { type: 'string' } } },
        temperature: 0,
        reasoningEffort: 'low',
      },
      {},
      { useProxy: false, fetchImpl: compatibleFetch },
    );

    const body = JSON.parse(compatibleFetch.mock.calls[0][1].body);
    expect(body.model).toBe('x-ai/grok-4.6');
    expect(body.temperature).toBe(0);
    expect(body.reasoning_effort).toBe('low');
    expect(body.response_format).toMatchObject({
      type: 'json_schema',
      json_schema: {
        name: 'structured_response',
        strict: true,
        schema: { type: 'object' },
      },
    });
  });

  const validationRetries = [
    {
      name: 'retries without temperature when a compatible provider does not support the control',
      endpoint: 'https://provider.example.test/v1/chat/completions', model: 'fixed-temperature-model', provider: 'Custom',
      error: { error: { message: 'temperature is not supported for this model' } },
      reply: { choices: [{ message: { content: '{"mealName":"Soup"}' }, finish_reason: 'stop' }] },
      options: { messages: [{ role: 'user', content: 'analyze' }], forceNonStream: true, temperature: 0 },
      diagnostics: { temperatureControlFallback: true },
      assertRequests(bodies) {
        expect(bodies).toHaveLength(2);
        expect(bodies[0].temperature).toBe(0);
        expect(bodies[1]).not.toHaveProperty('temperature');
      },
    },
    {
      name: 'retries without structured output when Venice rejects its translated schema',
      endpoint: 'https://api.venice.ai/api/v1/chat/completions', model: 'claude-opus-4.8', provider: 'Venice',
      error: { error: { message: "output_config.format.schema: For 'anyOf', 'minimum' is not supported" } },
      reply: { choices: [{ message: { content: '{"mealName":"Soup"}' }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 5 } },
      options: { messages: [{ role: 'user', content: 'analyze' }], forceNonStream: true, jsonMode: true, jsonSchema: { type: 'object' } },
      diagnostics: { structuredOutputFallback: true },
      assertRequests(bodies) {
        expect(bodies).toHaveLength(2);
        expect(bodies[0]).toHaveProperty('response_format');
        expect(bodies[1]).not.toHaveProperty('response_format');
      },
    },
    {
      name: 'recognizes the Gemini any_of sibling-field rejection and retries without the schema',
      endpoint: 'https://api.venice.ai/api/v1/chat/completions', model: 'gemini-3-7-flash', provider: 'Venice',
      error: { error: { message: 'Unable to submit request because one or more response schemas specified other fields alongside any_of. When using any_of, it must be the only field set.' } },
      reply: { choices: [{ message: { content: '{"mealName":"Soup"}' }, finish_reason: 'stop' }] },
      options: { messages: [{ role: 'user', content: 'analyze' }], forceNonStream: true, jsonMode: true, jsonSchema: { type: 'object' } },
      diagnostics: { structuredOutputFallback: true },
      assertRequests(bodies) {
        expect(bodies).toHaveLength(2);
        expect(bodies[0]).toHaveProperty('response_format');
        expect(bodies[1]).not.toHaveProperty('response_format');
      },
    },
  ];

  it.each(validationRetries)('$name', async contract => {
    const bodies = [];
    const compatibleFetch = vi.fn(async (_url, options) => {
      bodies.push(JSON.parse(options.body));
      if (bodies.length === 1) {
        return new Response(JSON.stringify(contract.error), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify(contract.reply), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });

    await expect(callOpenAICompatibleAPI(
      contract.endpoint, 'test-key', contract.model, contract.provider, contract.options,
      {}, { useProxy: false, fetchImpl: compatibleFetch },
    )).resolves.toMatchObject({ diagnostics: contract.diagnostics });
    contract.assertRequests(bodies);
  });

  it('does not abort a PPQ/Routstr-style decrypted stream after headers arrive', async () => {
    vi.useFakeTimers();
    const encoder = new TextEncoder();
    let capturedSignal;
    const secureFetch = vi.fn(async (_url, options) => {
      capturedSignal = options.signal;
      return new Response(new ReadableStream({
        start(controller) {
          const responseTimer = setTimeout(() => {
            controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"secure stream ok"},"finish_reason":"stop"}]}\n\n'));
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
          }, 1500);
          options.signal.addEventListener('abort', () => {
            clearTimeout(responseTimer);
            controller.error(options.signal.reason);
          }, { once: true });
        },
      }), {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      });
    });

    const pending = callOpenAICompatibleAPI(
      'https://private.example.test/v1/chat/completions',
      'sk-private-test',
      'glm-5-2',
      'Private TEE',
      {
        messages: [{ role: 'user', content: 'long private request' }],
        maxTokens: 32,
        onStream: vi.fn(),
        requestTimeoutMs: 1000,
      },
      {},
      { useProxy: false, fetchImpl: secureFetch },
    );

    await vi.advanceTimersByTimeAsync(1600);
    await expect(pending).resolves.toMatchObject({
      text: 'secure stream ok',
      finishReason: 'stop',
    });
    expect(capturedSignal.aborted).toBe(false);
  });

  it('still times out a secure fetch that has not returned response headers', async () => {
    vi.useFakeTimers();
    const secureFetch = vi.fn(async (_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
    }));
    const pending = callOpenAICompatibleAPI(
      'https://private.example.test/v1/chat/completions',
      'sk-private-test',
      'glm-5-2',
      'Private TEE',
      {
        messages: [{ role: 'user', content: 'slow headers' }],
        maxTokens: 32,
        forceNonStream: true,
        requestTimeoutMs: 1000,
      },
      {},
      { useProxy: false, fetchImpl: secureFetch },
    );

    const rejection = expect(pending).rejects.toThrow('request timed out after 1s');
    await vi.advanceTimersByTimeAsync(1001);
    await rejection;
  });

  it('surfaces reasoning-only secure responses when the stream ends', async () => {
    const onStream = vi.fn();
    const secureFetch = vi.fn(async () => new Response(
      'data: {"choices":[{"delta":{"reasoning_content":"reasoning fallback"}}]}\n\n'
      + 'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n'
      + 'data: [DONE]\n\n',
      { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
    ));

    await expect(callOpenAICompatibleAPI(
      'https://private.example.test/v1/chat/completions',
      'sk-private-test',
      'glm-5-2',
      'Private TEE',
      {
        messages: [{ role: 'user', content: 'reason only' }],
        maxTokens: 32,
        onStream,
        requestTimeoutMs: 1000,
      },
      {},
      { useProxy: false, fetchImpl: secureFetch },
    )).resolves.toMatchObject({ text: 'reasoning fallback', finishReason: 'stop' });
    expect(onStream).toHaveBeenCalledWith('reasoning fallback');
  });

  it('reports an empty secure stream instead of accepting a blank answer', async () => {
    const secureFetch = vi.fn(async () => new Response(
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n'
      + 'data: [DONE]\n\n',
      { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
    ));

    await expect(callOpenAICompatibleAPI(
      'https://private.example.test/v1/chat/completions',
      'sk-private-test',
      'glm-5-2',
      'Private TEE',
      {
        messages: [{ role: 'user', content: 'empty result' }],
        maxTokens: 32,
        onStream: vi.fn(),
        requestTimeoutMs: 1000,
      },
      {},
      { useProxy: false, fetchImpl: secureFetch },
    )).rejects.toThrow('stream ended without response content');
  });
});

describe('stream stall guard', () => {


  it('applies the first-read allowance to Local AI streams then guards subsequent reads', async () => {
    const { LOCAL_AI_FIRST_TOKEN_STALL_MS, STREAM_STALL_TIMEOUT_MS } = await import('../js/api-transport.js');
    vi.useFakeTimers();
    const encoder = new TextEncoder();
    let readCount = 0;
    const chunks = [
      'data: {"choices":[{"delta":{"role":"assistant","content":""}}]}\n',
      'data: {"choices":[{"delta":{"content":"par"}}]}\n',
      'data: {"choices":[{"delta":{"content":"tial"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n',
    ];
    const stream = new ReadableStream({
      async pull(controller) {
        readCount++;
        if (readCount <= 2) {
          // Simulate a role-only metadata event, then continued prompt prefill:
          // both reads need the first-token allowance.
          await vi.advanceTimersByTimeAsync(STREAM_STALL_TIMEOUT_MS * 3);
          controller.enqueue(encoder.encode(chunks[readCount - 1]));
          return;
        }
        controller.enqueue(encoder.encode(chunks[2]));
        controller.close();
      },
    });
    const result = await callOpenAICompatibleAPI(
      'http://localhost:1234/v1/chat/completions',
      '',
      'local-model',
      'Local AI',
      {
        messages: [{ role: 'user', content: 'long prompt' }],
        maxTokens: 32,
        onStream: vi.fn(),
        requestTimeoutMs: 1000,
      },
      {},
      {
        useProxy: false,
        firstReadStallMs: LOCAL_AI_FIRST_TOKEN_STALL_MS,
        fetchImpl: async () => new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }),
      },
    );
    expect(result.text).toBe('partial');
    expect(result.finishReason).toBe('stop');
  });
});

it('honors an explicit feature token ceiling for thinking models without changing chat defaults', async () => {
  const limits = [];
  const fetchImpl = async (_url, options) => {
    limits.push(JSON.parse(options.body).max_tokens);
    return new Response(JSON.stringify({ choices: [{ message: { content: 'Complete answer' }, finish_reason: 'stop' }] }));
  };
  for (const strictTokenLimit of [true, false]) await callOpenAICompatibleAPI('https://example.test', 'test-key', 'claude-opus-5.5', 'Routstr', { messages: [{ role: 'user', content: 'Explain' }], maxTokens: 900, strictTokenLimit }, {}, { fetchImpl });
  expect(limits).toEqual([900, 16384]);
});
