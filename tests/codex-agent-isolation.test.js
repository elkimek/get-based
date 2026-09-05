// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
  buildIsolatedCodexArgs, buildIsolatedCodexEnvironment, DISABLED_CODEX_FEATURES,
} from '../lib/codex-agent-isolation.js';

describe('Codex Agent Host isolation', () => {
  it('disables native capabilities', () => {
    const args = buildIsolatedCodexArgs();
    expect(args[0]).toBe('app-server');
    for (const feature of DISABLED_CODEX_FEATURES) {
      const index = args.findIndex((value, position) => value === '--disable' && args[position + 1] === feature);
      expect(index, feature).toBeGreaterThanOrEqual(0);
    }
  });

  it('does not pass application tokens or API keys into the Codex process', () => {
    const environment = buildIsolatedCodexEnvironment({
      PATH: '/usr/bin', HOME: '/home/user', CODEX_HOME: '/home/user/.codex',
      GETBASED_AGENT_HOST_TOKEN: 'pairing-secret', OPENAI_API_KEY: 'api-secret',
      HTTPS_PROXY: 'http://proxy.example',
    }, '/private/getbased/codex');
    expect(environment).toEqual({
      PATH: '/usr/bin', HOME: '/home/user', CODEX_HOME: '/private/getbased/codex', HTTPS_PROXY: 'http://proxy.example',
    });
  });
});

