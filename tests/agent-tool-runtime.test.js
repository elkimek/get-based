import { describe, expect, it, vi } from 'vitest';

import {
  AGENT_TOOL_CONTRACT_VERSION,
  createAgentToolRuntime,
  getAgentToolCatalog,
  getCodexDynamicTools,
  parseAgentContextSections,
} from '../js/agent-tool-runtime.js';

const CONTEXT = [
  '[section:profile]\nProfile context\n[/section:profile]',
  '[section:hormones updated:2026-08-25]\n## Hormones\nTSH: 2.1\nFree T4: 15\n[/section:hormones]',
  '[section:supplements]\n## Supplements\n- Magnesium\n[/section:supplements]',
].join('\n\n');

describe('agent tool catalog', () => {
  it('exports versioned read-only tools using Codex dynamic-tool schemas', () => {
    expect(AGENT_TOOL_CONTRACT_VERSION).toBe(1);
    expect(getAgentToolCatalog().map(tool => [tool.name, tool.access])).toEqual([
      ['getbased_lab_context', 'read'],
      ['getbased_section', 'read'],
    ]);

    expect(getCodexDynamicTools()).toEqual(getAgentToolCatalog().map(({ access: _access, ...tool }) => ({
      type: 'function',
      ...tool,
    })));
    expect(getCodexDynamicTools().every(tool => tool.inputSchema.additionalProperties === false)).toBe(true);
  });

  it('returns defensive catalog copies', () => {
    const first = getAgentToolCatalog();
    first[0].name = 'changed';
    first[0].inputSchema.properties = {};
    expect(getAgentToolCatalog()[0].name).toBe('getbased_lab_context');
    expect(getCodexDynamicTools()[0].inputSchema.properties).toHaveProperty('profile');
  });
});

describe('agent context sections', () => {
  it('parses metadata while retaining the closing-tag base name', () => {
    expect(parseAgentContextSections(CONTEXT)).toEqual([
      { baseName: 'profile', name: 'profile', metadata: '', content: 'Profile context' },
      {
        baseName: 'hormones',
        name: 'hormones updated:2026-08-25',
        metadata: 'updated:2026-08-25',
        content: '## Hormones\nTSH: 2.1\nFree T4: 15',
      },
      { baseName: 'supplements', name: 'supplements', metadata: '', content: '## Supplements\n- Magnesium' },
    ]);
  });
});

describe('agent tool runtime', () => {
  it('reads the full approved context and preserves snapshot metadata', async () => {
    const readContext = vi.fn(async ({ profile }) => ({
      profileId: profile || 'active-profile',
      updatedAt: '2026-09-03T08:00:00Z',
      context: CONTEXT,
    }));
    const runtime = createAgentToolRuntime({ readContext });

    const result = await runtime.execute({
      namespace: 'getbased',
      tool: 'getbased_lab_context',
      arguments: '{"profile":"profile-2"}',
    });

    expect(readContext).toHaveBeenCalledWith({ profile: 'profile-2' });
    expect(result.success).toBe(true);
    expect(result.contentItems[0].text).toContain('Profile: profile-2');
    expect(result.contentItems[0].text).toContain(CONTEXT);
  });

  it('lists sections and resolves exact or prefix section names', async () => {
    const runtime = createAgentToolRuntime({ readContext: () => CONTEXT });

    const index = await runtime.execute({ tool: 'getbased_section', arguments: {} });
    expect(index).toEqual({
      success: true,
      contentItems: [{
        type: 'inputText',
        text: 'Available sections:\n\n  profile  (1 lines)\n  hormones updated:2026-08-25  (3 lines)\n  supplements  (2 lines)',
      }],
    });

    const section = await runtime.execute({
      tool: 'getbased_section',
      arguments: { section: 'hormones' },
    });
    expect(section).toEqual({
      success: true,
      contentItems: [{ type: 'inputText', text: '[hormones updated:2026-08-25]\n\n## Hormones\nTSH: 2.1\nFree T4: 15' }],
    });
  });

  it('fails closed for unknown tools, namespaces, arguments, and sections', async () => {
    const runtime = createAgentToolRuntime({ readContext: () => CONTEXT });

    await expect(runtime.execute({ tool: 'delete_everything', arguments: {} })).resolves.toMatchObject({ success: false });
    await expect(runtime.execute({ namespace: 'shell', tool: 'getbased_section', arguments: {} })).resolves.toMatchObject({ success: false });
    await expect(runtime.execute({ tool: 'getbased_section', arguments: { unexpected: true } })).resolves.toMatchObject({ success: false });
    await expect(runtime.execute({ tool: 'getbased_section', arguments: { section: 'missing' } })).resolves.toEqual({
      success: false,
      contentItems: [{ type: 'inputText', text: 'Error: Section "missing" not found. Available: profile, hormones, supplements' }],
    });
  });

  it('does not expose context-source exception details to an agent', async () => {
    const runtime = createAgentToolRuntime({
      readContext: () => { throw new Error('secret storage path and token'); },
    });

    const result = await runtime.execute({ tool: 'getbased_lab_context', arguments: {} });
    expect(result).toEqual({
      success: false,
      contentItems: [{ type: 'inputText', text: 'Error: Get-based context is temporarily unavailable.' }],
    });
  });

  it('does not relabel active context as a different requested profile', async () => {
    const runtime = createAgentToolRuntime({
      readContext: () => ({ context: CONTEXT, profileId: 'active-profile' }),
    });

    const result = await runtime.execute({
      tool: 'getbased_lab_context',
      arguments: { profile: 'other-profile' },
    });
    expect(result).toEqual({
      success: false,
      contentItems: [{ type: 'inputText', text: 'Error: Get-based context is temporarily unavailable.' }],
    });
  });
});
