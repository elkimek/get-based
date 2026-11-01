// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
  buildLocalAgentEnvironment, findBundledOpenClawExecutable, normalizeAgentVersion, readCommandJson,
  resolveAgentLaunch, resolveWindowsNodeShim, localAgentArguments, usesOpenCodeV2Configuration,
} from '../lib/local-agent-registry.js';

describe('local CLI process resolution', () => {
  it('reads valid status JSON returned with a non-zero command exit', () => {
    const error = Object.assign(new Error('Command failed'), {
      stdout: JSON.stringify({ loggedIn: false, authMethod: 'none' }),
    });
    expect(readCommandJson(() => { throw error; })).toEqual({ loggedIn: false, authMethod: 'none' });
    expect(normalizeAgentVersion('claude', '2.1.259 (Claude Code)')).toBe('2.1.259');
  });

  it('unwraps a standard Windows npm shim without enabling a command shell', () => {
    const source = '@ECHO off\r\nendLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%"  "%dp0%\\node_modules\\@anthropic-ai\\claude-code\\cli.js" %*\r\n';
    expect(resolveWindowsNodeShim('C:\\Users\\Alex\\bin\\claude.cmd', source, 'C:\\Node\\node.exe')).toEqual({
      command: 'C:\\Node\\node.exe',
      args: ['C:\\Users\\Alex\\bin\\node_modules\\@anthropic-ai\\claude-code\\cli.js'],
    });
    expect(resolveAgentLaunch('C:\\Tools\\grok.exe', { platform: 'win32' }))
      .toEqual({ command: 'C:\\Tools\\grok.exe', args: [] });
  });

  it('rejects unknown or escaping Windows command shims', () => {
    expect(() => resolveWindowsNodeShim('C:\\bin\\agent.cmd', '@echo off\r\nagent.exe %*'))
      .toThrow('not a supported Node command shim');
    expect(() => resolveWindowsNodeShim('C:\\bin\\agent.cmd', '"%dp0%\\..\\outside.js" %*'))
      .toThrow('outside its installation directory');
  });

  it('keeps network configuration but excludes provider keys and companion credentials', () => {
    const environment = buildLocalAgentEnvironment({
      HOME: '/home/test', PATH: '/usr/bin', HTTPS_PROXY: 'http://proxy.test', NO_PROXY: 'localhost',
      OPENCLAW_PROFILE: 'work', OPENCLAW_STATE_DIR: '/home/test/.openclaw-work',
      OPENCLAW_PREFIX: '/opt/openclaw', OPENCLAW_INCLUDE_ROOTS: '/home/test/config',
      OPENAI_API_KEY: 'secret', ANTHROPIC_API_KEY: 'secret', GETBASED_AGENT_HOST_TOKEN: 'secret',
    });
    expect(environment).toMatchObject({
      HOME: '/home/test', PATH: '/usr/bin', HTTPS_PROXY: 'http://proxy.test', NO_PROXY: 'localhost',
      OPENCLAW_PROFILE: 'work', OPENCLAW_STATE_DIR: '/home/test/.openclaw-work',
      OPENCLAW_PREFIX: '/opt/openclaw', OPENCLAW_INCLUDE_ROOTS: '/home/test/config',
      CI: '1', NO_COLOR: '1', TERM: 'dumb',
    });
    expect(environment).not.toHaveProperty('OPENAI_API_KEY');
    expect(environment).not.toHaveProperty('ANTHROPIC_API_KEY');
    expect(environment).not.toHaveProperty('GETBASED_AGENT_HOST_TOKEN');
  });

  it('finds the official self-contained OpenClaw install outside PATH on every supported platform', () => {
    const directory = (name: string) => ({ name, isDirectory: () => true });
    expect(findBundledOpenClawExecutable({
      env: { HOME: '/home/alex', PATH: '' }, platform: 'linux',
      readdirSyncImpl: () => [directory('node-v24.19.0')],
      existsSyncImpl: path => path === '/home/alex/.openclaw/bin/openclaw',
    })).toBe('/home/alex/.openclaw/bin/openclaw');
    expect(findBundledOpenClawExecutable({
      env: { HOME: '/Users/alex', PATH: '' }, platform: 'darwin',
      readdirSyncImpl: () => [directory('node-v24.19.0')],
      existsSyncImpl: path => path === '/Users/alex/.openclaw/tools/node-v24.19.0/bin/openclaw',
    })).toBe('/Users/alex/.openclaw/tools/node-v24.19.0/bin/openclaw');
    expect(findBundledOpenClawExecutable({
      env: { USERPROFILE: 'C:\\Users\\Alex', PATH: '' }, platform: 'win32',
      readdirSyncImpl: () => [],
      existsSyncImpl: path => path === 'C:\\Users\\Alex\\.local\\bin\\openclaw.cmd',
    })).toBe('C:\\Users\\Alex\\.local\\bin\\openclaw.cmd');
    expect(findBundledOpenClawExecutable({
      env: { OPENCLAW_PREFIX: 'D:\\Apps\\OpenClaw', PATH: '' }, platform: 'win32',
      readdirSyncImpl: () => [],
      existsSyncImpl: path => path === 'D:\\Apps\\OpenClaw\\bin\\openclaw.cmd',
    })).toBe('D:\\Apps\\OpenClaw\\bin\\openclaw.cmd');
  });
});


it('keeps legacy OpenCode pure mode and uses supported arguments for 2.1 and later', () => {
 const spec={id:'opencode',args:['acp','--pure']};
 expect(localAgentArguments(spec,'1.18.23')).toEqual(['acp','--pure']);
 expect(localAgentArguments(spec,'opencode v2.0.27')).toEqual(['acp','--pure']);
 expect(localAgentArguments(spec,'opencode v2.1.4')).toEqual(['acp']);
 expect(localAgentArguments(spec,'opencode v3.0.0')).toEqual(['acp']);
 expect(usesOpenCodeV2Configuration({id:'hermes',version:'2.1.4'})).toBe(false);
 expect(localAgentArguments(spec,'unknown')).toEqual(['acp','--pure']);
});
it('isolates modern OpenCode plugins and native tools without forwarding config overrides or credentials', () => {
 const source={HOME:'/synthetic/home',OPENCODE_CONFIG_CONTENT:'private-config',OPENAI_API_KEY:'private-key'},agent={id:'opencode',version:'opencode v2.1.4'};
 const env=buildLocalAgentEnvironment(source,agent),config=JSON.parse(env.OPENCODE_CONFIG_CONTENT!);
 expect(env.HOME).toBe('/synthetic/home');expect(env.OPENCODE_DISABLE_PROJECT_CONFIG).toBe('1');
 expect(config.plugins).toEqual(['-*','opencode.*']);expect(config.permissions).toEqual([{action:'*',resource:'*',effect:'deny'},{action:'getbased_*',resource:'*',effect:'allow'}]);
 expect(JSON.stringify(env)).not.toContain('private-');expect(source.OPENCODE_CONFIG_CONTENT).toBe('private-config');
 expect(buildLocalAgentEnvironment(source,{id:'opencode',version:'1.18.23'})).not.toHaveProperty('OPENCODE_CONFIG_CONTENT');
});
