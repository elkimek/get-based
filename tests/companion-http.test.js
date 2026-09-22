import { EventEmitter } from 'node:events';
import { createServer } from 'node:http';
import { describe, expect, it, vi } from 'vitest';
import { createCompanionRequestHandler } from '../lib/companion-http.js';

function setup({ method = 'POST', url = '/v1/chat', headers = {}, chunks = [], response = new Response('ok'), handleRequest } = {}) {
  const incoming = Object.assign(new EventEmitter(), {
    method, url, headers, destroy: vi.fn(),
    async *[Symbol.asyncIterator]() { yield* chunks; },
  });
  const outgoing = Object.assign(new EventEmitter(), {
    headersSent: false, writableEnded: false, write: vi.fn(),
    writeHead: vi.fn(function () { this.headersSent = true; }),
    end: vi.fn(function () { this.writableEnded = true; }),
  });
  const service = handleRequest || vi.fn().mockResolvedValue(response);
  const getPort = vi.fn(() => 8325);
  const handler = createCompanionRequestHandler({ handleRequest: service, host: '127.0.0.1', getPort, maxRequestBytes: 8, maxImageRequestBytes: 16 });
  return { incoming, outgoing, service, run: () => handler(incoming, outgoing) };
}

describe('companion HTTP boundary', () => {
  it('preserves headers, body and the current fallback port', async () => {
    const f = setup({ headers: { authorization: 'Bearer local', 'x-multi': ['a', 'b'], ignored: undefined }, chunks: [Buffer.from('ab'), Buffer.from('cd')] });
    await f.run();
    const request = f.service.mock.calls[0][0];
    expect(request.url).toBe('http://127.0.0.1:8325/v1/chat');
    expect(request.headers.get('authorization')).toBe('Bearer local');
    expect(request.headers.get('x-multi')).toBe('a, b');
    expect(request.headers.has('ignored')).toBe(false);
    expect(await request.text()).toBe('abcd');
    expect(f.outgoing.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
    expect(Buffer.from(f.outgoing.write.mock.calls[0][0]).toString()).toBe('ok');
    expect(f.outgoing.end).toHaveBeenCalledOnce();
  });
  it.each(['GET', 'HEAD'])('%s never consumes an incoming body', async method => {
    const f = setup({ method, response: new Response(null, { status: 204 }) });
    f.incoming[Symbol.asyncIterator] = () => { throw new Error('unexpected read'); };
    await f.run();
    expect(f.service.mock.calls[0][0].body).toBeNull();
    expect(f.outgoing.write).not.toHaveBeenCalled();
    expect(f.outgoing.writeHead).toHaveBeenCalledWith(204, expect.any(Object));
    expect(f.outgoing.end).toHaveBeenCalledOnce();
  });
  it('rejects declared oversize before reading or invoking the service', async () => {
    const f = setup({ headers: { 'content-length': '9' } });
    f.incoming[Symbol.asyncIterator] = () => { throw new Error('unexpected read'); };
    await f.run();
    expect(f.service).not.toHaveBeenCalled();
    expect(f.outgoing.writeHead).toHaveBeenCalledWith(413, expect.any(Object));
    expect(f.incoming.destroy).toHaveBeenCalledOnce();
  });
  it.each([{}, { 'content-length': '1' }, { 'content-length': 'NaN' }])('enforces streamed size despite missing or misleading length %j', async headers => {
    const f = setup({ headers, chunks: ['12345', '6789'] });
    await f.run();
    expect(f.service).not.toHaveBeenCalled();
    expect(f.outgoing.end).toHaveBeenCalledWith('{"error":"request_too_large"}');
    expect(f.incoming.destroy).toHaveBeenCalledOnce();
  });
  it.each(['/v1/uploads', '/v1/uploads?source=chat'])('uses the image limit only for the upload path %s', async url => {
    const f = setup({ url, chunks: ['1234567890123456'] });
    await f.run();
    expect(f.service).toHaveBeenCalledOnce();
    expect(f.incoming.destroy).not.toHaveBeenCalled();
  });
  it('does not apply the image allowance to similar paths', async () => {
    const f = setup({ url: '/v1/uploads/other', chunks: ['123456789'] });
    await f.run();
    expect(f.service).not.toHaveBeenCalled();
  });
  it('accepts exactly the ordinary request limit', async () => {
    const f = setup({ chunks: ['12345678'] });
    await f.run();
    expect(f.service).toHaveBeenCalledOnce();
  });
  it.each(['aborted', 'close'])('propagates client %s to the service abort signal', async event => {
    let request, release;
    const f = setup({ handleRequest: vi.fn(async value => { request = value; return new Promise(resolve => { release = resolve; }); }) });
    const pending = f.run();
    await vi.waitFor(() => expect(request).toBeDefined());
    (event === 'aborted' ? f.incoming : f.outgoing).emit(event);
    expect(request.signal.aborted).toBe(true);
    release(new Response(null, { status: 204 }));
    await pending;
  });
  it('does not cancel successful requests on normal response close', async () => {
    const f = setup(); await f.run(); f.outgoing.emit('close');
    expect(f.service.mock.calls[0][0].signal.aborted).toBe(false);
  });
  it('masks internal service failures', async () => {
    const f = setup({ handleRequest: vi.fn().mockRejectedValue(new Error('private token')) });
    await f.run();
    expect(f.outgoing.writeHead).toHaveBeenCalledWith(500, expect.any(Object));
    expect(f.outgoing.end).toHaveBeenCalledWith('{"error":"internal_error"}');
  });
  it('does not rewrite headers when a response stream fails after starting', async () => {
    const f = setup({ response: new Response(new ReadableStream({ start(controller) { controller.error(new Error('private')); } })) });
    await f.run();
    expect(f.outgoing.writeHead).toHaveBeenCalledOnce();
    expect(f.outgoing.end).toHaveBeenCalledWith('{"error":"internal_error"}');
  });
});


it('serves a real loopback HTTP request through the extracted adapter', async () => {
  let port;
  const service = vi.fn(async request => new Response(await request.text(), {
    headers: { 'x-companion-test': request.headers.get('x-client-test') },
  }));
  const server = createServer(createCompanionRequestHandler({
    handleRequest: service, host: '127.0.0.1', getPort: () => port, maxRequestBytes: 8, maxImageRequestBytes: 16,
  }));
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    port = server.address().port;
    const response = await fetch(`http://127.0.0.1:${port}/v1/chat`, {
      method: 'POST', headers: { 'x-client-test': 'preserved' }, body: 'boundary',
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('x-companion-test')).toBe('preserved');
    expect(await response.text()).toBe('boundary');
    expect(service).toHaveBeenCalledOnce();
    const tooLarge = await fetch(`http://127.0.0.1:${port}/v1/chat`, { method: 'POST', body: 'too large' });
    expect(tooLarge.status).toBe(413);
    expect(await tooLarge.json()).toEqual({ error: 'request_too_large' });
    expect(service).toHaveBeenCalledOnce();
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
