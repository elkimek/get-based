// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
  buildLocalAgentEnvironment, resolveAgentLaunch, resolveWindowsNodeShim,
} from '../lib/local-agent-registry.js';

describe('local CLI process resolution', () => {
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
      OPENAI_API_KEY: 'secret', ANTHROPIC_API_KEY: 'secret', GETBASED_AGENT_HOST_TOKEN: 'secret',
    });
    expect(environment).toMatchObject({
      HOME: '/home/test', PATH: '/usr/bin', HTTPS_PROXY: 'http://proxy.test', NO_PROXY: 'localhost',
      CI: '1', NO_COLOR: '1', TERM: 'dumb',
    });
    expect(environment).not.toHaveProperty('OPENAI_API_KEY');
    expect(environment).not.toHaveProperty('ANTHROPIC_API_KEY');
    expect(environment).not.toHaveProperty('GETBASED_AGENT_HOST_TOKEN');
  });
});
