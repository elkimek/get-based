// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { extractClaudeStreamEvent, getClaudeModelCatalog } from '../lib/claude-agent-client.js';

describe('Claude Code adapter', () => {
  it('offers alias models with image and reasoning metadata', () => {
    const models = getClaudeModelCatalog();
    expect(models.map(model => model.id)).toEqual(expect.arrayContaining(['sonnet', 'opus', 'fable']));
    expect(models[0]).toMatchObject({ inputModalities: ['text', 'image'] });
    expect(models[0].supportedReasoningEfforts.map(item => item.reasoningEffort))
      .toEqual(['low', 'medium', 'high', 'xhigh', 'max']);
  });

  it('maps init, partial text, usage, and result events', () => {
    expect(extractClaudeStreamEvent({ type: 'system', subtype: 'init', session_id: 'session-1', model: 'sonnet' }))
      .toEqual({ type: 'session', sessionId: 'session-1', model: 'sonnet' });
    expect(extractClaudeStreamEvent({ type: 'stream_event', event: {
      type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello' },
    } })).toEqual({ type: 'text_delta', delta: 'Hello' });
    expect(extractClaudeStreamEvent({ type: 'result', subtype: 'success', session_id: 'session-1' }))
      .toMatchObject({ type: 'done', finishReason: 'success', sessionId: 'session-1' });
  });
});
