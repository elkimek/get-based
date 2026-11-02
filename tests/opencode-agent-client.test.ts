// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { createOpenCodeTurnClientFactory } from '../lib/opencode-agent-client.js';
import { buildLocalAgentEnvironment } from '../lib/local-agent-registry.js';

it('keeps direct MCP credentials isolated per turn while preserving executor denial', async () => {
  const env = buildLocalAgentEnvironment({ PATH: '/bin' }, { id: 'opencode', version: '2.1.4' });
  const factory = createOpenCodeTurnClientFactory({ id:'opencode', command:'opencode', args:['acp'], cwd:'/tmp', env });
  const turns = ['first-token', 'second-token'].map(value => factory([{
    name:'getbased', command:'/node', args:['/bridge', 'mcp-bridge'], env:[{name:'GETBASED_MCP_TOKEN', value}],
  }]));
  expect(turns[0]!.client).not.toBe(turns[1]!.client);
  for (const [index, turn] of turns.entries()) {
    const config = JSON.parse(turn.client.env!.OPENCODE_CONFIG_CONTENT!);
    expect(config.permissions).toEqual(JSON.parse(env.OPENCODE_CONFIG_CONTENT!).permissions);
    expect(config.permissions[0]).toEqual({ action:'*', resource:'*', effect:'deny' });
    expect(config.mcp.servers).toEqual({getbased:{type:'local', command:['/node','/bridge','mcp-bridge'], environment:{GETBASED_MCP_TOKEN:index ? 'second-token' : 'first-token'}, codemode:false}});
    await turn.close();
  }
  expect(env.OPENCODE_CONFIG_CONTENT).not.toContain('token');
});

it('discards the empty warmup session before using the initialized tool catalog', async () => {
  const factory = createOpenCodeTurnClientFactory({id:'opencode',command:'opencode',args:['acp'],cwd:'/tmp'});
  const turn = factory([]);
  turn.client.ensureSession = vi.fn(async () => ({sessionId:'ready',configOptions:[],modelState:null}));
  turn.client.request = vi.fn(async () => ({})) as typeof turn.client.request;
  expect(await turn.afterCatalog({sessionId:'warmup',configOptions:[],modelState:null})).toMatchObject({sessionId:'ready'});
  expect(turn.client.request).toHaveBeenCalledWith('session/delete',{sessionId:'warmup'});
  await turn.close();
});
