import type { BrowserContext, Page } from '@playwright/test';
interface DiscussionFixtureOptions { provider?: 'ollama' | 'openrouter' | 'custom'; paused?: boolean; }
/** Returning-user consent with configurable AI state; no network AI replies are fabricated here. */
export async function installDiscussionFixture(context: BrowserContext, {provider = 'ollama', paused = false}: DiscussionFixtureOptions = {}): Promise<void> {
  await context.addInitScript({ path: 'node_modules/axe-core/axe.min.js' });
  await context.addInitScript(({provider, paused}) => {
    if (!['http:', 'https:'].includes(location.protocol)) return;
    for (const key of ['emptyTour', 'tour']) localStorage.setItem(`labcharts-default-${key}`, 'completed');
    localStorage.setItem('labcharts-analytics-consent-seen', '1');
    localStorage.setItem('labcharts-ai-provider', provider); localStorage.setItem('labcharts-ai-paused', String(paused));
    localStorage.setItem('labcharts-encryption-nudge-dismissed', 'true');
    localStorage.setItem('labcharts-legal-acceptance', JSON.stringify({ accepted: true, termsVersion: '2026-08-22', privacyVersion: '2026-08-22', policyScope: 'self-hosted-notice', acceptedAt: '2026-10-07T00:00:00Z', appVersion: 'test', location: 'local-test' }));
    localStorage.setItem('labcharts-ai-transparency-acknowledgement', JSON.stringify({ version: '2026-08-31', acknowledged: true }));
  }, {provider, paused});
}

interface DiscussionProviderFixtureOptions { seedProvider?: boolean; replyMode?: 'discussion' | 'context-health'; }
export async function installDiscussionProvider(context: BrowserContext, {seedProvider = true, replyMode = 'discussion'}: DiscussionProviderFixtureOptions = {}): Promise<void> {
  if (replyMode !== 'discussion' && replyMode !== 'context-health') throw new Error('Unknown discussion provider fixture reply mode');
  await context.addInitScript(({seedProvider, replyMode}) => {
    if (!['http:', 'https:'].includes(location.protocol)) return;
    if (seedProvider) localStorage.setItem('labcharts-ollama', JSON.stringify({ url: 'http://127.0.0.1:11434', model: 'fixture-model', mode: 'ollama' }));
    const requests: unknown[] = []; Object.assign(window, { discussionRequests: requests });
    if (replyMode === 'context-health') Reflect.set(window, 'contextHealthRequests', 0);
    const original = window.fetch.bind(window);
    window.fetch = async (input, options) => {
      const url = String(input instanceof Request ? input.url : input);
      if (replyMode === 'context-health' && /^http:\/\/(?:127\.0\.0\.1|localhost):11434\//.test(url) && /\/(?:v1\/chat\/completions|api\/chat)$/.test(url)
        && String(options?.body || '').includes('Dot colors:')) {
        Reflect.set(window, 'contextHealthRequests', Number(Reflect.get(window, 'contextHealthRequests')) + 1);
        const content = JSON.stringify({ diet: { summary: 'Reported eggs', dot: 'yellow', tip: 'Literal <tip> & cached' } });
        if (url.endsWith('/api/chat')) return new Response(JSON.stringify({ message: { content }, done: true, prompt_eval_count: 7, eval_count: 3 }) + '\n', { headers: { 'Content-Type': 'application/x-ndjson' } });
        return Response.json({ choices: [{ message: { content } }], usage: { prompt_tokens: 7, completion_tokens: 3 } });
      }
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
  }, {seedProvider, replyMode});
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
