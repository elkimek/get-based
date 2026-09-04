// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { isAgentAllowedForDeployment } from '../js/agent-host-discovery.js';

describe('CLI agent release policy', () => {
  it('hides Claude Agent on official hosts even when an older companion advertises it', () => {
    const agents = [{ id: 'codex' }, { id: 'claude' }, { id: 'hermes' }];
    expect(agents.filter(agent => isAgentAllowedForDeployment(agent.id, { hostname: 'app.getbased.health' })))
      .toEqual([{ id: 'codex' }, { id: 'hermes' }]);
    expect(isAgentAllowedForDeployment('claude', { hostname: 'get-based.vercel.app' })).toBe(false);
  });

  it('leaves the self-hosted adapter available for the companion opt-in gate', () => {
    expect(isAgentAllowedForDeployment('claude', { hostname: 'localhost' })).toBe(true);
    expect(isAgentAllowedForDeployment('claude', { hostname: 'health.example.org' })).toBe(true);
  });
});
