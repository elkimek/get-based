import { request as httpRequest } from 'node:http';
import { afterEach, expect, it, vi } from 'vitest';
import { createProfileShareServer } from '../server/profile-share-server.js';
const servers=[];
afterEach(async()=>{vi.unstubAllEnvs();for(const server of servers.splice(0)){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}});
async function fixture(handler = () => new Response('ok'), store = {}) {
 const {server}=createProfileShareServer({handler,store,maxRequestBytes:65536}); servers.push(server);
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 return {server,url:`http://127.0.0.1:${server.address().port}`};
}
it.each(['throw','reject'])('masks handler secrets on %s',async mode=>{
 const f=await fixture(()=>{if(mode==='throw')throw new Error('secret-value');return Promise.reject(new Error('secret-value'));});
 const response=await fetch(f.url+'/api/share');expect(response.status).toBe(500);expect(await response.json()).toEqual({error:'Profile sharing is temporarily unavailable.'});expect(response.headers.get('cache-control')).toBe('no-store');
});
it('returns a masked unhealthy response without invoking the share handler',async()=>{
 const handler=vi.fn();const f=await fixture(handler,{check:()=>{throw new Error('private database path');}});
 const response=await fetch(f.url+'/health');expect(response.status).toBe(500);expect(await response.text()).not.toContain('private');expect(handler).not.toHaveBeenCalled();
});
it.each(['GET','HEAD','DELETE'])('adapts empty %s requests and body-free responses',async method=>{
 const handler=vi.fn(request=>{expect(request.body).toBeNull();return new Response(null,{status:204});});const f=await fixture(handler);
 const response=await fetch(f.url+'/api/share',{method});expect(response.status).toBe(204);expect(await response.text()).toBe('');expect(handler).toHaveBeenCalledOnce();
});
it('accepts the exact body limit without truncation',async()=>{
 const handler=vi.fn(async request=>new Response(String((await request.arrayBuffer()).byteLength)));const f=await fixture(handler);
 const response=await fetch(f.url+'/api/share',{method:'POST',body:'x'.repeat(65536)});expect(await response.text()).toBe('65536');
});
it.each(['declared','chunked'])('rejects an oversized %s body without invoking the handler',async mode=>{
 const handler=vi.fn();const f=await fixture(handler);
 const result=await new Promise((resolve,reject)=>{
  const req=httpRequest(f.url+'/api/share',{method:'POST',headers:mode==='declared'?{'content-length':'65537'}:{}},res=>{let body='';res.on('data',c=>body+=c);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body}));});
  req.on('error',reject);req.write('x'.repeat(32768));req.write('x'.repeat(32769));req.end();
 });
 expect(result.status).toBe(413);expect(result.headers.connection).toBe('close');expect(result.body).toContain('too large');expect(handler).not.toHaveBeenCalled();
});
it('rejects invalid forwarded origins without dispatching the handler',async()=>{
 const handler=vi.fn();const f=await fixture(handler);const response=await fetch(f.url+'/api/share',{headers:{'x-forwarded-host':'['}});expect(response.status).toBe(500);expect(handler).not.toHaveBeenCalled();
});
it('preserves first forwarded origin and last forwarded client identity',async()=>{
 let captured;const f=await fixture(request=>{captured=request;return new Response('ok');});
 await fetch(f.url+'/api/share?id=fixture',{headers:{'x-forwarded-host':'first.test, second.test','x-forwarded-proto':'https, http','x-forwarded-for':'spoofed, ,198.51.100.4, '}});
 expect(captured.url).toBe('https://first.test/api/share?id=fixture');expect(captured.headers.get('x-forwarded-for')).toBe('198.51.100.4');
});
it('uses the socket identity when no forwarded address is provided',async()=>{
 let address;const f=await fixture(request=>{address=request.headers.get('x-forwarded-for');return new Response('ok');});await fetch(f.url+'/api/share');expect(address).toMatch(/127\.0\.0\.1/);
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
 await new Promise(resolve=>{
  const req=httpRequest(f.url+'/api/share',{method:'POST',headers:{'content-length':'1000'}});req.on('error',()=>{});req.on('close',resolve);
  req.flushHeaders();req.write('partial');setTimeout(()=>req.destroy(),10);
 });
 const response=await fetch(f.url+'/health');expect(response.status).toBe(200);expect(handler).not.toHaveBeenCalled();
});
