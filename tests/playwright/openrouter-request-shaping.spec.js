import { expect, test } from './coverage-fixture.js';

const sonnet = { id: 'anthropic/claude-sonnet-5', supported_parameters: ['reasoning', 'response_format', 'structured_outputs'],
  reasoning: { mandatory: false, default_enabled: true, supported_efforts: ['high', 'medium', 'low'] } };
const grok = { id: 'x-ai/grok-4.3', name: 'Grok 4.3', supported_parameters: ['reasoning', 'temperature', 'response_format'],
  reasoning: { mandatory: false, default_enabled: true, supported_efforts: ['high', 'medium', 'low', 'none'] } };
const lab = { testType: 'blood', date: '2026-09-01', markers: [
  { rawName: 'Glucose', value: 5.2, mappedKey: 'biochemistry.glucose', unit: 'mmol/l', refMin: 3.9, refMax: 5.6 },
] };

for (const coldCache of [false, true]) {
  test(`Sonnet structured import and benchmark work with ${coldCache ? 'missing' : 'cached'} capabilities`, async ({ page }) => {
    const bodies = [];
    let catalogLookups = 0;
    await page.route('https://openrouter.ai/api/v1/models', async route => {
      catalogLookups++;
      await route.fulfill({ json: { data: [sonnet] } });
    });
    await page.route('https://openrouter.ai/api/v1/chat/completions', async route => {
      const body = route.request().postDataJSON();
      bodies.push(body);
      if (body.temperature !== undefined || body.reasoning?.effort === 'none') {
        await route.fulfill({ status: 404, json: { error: { message: 'No endpoints found that can handle the requested parameters.' } } });
        return;
      }
      if (!body.stream) {
        await route.fulfill({ json: { choices: [{ message: { content: JSON.stringify(lab) }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 40, completion_tokens: 30 } } });
        return;
      }
      await route.fulfill({ contentType: 'text/event-stream', body:
        `data: ${JSON.stringify({ choices: [{ delta: { content: JSON.stringify(lab) }, finish_reason: null }] })}\n\n`
        + 'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":40,"completion_tokens":30}}\n\n'
        + 'data: [DONE]\n\n',
      });
    });
    await page.goto('/app', { waitUntil: 'load' });
    const parsed = await page.evaluate(async ({ model, coldCache }) => {
      const api = await import('/js/api.js');
      const { updateKeyCache } = await import('/js/crypto.js');
      const consent = await import('/js/cloud-ai-consent.js');
      const { parseLabPDFWithAI } = await import('/js/pdf-import.js');
      api.setAIProvider('openrouter');
      api.setOpenRouterModel(model.id);
      localStorage.setItem('labcharts-ai-paused', 'false');
      localStorage.setItem('labcharts-openrouter-models', JSON.stringify(coldCache ? [] : [model]));
      updateKeyCache('labcharts-openrouter-key', 'synthetic-test-key');
      localStorage.setItem(consent.CLOUD_AI_CONSENT_KEY, JSON.stringify({
        version: consent.CLOUD_AI_CONSENT_VERSION, approvals: { openrouter: { accepted: true } },
      }));
      const progress = [];
      const input = 'Synthetic report. Collected 2026-09-01. Glucose 5.2 mmol/l (3.9-5.6).';
      const imported = await parseLabPDFWithAI(input, 'synthetic.pdf', value => progress.push(value));
      const benchmark = await parseLabPDFWithAI(input, 'synthetic.csv', undefined, {
        captureRawModelOutput: true, deterministicBenchmark: true,
      });
      return { imported, benchmark, progress };
    }, { model: sonnet, coldCache });
    expect(parsed.imported.markers).toEqual(expect.arrayContaining([expect.objectContaining({ value: 5.2 })]));
    expect(parsed.imported.date).toBe('2026-09-01');
    expect(parsed.benchmark.benchmarkRawModelResult.markers[0].value).toBe(5.2);
    expect(parsed.progress.length).toBeGreaterThan(0);
    expect(bodies).toHaveLength(coldCache ? 3 : 2);
    expect(catalogLookups).toBe(coldCache ? 1 : 0);
    expect(bodies.at(-2).stream).toBe(true);
    expect(bodies.at(-1)).not.toHaveProperty('stream');
    for (const body of bodies.slice(coldCache ? 1 : 0)) {
      expect(body.reasoning).toEqual({ effort: 'low' });
      expect(body).not.toHaveProperty('temperature');
      expect(body.provider.require_parameters).toBe(true);
      expect(body.response_format.type).toBe('json_schema');
      expect(body.response_format.json_schema.schema.properties).toHaveProperty('markers');
    }
  });
}

test('chat Off selection reaches OpenRouter unchanged for a default-on model', async ({ page }) => {
  let outgoing;
  await page.route('https://openrouter.ai/api/v1/chat/completions', async route => {
    outgoing = route.request().postDataJSON();
    await route.fulfill({ json: { choices: [{ message: { content: 'synthetic answer' }, finish_reason: 'stop' }] } });
  });
  await page.goto('/app', { waitUntil: 'load' });
  await page.evaluate(async model => {
    const api = await import('/js/api.js');
    api.setAIProvider('openrouter');
    api.setOpenRouterModel(model.id);
    localStorage.setItem('labcharts-openrouter-models', JSON.stringify([model]));
    (await import('/js/crypto.js')).updateKeyCache('labcharts-openrouter-key', 'synthetic-test-key');
    await (await import('/js/chat-panel.js')).openChatPanel();
  }, grok);
  await page.locator('#chat-model-menu-toggle').click();
  await page.locator('#chat-model-effort').fill('1');
  await expect(page.locator('#chat-model-effort-value')).toHaveText('Off');
  const result = await page.evaluate(async () => {
    const { getDirectChatReasoningEffort } = await import('/js/chat-model-preferences.js');
    const { callOpenRouterAPI } = await import('/js/api-openrouter.js');
    return callOpenRouterAPI({ messages: [{ role: 'user', content: 'synthetic request' }], temperature: 0,
      reasoningEffort: getDirectChatReasoningEffort('openrouter', 'x-ai/grok-4.3') });
  });
  expect(result.text).toBe('synthetic answer');
  expect(outgoing.reasoning).toEqual({ effort: 'none' });
  expect(outgoing.temperature).toBe(0);
});
