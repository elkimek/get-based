import { describe, expect, it, vi } from 'vitest';

import {
  AGENT_TOOL_CONTRACT_VERSION,
  createAgentToolRuntime,
  getAgentToolCatalog,
  getCodexDynamicTools,
  parseAgentContextSections,
  summarizeAgentToolReceipts,
} from '../js/agent-tool-runtime.js';

const CONTEXT = [
  '[section:profile]\nProfile context\n[/section:profile]',
  '[section:hormones updated:2026-08-25]\n## Hormones\nTSH: 2.1\nFree T4: 15\n[/section:hormones]',
  '[section:supplements]\n## Supplements\n- Magnesium\n[/section:supplements]',
].join('\n\n');

describe('agent tool catalog', () => {
  it('discloses only profile tools that successfully returned data', () => {
    const full = [{ label: 'Full context', detail: 'All enabled sources' }];
    expect(summarizeAgentToolReceipts([
      { tool: 'getbased_marker_history', arguments: { marker: 'ApoB' }, success: true },
      { tool: 'getbased_nutrition_summary', arguments: { range: '30d' }, success: true },
      { tool: 'getbased_search_knowledge', arguments: { query: 'sleep' }, success: false },
      { tool: 'getbased_draft_note', arguments: {}, success: true },
    ], full)).toEqual([
      { label: 'Blood marker results', detail: 'History: ApoB' },
      { label: 'Meals & Nutrition', detail: 'Summary: 30d' },
    ]);
    expect(summarizeAgentToolReceipts([
      { tool: 'getbased_lab_context', arguments: {}, success: true },
    ], full)).toBe(full);
  });

  it('exports versioned least-authority tools using Codex dynamic-tool schemas', () => {
    expect(AGENT_TOOL_CONTRACT_VERSION).toBe(2);
    expect(getAgentToolCatalog().map(tool => [tool.name, tool.access])).toEqual([
      ['getbased_lab_context', 'read'],
      ['getbased_section', 'read'],
      ['getbased_search_markers', 'read'],
      ['getbased_marker_history', 'read'],
      ['getbased_nutrition_summary', 'read'],
      ['getbased_wearable_series', 'read'],
      ['getbased_search_knowledge', 'read'],
      ['getbased_navigate', 'navigate'],
      ['getbased_draft_note', 'draft'],
      ['getbased_draft_meal', 'draft'],
      ['getbased_draft_biometric', 'draft'],
      ['getbased_draft_supplement', 'draft'],
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
    expect(getCodexDynamicTools()[0].inputSchema.properties).toEqual({});
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
    const readContext = vi.fn(async () => ({
      profileId: 'active-profile',
      updatedAt: '2026-09-03T08:00:00Z',
      context: CONTEXT,
    }));
    const runtime = createAgentToolRuntime({ readContext });

    const result = await runtime.execute({
      namespace: 'getbased',
      tool: 'getbased_lab_context',
      arguments: '{}',
    });

    expect(readContext).toHaveBeenCalledWith();
    expect(result.success).toBe(true);
    expect(result.contentItems[0].text).toContain('Profile scope: active getbased profile');
    expect(result.contentItems[0].text).not.toContain('active-profile');
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
      contentItems: [{ type: 'inputText', text: 'Error: getbased context is temporarily unavailable.' }],
    });
  });

  it('rejects all attempts to select a different profile', async () => {
    const runtime = createAgentToolRuntime({
      readContext: () => ({ context: CONTEXT, profileId: 'active-profile' }),
    });

    const result = await runtime.execute({
      tool: 'getbased_lab_context',
      arguments: { profile: 'other-profile' },
    });
    expect(result).toEqual({
      success: false,
      contentItems: [{ type: 'inputText', text: 'Error: Unknown argument: profile.' }],
    });
  });

  it('delegates structured reads with normalized bounded arguments', async () => {
    const searchMarkers = vi.fn(() => ({ available: true, matches: [] }));
    const readMarkerHistory = vi.fn(() => ({ available: true, values: [] }));
    const readNutritionSummary = vi.fn(() => ({ available: true }));
    const readWearableSeries = vi.fn(() => ({ available: true }));
    const searchKnowledge = vi.fn(() => ({ available: true, chunks: [] }));
    const navigate = vi.fn(() => ({ changed: true }));
    const runtime = createAgentToolRuntime({
      readContext: () => CONTEXT,
      searchMarkers,
      readMarkerHistory,
      readNutritionSummary,
      readWearableSeries,
      searchKnowledge,
      navigate,
    });

    await runtime.execute({ tool: 'getbased_search_markers', arguments: { query: ' tsh ', limit: 3 } });
    await runtime.execute({ tool: 'getbased_marker_history', arguments: { marker: 'hormones.tsh', from: '2026-01-01' } });
    await runtime.execute({ tool: 'getbased_nutrition_summary', arguments: {} });
    await runtime.execute({ tool: 'getbased_wearable_series', arguments: { days: 7 } });
    await runtime.execute({ tool: 'getbased_search_knowledge', arguments: { query: ' magnesium ' } });
    await runtime.execute({ tool: 'getbased_navigate', arguments: { marker: 'TSH' } });

    expect(searchMarkers).toHaveBeenCalledWith({ query: 'tsh', limit: 3 });
    expect(readMarkerHistory).toHaveBeenCalledWith({ marker: 'hormones.tsh', from: '2026-01-01', to: '', limit: 50 });
    expect(readNutritionSummary).toHaveBeenCalledWith({ range: '30d' });
    expect(readWearableSeries).toHaveBeenCalledWith({ days: 7 });
    expect(searchKnowledge).toHaveBeenCalledWith({ query: 'magnesium', limit: 5 });
    expect(navigate).toHaveBeenCalledWith({ view: '', marker: 'TSH' });
  });

  it('creates review-only drafts and never invokes a persistence dependency', async () => {
    let nextId = 0;
    const onDraftCreated = vi.fn();
    const runtime = createAgentToolRuntime({
      readContext: () => CONTEXT,
      createId: () => `draft-${++nextId}`,
      onDraftCreated,
    });

    const result = await runtime.execute({
      tool: 'getbased_draft_biometric',
      arguments: { metric: 'bp', date: '2026-09-03', systolic: 120, diastolic: 80 },
    });

    expect(result.success).toBe(true);
    expect(runtime.getDrafts()).toEqual([expect.objectContaining({
      id: 'draft-1',
      kind: 'biometric',
      status: 'pending',
      payload: expect.objectContaining({ metric: 'bp', systolic: 120, diastolic: 80 }),
    })]);
    expect(onDraftCreated).toHaveBeenCalledTimes(1);
  });

  it('validates structured reads and draft payloads before invoking bindings', async () => {
    const searchMarkers = vi.fn();
    const runtime = createAgentToolRuntime({ readContext: () => CONTEXT, searchMarkers });

    const invalidLimit = await runtime.execute({
      tool: 'getbased_search_markers', arguments: { query: 'TSH', limit: 101 },
    });
    const invalidBp = await runtime.execute({
      tool: 'getbased_draft_biometric', arguments: { metric: 'bp', systolic: 120 },
    });
    const impossibleDate = await runtime.execute({
      tool: 'getbased_draft_biometric', arguments: { metric: 'weight', value: 80, date: '2026-02-30' },
    });

    expect(invalidLimit.success).toBe(false);
    expect(invalidBp.success).toBe(false);
    expect(impossibleDate).toMatchObject({ success: false });
    expect(searchMarkers).not.toHaveBeenCalled();
  });
});
