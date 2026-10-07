import type { BrowserContext, Page } from '@playwright/test';
/** Returning-user consent and a locally configured provider; no network AI calls are fabricated here. */
export async function installDiscussionFixture(context: BrowserContext): Promise<void> {
  await context.addInitScript({ path: 'node_modules/axe-core/axe.min.js' });
  await context.addInitScript(() => {
    if (!['http:', 'https:'].includes(location.protocol)) return;
    for (const key of ['emptyTour', 'tour']) localStorage.setItem(`labcharts-default-${key}`, 'completed');
    localStorage.setItem('labcharts-analytics-consent-seen', '1');
    localStorage.setItem('labcharts-ai-provider', 'ollama'); localStorage.setItem('labcharts-ai-paused', 'false');
    localStorage.setItem('labcharts-encryption-nudge-dismissed', 'true');
    localStorage.setItem('labcharts-legal-acceptance', JSON.stringify({ accepted: true, termsVersion: '2026-08-22', privacyVersion: '2026-08-22', policyScope: 'self-hosted-notice', acceptedAt: '2026-10-07T00:00:00Z', appVersion: 'test', location: 'local-test' }));
    localStorage.setItem('labcharts-ai-transparency-acknowledgement', JSON.stringify({ version: '2026-08-31', acknowledged: true }));
  });
}

export async function installDiscussionProvider(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    if (!['http:', 'https:'].includes(location.protocol)) return;
    localStorage.setItem('labcharts-ollama', JSON.stringify({ url: 'http://127.0.0.1:11434', model: 'fixture-model', mode: 'ollama' }));
    const requests: unknown[] = []; Object.assign(window, { discussionRequests: requests });
    const original = window.fetch.bind(window);
    window.fetch = async (input, options) => {
      const url = String(input instanceof Request ? input.url : input);
      if (!/^http:\/\/(?:127\.0\.0\.1|localhost):11434\//.test(url)) return original(input, options);
      if (url.endsWith('/api/chat')) {
        requests.push(JSON.parse(String(options?.body || '{}')));
        return new Response(JSON.stringify({ message: { role: 'assistant', content: 'Synthetic discussion reply.' }, done: true, prompt_eval_count: 12, eval_count: 5 }) + '\n', { headers: { 'Content-Type': 'application/x-ndjson' } });
      }
      if (url.endsWith('/v1/chat/completions')) {
        requests.push(JSON.parse(String(options?.body || '{}')));
        const events = [
          { choices: [{ delta: { content: 'Synthetic discussion reply.' }, finish_reason: null }] },
          { choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 12, completion_tokens: 5 } },
        ];
        return new Response(events.map(event => 'data: ' + JSON.stringify(event) + '\n\n').join('') + 'data: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
      }
      if (url.endsWith('/v1/models')) return Response.json({ data: [{ id: 'fixture-model' }] });
      if (url.endsWith('/api/tags') || url.endsWith('/api/ps')) return Response.json({ models: [{ name: 'fixture-model' }] });
      return new Response('Not found', { status: 404 });
    };
  });
}

/** Module coverage starts with an actual open, nonempty conversation on every layout. */
export async function openDiscussionFixturePanel(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await (await import('/js/chat-loader.js')).openChatPanel();
    const { state } = await import('/js/state.js');
    state.chatHistory = [{ role: 'assistant', content: 'Discussion fixture' }];
    (await import('/js/chat-render.js')).renderChatMessages();
  });
}
