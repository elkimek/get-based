import type { BrowserContext, Request as PlaywrightRequest } from '@playwright/test';

interface SyntheticReply {
  body: string;
  contentType: string;
}

/** Bind synthetic replies directly to the browser's fetch API. Test servers
 * also deny external connections so a missing fixture cannot reach a provider. */
export async function installSyntheticOpenRouter(
  context: BrowserContext,
  reply: (body: ReturnType<PlaywrightRequest['postDataJSON']>) => SyntheticReply | Promise<SyntheticReply>,
) {
  const binding = 'getbasedSyntheticOpenRouter';
  await context.exposeBinding(binding, (_source, requestBody: string) => reply(JSON.parse(requestBody)));
  await context.addInitScript(binding => {
    const nativeFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url !== 'https://openrouter.ai/api/v1/chat/completions') return nativeFetch(input, init);
      const request = new Request(input, init);
      request.signal.throwIfAborted();
      const fixture = Reflect.get(window, binding) as (value: string) => Promise<SyntheticReply>;
      const response = await fixture(await request.text());
      request.signal.throwIfAborted();
      return new Response(response.body, { headers: { 'Content-Type': response.contentType } });
    };
  }, binding);
}
