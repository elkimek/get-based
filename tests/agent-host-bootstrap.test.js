import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ server: null, signals: {}, clients: [], adapters: null, runtime: null,
  storage: vi.fn(), detect: vi.fn(), rm: vi.fn(), recover: vi.fn(), service: vi.fn(), http: vi.fn(),
  codex: vi.fn(), acp: vi.fn(), claude: vi.fn(), openclaw: vi.fn(), hermes: vi.fn(), controller: vi.fn(),
}));
vi.mock('node:http', () => ({ createServer: () => m.server }));
vi.mock('node:fs', () => ({ mkdtempSync: () => '/fixture/workspace', rmSync: m.rm }));
vi.mock('../lib/agent-host-storage.js', () => ({ prepareAgentHostStorage: m.storage }));
vi.mock('../lib/local-agent-registry.js', () => ({ detectLocalAgents: m.detect, buildLocalAgentEnvironment: env => ({ ...env, FIXTURE: 'yes' }) }));
vi.mock('../lib/codex-agent-isolation.js', () => ({ buildIsolatedCodexArgs: () => ['isolated'], buildIsolatedCodexEnvironment: () => ({ CODEX_HOME: '/fixture/codex' }) }));
vi.mock('../lib/codex-app-server-client.js', () => ({ CodexAppServerClient: m.codex }));
vi.mock('../lib/acp-agent-client.js', () => ({ ACPAgentClient: m.acp }));
vi.mock('../lib/claude-agent-client.js', () => ({ ClaudeAgentClient: m.claude }));
vi.mock('../lib/openclaw-agent-client.js', () => ({ OpenClawAgentClient: m.openclaw }));
vi.mock('../lib/hermes-gateway-client.js', () => ({ createHermesGatewayRouteProvider: m.hermes }));
vi.mock('../lib/companion-http.js', () => ({ createCompanionRequestHandler: m.http }));
vi.mock('../lib/agent-host-service.js', () => ({ createAgentHostService: m.service }));
vi.mock('../lib/companion-runtime-control.js', () => ({ createCompanionRuntimeController: m.controller }));
vi.mock('../lib/companion-listener.js', () => ({ recoverCompanionListener: m.recover }));
const agent = (protocol = 'acp', extra = {}) => ({ id: protocol, protocol, command: '/fixture/agent', args: ['fixture'], status: 'available', compatible: true, ...extra });
const boot = () => import('../server/agent-host-server.js');
beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks(); m.clients = []; m.signals = {};
  m.server = Object.assign(new EventEmitter(), { listening: false, listen: vi.fn(), close: vi.fn(callback => { m.server.listening = false; callback?.(); }) });
  m.storage.mockReturnValue({ codexHome: '/fixture/codex', token: 'secret-token', codexAuthenticated: true, dataDirectory: '/fixture/state' });
  m.detect.mockReturnValue([agent()]);
  for(const ctor of [m.codex,m.acp,m.claude,m.openclaw,m.hermes]) ctor.mockImplementation(function () { const client = { close: vi.fn().mockResolvedValue(), restart: vi.fn().mockResolvedValue() }; m.clients.push(client); return client; });
  m.service.mockImplementation(options => { m.adapters = options; return { handleRequest: vi.fn().mockResolvedValue(new Response('ok')) }; });
  m.controller.mockImplementation(options => { m.runtime = options; return { getInfo: vi.fn(), handle: vi.fn() }; });
  m.http.mockImplementation(options => options);
  m.recover.mockResolvedValue(8324);
  for(const key of ['GETBASED_AGENT_HOST_PORT','GETBASED_AGENT_HOST_STRICT_PORT','GETBASED_AGENT_HOST_ALLOWED_ORIGINS','GETBASED_COMPANION_SERVICE']) vi.stubEnv(key,'');
  vi.spyOn(process.stdout,'write').mockReturnValue(true); vi.spyOn(process.stderr,'write').mockReturnValue(true);
  vi.spyOn(process,'exit').mockImplementation(code => { throw new Error(`exit:${code}`); });
  const once = process.once.bind(process);
  vi.spyOn(process,'once').mockImplementation((event, listener) => { if(['SIGINT','SIGTERM'].includes(event)) { m.signals[event] = listener; return process; } return once(event,listener); });
});
afterEach(() => { process.exitCode = 0; vi.restoreAllMocks(); vi.unstubAllEnvs(); });
it.each(['0','-1','65536','abc','1.5'])('rejects invalid port %s before preparing storage', async value => {
  vi.stubEnv('GETBASED_AGENT_HOST_PORT',value); await expect(boot()).rejects.toThrow('exit:1'); expect(m.storage).not.toHaveBeenCalled();
});
it.each([new Error('storage unavailable'),'unknown failure'])('cleans the workspace if storage preparation fails: %s', async failure => {
  m.storage.mockImplementationOnce(() => { throw failure; }); await expect(boot()).rejects.toThrow('exit:1'); expect(m.rm).toHaveBeenCalledWith('/fixture/workspace',{recursive:true,force:true});
});
it('cleans the workspace if no installed agents are detected', async () => {
  m.detect.mockReturnValue([]); await expect(boot()).rejects.toThrow('exit:1'); expect(m.rm).toHaveBeenCalledOnce(); expect(m.service).not.toHaveBeenCalled();
});
it.each(['codex','acp','claude','openclaw'])('builds the %s adapter with an isolated workspace', async protocol => {
  m.detect.mockReturnValue([agent(protocol)]); await boot();
  expect(m[protocol]).toHaveBeenCalledWith(expect.objectContaining({cwd:'/fixture/workspace',command:'/fixture/agent'}));
  expect(m.adapters.agents[0].client).toBe(m.clients[0]);
  expect(m.server.listen).toHaveBeenCalledWith(8324,'127.0.0.1');
});
it('exposes login-required Codex without creating a process client', async () => {
  m.detect.mockReturnValue([agent('codex')]); m.storage.mockReturnValue({token:'secret',codexAuthenticated:false}); await boot();
  expect(m.codex).not.toHaveBeenCalled(); expect(m.adapters.agents[0]).toMatchObject({status:'login_required',client:null});
});
it.each(['claude','openclaw'])('does not create a %s client before login', async protocol => {
  m.detect.mockReturnValue([agent(protocol,{status:'login_required'})]); await boot(); expect(m[protocol]).not.toHaveBeenCalled();
});
it('keeps an incompatible installed agent unavailable', async () => {
  m.detect.mockReturnValue([agent('acp',{compatible:false})]); await boot(); expect(m.acp).not.toHaveBeenCalled(); expect(m.adapters.agents[0].status).toBe('unavailable');
});
it('includes OpenClaw gateway and Hermes routes in runtime restart', async () => {
  m.detect.mockReturnValue([agent('openclaw'),agent('acp',{id:'hermes'})]); await boot();
  expect(m.adapters.agents[0].routes[0]).toMatchObject({kind:'gateway',supportsLocalTools:false,supportsFeatureJobs:false});
  expect(m.adapters.agents[1].routeProvider).toBe(m.hermes.mock.results[0].value);
  await m.runtime.appServer.restart(); await m.runtime.appServer.initialize();
  for(const client of m.clients) expect(client.restart).toHaveBeenCalledOnce();
});
it('passes explicit origins and bearer token only to the service', async () => {
  vi.stubEnv('GETBASED_AGENT_HOST_ALLOWED_ORIGINS',' https://one.test, ,https://two.test '); await boot();
  expect(m.adapters).toMatchObject({allowedOrigins:['https://one.test','https://two.test'],token:'secret-token'});
  m.server.emit('listening'); expect(process.stdout.write.mock.calls.flat().join('')).not.toContain('secret-token');
  await m.http.mock.calls[0][0].handleRequest(new Request('http://localhost')); expect(m.http.mock.calls[0][0].getPort()).toBe(8324);
});
it('retries a busy default port within the discovery window', async () => {
  await boot(); m.server.emit('error',Object.assign(new Error('busy'),{code:'EADDRINUSE'})); expect(m.server.listen).toHaveBeenLastCalledWith(8325,'127.0.0.1');
});
it.each(['9000','65535'])('fails a busy explicit port %s without incrementing', async port => {
  vi.stubEnv('GETBASED_AGENT_HOST_PORT',port); await boot(); m.server.emit('error',Object.assign(new Error('busy'),{code:'EADDRINUSE'}));
  await vi.waitFor(() => expect(process.exitCode).toBe(1)); expect(m.server.listen).toHaveBeenCalledOnce(); expect(m.rm).toHaveBeenCalledOnce();
});
it('stops and recovers the retained runtime without deleting its workspace', async () => {
  await boot(); await m.runtime.stopRuntime();
  m.recover.mockImplementationOnce(async (_server, options) => { m.server.emit('error',new Error('recoverable')); options.onPort(8326); });
  await m.runtime.recoverRuntime(); expect(m.http.mock.calls[0][0].getPort()).toBe(8326); expect(m.rm).not.toHaveBeenCalled();
});
it('surfaces a stop-listener failure to the runtime controller', async () => {
  await boot(); m.server.close.mockImplementationOnce(cb=>cb(new Error('close failed'))); await expect(m.runtime.stopRuntime()).rejects.toThrow('close failed');
});
it.each(['SIGINT','SIGTERM'])('closes the listener and clients once on %s', async signal => {
  await boot(); m.server.listening = true; process.exit.mockImplementation(()=>{}); m.signals[signal]();
  await vi.waitFor(()=>expect(process.exit).toHaveBeenCalledWith(0));
  expect(m.server.close).toHaveBeenCalledOnce(); expect(m.clients[0].close).toHaveBeenCalledOnce(); expect(m.rm).toHaveBeenCalledOnce();
});
it('settles active clients while waiting for their HTTP connections to close', async () => {
  await boot(); m.server.listening = true; let finishListener;
  m.server.close.mockImplementation(cb=>{finishListener=cb;});
  m.clients[0].close.mockImplementation(async()=>{finishListener();});
  process.exit.mockImplementation(()=>{}); m.signals.SIGTERM();
  await vi.waitFor(()=>expect(process.exit).toHaveBeenCalledWith(0)); expect(m.rm).toHaveBeenCalledOnce();
});
it.each(['throw','reject'])('cleans every client and workspace when one close fails by %s', async mode => {
  m.detect.mockReturnValue([agent('acp'),agent('claude')]); await boot();
  m.clients[0].close.mockImplementation(()=>{if(mode==='throw')throw new Error('private failure'); return Promise.reject(new Error('private failure'));});
  process.exit.mockImplementation(()=>{}); m.signals.SIGTERM();
  await vi.waitFor(()=>expect(process.exit).toHaveBeenCalledWith(0));
  expect(m.clients[1].close).toHaveBeenCalledOnce(); expect(m.rm).toHaveBeenCalledOnce();
});
it('shares shutdown between simultaneous signals and runtime exit', async () => {
  await boot(); process.exit.mockImplementation(()=>{}); m.signals.SIGTERM(); m.signals.SIGINT(); m.runtime.exitRuntime();
  await vi.waitFor(()=>expect(m.rm).toHaveBeenCalledOnce()); expect(m.clients[0].close).toHaveBeenCalledOnce();
});
