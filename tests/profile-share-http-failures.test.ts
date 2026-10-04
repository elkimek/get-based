import type { Server, IncomingHttpHeaders } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { ProfileShareHandler } from '../lib/profile-share-service.js';
import type { ServerOptions } from '../server/profile-share-server.js';
import { request as httpRequest } from 'node:http';
import { afterEach, expect, it, vi } from 'vitest';
import { createProfileShareServer } from '../server/profile-share-server.js';
const servers: Server[]=[];
afterEach(async()=>{vi.unstubAllEnvs();for(const server of servers.splice(0)){server.closeAllConnections();await new Promise<Error | undefined>(resolve=>server.close(resolve));}});
async function fixture(handler: ProfileShareHandler = () => new Response('ok'), store: ServerOptions['store'] = {} as NonNullable<ServerOptions['store']>) {
 const {server}=createProfileShareServer({handler,store,maxRequestBytes:65536}); servers.push(server);
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 return {server,url:`http://127.0.0.1:${(server.address() as AddressInfo).port}`};
}
it.each(['throw','reject'])('masks handler secrets on %s',async mode=>{
 const f=await fixture(()=>{if(mode==='throw')throw new Error('secret-value');return Promise.reject(new Error('secret-value'));});
 const response=await fetch(f.url+'/api/share');expect(response.status).toBe(500);expect(await response.json()).toEqual({error:'Profile sharing is temporarily unavailable.'});expect(response.headers.get('cache-control')).toBe('no-store');
});
it('returns a masked unhealthy response without invoking the share handler',async()=>{
 const handler=vi.fn();const f=await fixture(handler,{check:()=>{throw new Error('private database path');}} as unknown as NonNullable<ServerOptions['store']>);
 const response=await fetch(f.url+'/health');expect(response.status).toBe(500);expect(await response.text()).not.toContain('private');expect(handler).not.toHaveBeenCalled();
});
it.each(['GET','HEAD','DELETE'])('adapts empty %s requests and body-free responses',async method=>{
 const handler=vi.fn((request: Request)=>{expect(request.body).toBeNull();return new Response(null,{status:204});});const f=await fixture(handler);
 const response=await fetch(f.url+'/api/share',{method});expect(response.status).toBe(204);expect(await response.text()).toBe('');expect(handler).toHaveBeenCalledOnce();
});
it('accepts the exact body limit without truncation',async()=>{
 const handler=vi.fn(async (request: Request)=>new Response(String((await request.arrayBuffer()).byteLength)));const f=await fixture(handler);
 const response=await fetch(f.url+'/api/share',{method:'POST',body:'x'.repeat(65536)});expect(await response.text()).toBe('65536');
});
it.each(['declared','chunked'])('rejects an oversized %s body without invoking the handler',async mode=>{
 const handler=vi.fn();const f=await fixture(handler);
 const result=await new Promise<{status: number | undefined; headers: IncomingHttpHeaders; body: string}>((resolve,reject)=>{
  const req=httpRequest(f.url+'/api/share',{method:'POST',headers:mode==='declared'?{'content-length':'65537'}:{}},res=>{let body='';res.on('data',c=>body+=c);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body}));});
  req.on('error',reject);req.write('x'.repeat(32768));req.write('x'.repeat(32769));req.end();
 });
 expect(result.status).toBe(413);expect(result.headers.connection).toBe('close');expect(result.body).toContain('too large');expect(handler).not.toHaveBeenCalled();
});
it('rejects invalid forwarded origins without dispatching the handler',async()=>{
 const handler=vi.fn();const f=await fixture(handler);const response=await fetch(f.url+'/api/share',{headers:{'x-forwarded-host':'['}});expect(response.status).toBe(500);expect(handler).not.toHaveBeenCalled();
});
it('preserves first forwarded origin and last forwarded client identity',async()=>{
 let captured: Request | undefined;const f=await fixture(request=>{captured=request;return new Response('ok');});
 await fetch(f.url+'/api/share?id=fixture',{headers:{'x-forwarded-host':'first.test, second.test','x-forwarded-proto':'https, http','x-forwarded-for':'spoofed, ,198.51.100.4, '}});
 expect(captured!.url).toBe('https://first.test/api/share?id=fixture');expect(captured!.headers.get('x-forwarded-for')).toBe('198.51.100.4');
});
it('uses the socket identity when no forwarded address is provided',async()=>{
 let address: string | null | undefined;const f=await fixture(request=>{address=request.headers.get('x-forwarded-for');return new Response('ok');});await fetch(f.url+'/api/share');expect(address).toMatch(/127\.0\.0\.1/);
});
it('masks failed response-body reads and retains privacy headers',async()=>{
 const f=await fixture(()=>new Response(new ReadableStream({start(controller){controller.error(new Error('private body'));}})));
 const response=await fetch(f.url+'/api/share');expect(response.status).toBe(500);expect(response.headers.get('x-content-type-options')).toBe('nosniff');expect(response.headers.get('referrer-policy')).toBe('no-referrer');expect(await response.text()).not.toContain('private body');
});
it.each(['999','30001','bogus','1000'])('bounds request timeout configuration %s',async value=>{
 vi.stubEnv('PROFILE_SHARE_REQUEST_TIMEOUT_MS',value);const f=await fixture();expect(f.server.requestTimeout).toBe(value==='1000'?1000:30000);
});
it('discards a disconnected partial request and remains healthy',async()=>{
 const handler=vi.fn();const f=await fixture(handler);
 await new Promise<void>(resolve=>{
  const req=httpRequest(f.url+'/api/share',{method:'POST',headers:{'content-length':'1000'}});req.on('error',()=>{});req.on('close',resolve);
  req.flushHeaders();req.write('partial');setTimeout(()=>req.destroy(),10);
 });
 const response=await fetch(f.url+'/health');expect(response.status).toBe(200);expect(handler).not.toHaveBeenCalled();
});


it('preserves multi-value request headers without restoring spoofed identity headers', async () => {
  let captured: Request | undefined;
  const f = await fixture(request => { captured = request; return new Response('ok'); });
  const status = await new Promise<number | undefined>((resolve, reject) => {
    const request = httpRequest(f.url + '/api/share', { headers: {
      'set-cookie': ['first=one', 'second=two'], 'x-real-ip': 'spoofed-client',
    } }, response => { response.resume(); response.on('end', () => resolve(response.statusCode)); });
    request.on('error', reject); request.end();
  });
  expect(status).toBe(200);
  expect(captured!.headers.get('set-cookie')).toBe('first=one, second=two');
  expect(captured!.headers.has('x-real-ip')).toBe(false);
  expect(captured!.headers.get('x-forwarded-for')).toMatch(/127\.0\.0\.1/);
});

it('terminates an already-started response without appending a private handler error', async () => {
  const f = await fixture(() => { throw new Error('private handler details'); });
  const flush = (_request: import('node:http').IncomingMessage, response: import('node:http').ServerResponse) => response.flushHeaders();
  f.server.on('request', flush);
  await expect(fetch(f.url + '/api/share').then(response => response.text())).rejects.toThrow();
  f.server.removeListener('request', flush);
  expect((await fetch(f.url + '/health')).status).toBe(200);
});
