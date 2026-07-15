import { expect, test } from './coverage-fixture.js';

function moduleUrl(path) {
  return `${path}?nostrChatContinuationCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function openBlankPage(page) {
  await page.route('**/nostr-chat-continuation-browser-coverage', route => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><html><body><main id="fixture"></main></body></html>',
  }));
  await page.goto('/nostr-chat-continuation-browser-coverage', { waitUntil: 'load' });
}

test('nostr discovery browser coverage handles relay parsing cache health and selected node guards', async ({ page }) => {
  await openBlankPage(page);

  const results = await page.evaluate(async ({ nostrUrl }) => {
    const nostr = await import(nostrUrl);
    const outcomes = {};
    const savedStorage = new Map(Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
      .filter(key => key !== null)
      .map(key => [key, localStorage.getItem(key)]));
    const originalWebSocket = window.WebSocket;
    const originalFetch = window.fetch;
    const originalWarn = console.warn;
    const originalDateNow = Date.now;

    let thrownError = null;
    const wsInstances = [];
    const fetchCalls = [];
    const warnings = [];

    class MockWebSocket {
      constructor(url) {
        this.url = String(url);
        this.sent = [];
        this.closed = false;
        wsInstances.push(this);
        setTimeout(() => this.openAndFlush(), 0);
      }

      send(payload) {
        this.sent.push(payload);
      }

      close() {
        this.closed = true;
        this.onclose?.();
      }

      openAndFlush() {
        this.onopen?.();
        if (this.url.includes('relay.routstr.com')) {
          this.onerror?.(new Error('relay unavailable'));
          return;
        }

        let subId = 'unknown';
        try {
          subId = JSON.parse(this.sent[0] || '[]')[1] || subId;
        } catch {}

        const emit = data => this.onmessage?.({ data: JSON.stringify(data) });
        if (this.url.includes('damus')) {
          emit(['EVENT', subId, {
            pubkey: 'pub-a-old',
            created_at: 10,
            content: '{"name":"Old Node"}',
            tags: [
              ['d', 'provider-a'],
              ['u', 'https://older.example'],
            ],
          }]);
          emit(['EOSE', subId]);
          return;
        }

        if (this.url.includes('nostr.band')) {
          emit(['EVENT', subId, {
            pubkey: 'pub-a-new',
            created_at: 20,
            content: '{"name":"Alpha <Node>","about":"Public Routstr node"}',
            tags: [
              ['d', 'provider-a'],
              ['u', 'https://node-a.example/base'],
              ['u', 'http://127.0.0.1:11434'],
              ['u', 'http://hidden.onion'],
              ['mint', 'https://mint.example'],
              ['version', '2.0.0'],
            ],
          }]);
          emit(['EVENT', subId, {
            pubkey: 'pub-b',
            created_at: 15,
            content: 'not-json',
            tags: [
              ['d', 'provider-b'],
              ['u', 'https://hidden.onion'],
            ],
          }]);
          emit(['EVENT', subId, {
            pubkey: 'pub-c',
            created_at: 12,
            content: '{}',
            tags: [
              ['d', 'provider-c'],
              ['u', 'http://localhost:11434'],
            ],
          }]);
          emit(['EOSE', subId]);
          return;
        }

        if (this.url.includes('nos.lol')) {
          this.onmessage?.({ data: '{bad json' });
          emit(['EOSE', subId]);
        }
      }
    }

    try {
      window.WebSocket = MockWebSocket;
      window.fetch = async (url) => {
        fetchCalls.push(String(url));
        if (String(url).includes('node-a.example')) {
          return new Response(JSON.stringify({
            data: [
              { id: 'model-a', name: 'Model A' },
              { id: 'model-disabled', enabled: false },
              { id: 'model-b' },
              { name: 'missing-id' },
            ],
          }), { status: 200, headers: { 'content-type': 'application/json' } });
        }
        return new Response('offline', { status: 503 });
      };
      console.warn = (...args) => warnings.push(args.join(' '));

      nostr.clearNodeCache();
      const nodes = await nostr.discoverNodes(true);
      const alpha = nodes.find(node => node.id === 'provider-a');
      const onionUrlSkipped = nodes.find(node => node.id === 'provider-b');
      const noPublicUrl = nodes.find(node => node.id === 'provider-c');

      outcomes.discoveryApiStaysModuleOnly = !('nostrDiscoverNodes' in window)
        && !('nostrGetSelectedNode' in window)
        && !('nostrSetSelectedNode' in window)
        && !('nostrClearNodeCache' in window);

      outcomes.relaysSendKindRequestAndResolveOnEose = wsInstances.length === 4
        && wsInstances.some(ws => {
          const sent = JSON.parse(ws.sent[0] || '[]');
          return sent[0] === 'REQ' && sent[2]?.kinds?.[0] === 38421 && sent[2]?.limit === 50;
        });

      outcomes.eventsDeduplicateAndParseMetadata = alpha?.pubkey === 'pub-a-new'
        && alpha.name === 'Alpha <Node>'
        && alpha.about === 'Public Routstr node'
        && alpha.mints[0] === 'https://mint.example'
        && alpha.version === '2.0.0'
        && alpha.onion === 'http://hidden.onion'
        && alpha.urls.length === 1
        && alpha.urls[0] === 'https://node-a.example/base';

      outcomes.healthCheckMarksOnlineModelsAndSortsFirst = nodes[0]?.id === 'provider-a'
        && alpha.online === true
        && alpha.modelCount === 2
        && alpha.models.some(model => model.id === 'model-a' && model.name === 'Model A')
        && alpha.models.some(model => model.id === 'model-b' && model.name === 'model-b')
        && fetchCalls[0] === 'https://node-a.example/base/v1/models';

      outcomes.healthCheckSkipsUnsafeOrMissingFetchTargets = onionUrlSkipped?.online === false
        && onionUrlSkipped?.urls[0] === 'https://hidden.onion'
        && noPublicUrl?.online === false
        && fetchCalls.length === 1;

      const relayCountAfterFirstDiscovery = wsInstances.length;
      const cached = await nostr.discoverNodes(false);
      outcomes.cacheReturnsSameNodesWithoutRelayQueries = cached === nodes
        && wsInstances.length === relayCountAfterFirstDiscovery;

      const frozenNow = 1_700_000_000_000;
      Date.now = () => frozenNow;
      localStorage.setItem('labcharts-routstr-session-updated-at', String(frozenNow + 1));
      nostr.setSelectedNodeUrl('https://node-a.example/base');
      nostr.setSelectedNodeUrl('http://127.0.0.1:11434');
      outcomes.selectedNodePersistsValidAndRejectsPrivateUrl = nostr.getSelectedNodeUrl() === 'https://node-a.example/base'
        && warnings.some(message => message.includes('Refusing Routstr node URL'));
      outcomes.selectedNodeKeepsSessionClockMonotonic = localStorage.getItem('labcharts-routstr-session-updated-at') === String(frozenNow + 2);
    } catch (error) {
      thrownError = error;
    } finally {
      window.WebSocket = originalWebSocket;
      window.fetch = originalFetch;
      console.warn = originalWarn;
      Date.now = originalDateNow;
      nostr.clearNodeCache();
      localStorage.clear();
      for (const [key, value] of savedStorage) {
        if (value != null) localStorage.setItem(key, value);
      }
    }

    if (thrownError) throw thrownError;
    return outcomes;
  }, {
    nostrUrl: moduleUrl('/js/nostr-discovery.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('chat continuation browser coverage handles truncation heuristics streaming continuation and usage merge', async ({ page }) => {
  await openBlankPage(page);

  const results = await page.evaluate(async ({ continuationUrl }) => {
    const continuation = await import(continuationUrl);
    const outcomes = {};
    const savedStorage = new Map(Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
      .filter(key => key !== null)
      .map(key => [key, localStorage.getItem(key)]));
    const originalFetch = window.fetch;
    const originalGetOllamaConfig = window.getOllamaConfig;

    let thrownError = null;
    const fetchBodies = [];
    const streamed = [];

    const streamResponse = (events) => {
      const encoder = new TextEncoder();
      return new Response(new ReadableStream({
        start(controller) {
          for (const event of events) controller.enqueue(encoder.encode(event));
          controller.close();
        },
      }), {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      });
    };

    try {
      outcomes.limitNoteMarkupIsStable = continuation.responseLimitNote()
        === '<div class="chat-stopped-note">[output limit reached - ask "continue" to finish]</div>';

      outcomes.truncationReasonVariantsAreDetected =
        continuation.isAIResponseTruncated({ truncated: true }) === true
        && continuation.isAIResponseTruncated({ finishReason: 'length' }) === true
        && continuation.isAIResponseTruncated({ finishReason: 'max_completion_tokens' }) === true
        && continuation.isAIResponseTruncated({ finishReason: 'provider_token_limit' }) === true
        && continuation.isAIResponseTruncated({ finishReason: 'stop' }) === false;

      outcomes.incompleteHeuristicsCoverLongTailCases =
        continuation.isLikelyIncompleteResponse('short and') === false
        && continuation.isLikelyIncompleteResponse(`${'x'.repeat(520)} and`) === true
        && continuation.isLikelyIncompleteResponse(`${'x'.repeat(520)}:`) === true
        && continuation.isLikelyIncompleteResponse(`${'x'.repeat(520)}\n## Next`) === true
        && continuation.isLikelyIncompleteResponse(`${'x'.repeat(520)}.`) === false
        && continuation.isLikelyIncompleteResponse(`${'x'.repeat(520)}\n\`\`\``) === false;

      outcomes.shouldAutoContinueCombinesSignals =
        continuation.shouldAutoContinueResponse({ finishReason: 'max_tokens' }, 'done.') === true
        && continuation.shouldAutoContinueResponse({ finishReason: 'stop' }, `${'x'.repeat(520)} because`) === true
        && continuation.shouldAutoContinueResponse({ finishReason: 'stop' }, 'done.') === false;

      // api.js reads this stub for the base URL; getOllamaMainModel reads
      // localStorage first, so set both to keep the local-provider path stable.
      window.getOllamaConfig = () => ({ url: 'http://ollama.test', model: 'coverage-model', apiKey: '' });
      localStorage.setItem('labcharts-ai-provider', 'ollama');
      localStorage.setItem('labcharts-ollama-model', 'coverage-model');

      window.fetch = async (url, options = {}) => {
        fetchBodies.push(JSON.parse(String(options.body || '{}')));
        if (fetchBodies.length === 1) {
          return streamResponse([
            'data: {"choices":[{"delta":{"content":"First part "}}]}\n\n',
            'data: {"choices":[{"delta":{},"finish_reason":"length"}],"usage":{"prompt_tokens":3,"completion_tokens":5}}\n\n',
            'data: [DONE]\n\n',
          ]);
        }
        return streamResponse([
          'data: {"choices":[{"delta":{"content":"continued."}}]}\n\n',
          'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":7,"completion_tokens":11}}\n\n',
          'data: [DONE]\n\n',
        ]);
      };

      const result = await continuation.callChatAPIWithContinuation({
        system: 'System prompt.',
        messages: [{ role: 'user', content: 'Tell me more.' }],
        maxTokens: 12,
        provider: 'ollama',
        onStream(fullText) {
          streamed.push(fullText);
        },
      });

      outcomes.streamingContinuationMergesTextUsageAndPrompts = result.text === 'First part continued.'
        && result.continued === 1
        && result.truncated === false
        && result.usage.inputTokens === 10
        && result.usage.outputTokens === 16
        && fetchBodies.length === 2
        && fetchBodies[0].stream === true
        && fetchBodies[0].max_tokens === 12
        && fetchBodies[0].messages.some(message => message.role === 'system' && message.content === 'System prompt.')
        && fetchBodies[1].messages.some(message => message.role === 'assistant' && message.content === 'First part ')
        && fetchBodies[1].messages.some(message => message.role === 'user' && message.content.includes('Continue exactly where you stopped'))
        && streamed.includes('First part ')
        && streamed.includes('First part continued.');
    } catch (error) {
      thrownError = error;
    } finally {
      window.fetch = originalFetch;
      if (originalGetOllamaConfig) window.getOllamaConfig = originalGetOllamaConfig;
      else delete window.getOllamaConfig;
      localStorage.clear();
      for (const [key, value] of savedStorage) {
        if (value != null) localStorage.setItem(key, value);
      }
    }

    if (thrownError) throw thrownError;
    return outcomes;
  }, {
    continuationUrl: moduleUrl('/js/chat-continuation.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});
