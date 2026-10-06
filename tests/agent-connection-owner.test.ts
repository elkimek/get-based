import { afterEach, expect, it, vi } from 'vitest';
import { connectAgentHostCandidate, normalizeDiscoveredAgent } from '../js/agent-host-discovery.js';
function deferred<T>() { let resolve!: (value:T) => void; const promise=new Promise<T>(r => { resolve=r; }); return { resolve,promise }; }
const candidate=normalizeDiscoveredAgent({ id:'codex',endpoint:'http://127.0.0.1:8324',token:'SYNTHETIC-PRIVATE-TOKEN',compatible:true,status:'available' });
const response=() => Response.json({ service:'getbased-agent-host',protocolVersion:5,capabilities:['chat-stream'] });
afterEach(() => vi.unstubAllGlobals());
it('rejects stale discovery before publishing credentials and does not retry', async () => {
  let current=true; const pending=deferred<Response>(),onConnected=vi.fn(async () => {}); vi.stubGlobal('fetch',vi.fn(() => pending.promise));
  const connecting=connectAgentHostCandidate({ candidate,requiredCapabilities:['chat-stream'],attempts:2,normalizeEndpoint:value => value,onConnected,isCurrent:() => current });
  const rejection=expect(connecting).rejects.toThrow('superseded'); current=false; pending.resolve(response()); await rejection;
  expect(onConnected).not.toHaveBeenCalled(); expect(fetch).toHaveBeenCalledOnce();
});
it('lets already accepted credential persistence finish after the owner closes', async () => {
  let current=true; const pending=deferred<void>(),saved:unknown[]=[]; vi.stubGlobal('fetch',vi.fn(async () => response()));
  const onConnected=vi.fn(async (settings:unknown) => { await pending.promise; saved.push(settings); });
  const connecting=connectAgentHostCandidate({ candidate,requiredCapabilities:['chat-stream'],attempts:2,normalizeEndpoint:value => value,onConnected,isCurrent:() => current });
  await vi.waitFor(() => expect(onConnected).toHaveBeenCalledOnce()); current=false; pending.resolve();
  await expect(connecting).resolves.toMatchObject({ endpoint:candidate.endpoint,token:candidate.token }); expect(saved).toEqual([{ endpoint:candidate.endpoint,token:candidate.token }]); expect(fetch).toHaveBeenCalledOnce();
});
