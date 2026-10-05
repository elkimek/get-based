import { describe, expect, it } from 'vitest';
import { buildAgentChatInstructions, isPersonalAgentTarget } from '../js/agent-chat-context.js';

describe('agent context routing', () => {
  it('supplies the enabled baseline to local and personal targets with the correct tool boundary', () => {
    const base = 'Be careful with private health data.';
    const context = '[section:profile]\nFatigue noted\n[/section:profile]';
    expect(isPersonalAgentTarget('local')).toBe(false);
    expect(isPersonalAgentTarget('gateway-home')).toBe(true);
    const local = buildAgentChatInstructions(base, context, 'local');
    expect(local).toContain(context);
    expect(local).toContain('Use the bounded getbased tools');
    const remote = buildAgentChatInstructions(base, context, 'gateway-home');
    expect(remote).toContain('## Current User Health and Lab Context');
    expect(remote).toContain('exact enabled getbased context snapshot');
    expect(remote).toContain(context);
    expect(remote).toContain('never send it to web searches');
    expect(remote).toContain('tool bridge is not attached');
  });
});
