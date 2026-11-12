import type {BrowserContext} from '@playwright/test';
export interface ControlledModelRequest {
  model: string;
  tools?: Array<{function: {name: string; parameters: {properties: {resource: {enum: string[]}}}}}>;
  messages: Array<{role: string; content: string}>;
}
interface ControlledModelReply {contentType: string; body: string}
/** Only the synthetic model is replaced. All application, Worker, storage and SW code stays real. */
export async function installControlledOpenRouter(context: BrowserContext, reply: (body: ControlledModelRequest) => Promise<ControlledModelReply>) {
  await context.exposeBinding('__getbasedControlledModel', async (_source, body: ControlledModelRequest) => {
    if (!body || !Array.isArray(body.messages) || body.messages.length === 0) throw new Error('Controlled model requires messages.');
    return reply(body);
  });
  await context.addInitScript(() => {
    const nativeFetch = globalThis.fetch.bind(globalThis);
    globalThis.fetch = async (input, init) => {
      const url = typeof input === 'string' ? new URL(input, location.href).href : input instanceof URL ? input.href : input.url;
      if (url !== 'https://openrouter.ai/api/v1/chat/completions') return nativeFetch(input, init);
      const request = new Request(input, init);
      if (request.method !== 'POST') throw new Error('Controlled model requires POST.');
      if (request.signal.aborted) throw new DOMException('Aborted', 'AbortError');
      const model = (globalThis as unknown as {__getbasedControlledModel(body: unknown): Promise<{contentType: string; body: string}>}).__getbasedControlledModel;
      const response = await model(await request.json());
      if (request.signal.aborted) throw new DOMException('Aborted', 'AbortError');
      return new Response(response.body, {status: 200, headers: {'Content-Type': response.contentType}});
    };
  });
  // Fail closed if any application path escapes the narrow in-page fixture.
  await context.route('https://openrouter.ai/**', route => route.abort('blockedbyclient'));
}
