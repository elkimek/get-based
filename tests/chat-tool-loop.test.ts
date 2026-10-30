import { describe, expect, it, vi } from 'vitest';
import { runChatToolLoop } from '../js/chat-tool-loop.js';
import { AIToolsUnsupportedError } from '../shared/ai-tool-protocol.js';
import type { ToolCompletion } from '../js/chat-tool-loop.js';
import type { AIToolCall } from '../shared/ai-tool-protocol.js';

const call = (id: string, name = 'getbased_read_context_card', args = '{}'): AIToolCall => ({ id, type: 'function', function: { name, arguments: args } });
function setup() {
  return { messages: [{ role: 'user', content: 'Improve my sleep.' }], system: 'Private health data.',
    tools: [{ type: 'function' as const, function: { name: 'getbased_read_context_card', description: 'Read', parameters: { type: 'object' as const } } }],
    isCurrent: () => true, execute: vi.fn(async () => ({ success: true, contentItems: [{ type: 'inputText', text: 'Synthetic result' }] })),
    complete: vi.fn<(options: unknown) => Promise<ToolCompletion>>(),
  };
}
describe('direct chat tool loop', () => {
  it('returns native call results with matching IDs, reasoning metadata and total usage', async () => {
    const options = setup(), tool = call('read-1');
    options.complete.mockResolvedValueOnce({ text: '', toolCalls: [tool], assistantMessage: { role: 'assistant', content: null, reasoning_details: [{ id: 'opaque' }] }, usage: { inputTokens: 10, outputTokens: 3 } })
      .mockResolvedValueOnce({ text: 'Please review.', usage: { inputTokens: 20, outputTokens: 4 } });
    const result = await runChatToolLoop(options);
    expect(result).toMatchObject({ text: 'Please review.', usage: { inputTokens: 30, outputTokens: 7 }, toolCalls: [{ tool: tool.function.name, success: true }] });
    expect(options.complete.mock.calls[1]![0]).toMatchObject({ messages: [options.messages[0],
      { role: 'assistant', tool_calls: [tool], reasoning_details: [{ id: 'opaque' }] }, { role: 'tool', tool_call_id: 'read-1' }] });
    expect(options.messages).toHaveLength(1);
  });
  it('falls back only on explicit tool incompatibility and never streams JSON envelopes', async () => {
    const options = setup(), onStream = vi.fn();
    options.complete.mockRejectedValueOnce(new AIToolsUnsupportedError('No native tools.'))
      .mockResolvedValueOnce({ text: JSON.stringify({ reply: '', calls: [{ id: 'r', name: 'getbased_read_context_card', arguments: '{}' }] }) })
      .mockResolvedValueOnce({ text: JSON.stringify({ reply: 'Your proposal is ready.', calls: [] }) });
    expect(await runChatToolLoop({ ...options, onStream })).toMatchObject({ text: 'Your proposal is ready.' });
    expect(options.complete.mock.calls[1]![0]).not.toHaveProperty('tools');
    expect(options.complete.mock.calls[1]![0]).not.toHaveProperty('onStream');
    expect(options.complete.mock.calls[2]![0]).toMatchObject({ messages: expect.arrayContaining([expect.objectContaining({ role: 'user', content: expect.stringContaining('not a user statement') })]) });
    expect(onStream).toHaveBeenCalledExactlyOnceWith('Your proposal is ready.');
  });
  it.each(['network failure', 'authentication failure'])('does not retry %s through a weaker protocol', async message => {
    const options = setup(); options.complete.mockRejectedValue(new Error(message));
    await expect(runChatToolLoop(options)).rejects.toThrow(message);
    expect(options.complete).toHaveBeenCalledTimes(1); expect(options.execute).not.toHaveBeenCalled();
  });
  it.each([
    { text: '', toolCalls: [call('a')], truncated: true },
    { text: '', toolCalls: [call('a'), call('b', 'apply_everything')] },
    { text: '', toolCalls: [call('a'), call('a')] },
    { text: '', toolCalls: [call('a', 'getbased_read_context_card', '{')] },
  ])('rejects incomplete, unavailable and malformed calls before any execution', async response => {
    const options = setup(); options.complete.mockResolvedValue(response);
    await expect(runChatToolLoop(options)).rejects.toThrow(); expect(options.execute).not.toHaveBeenCalled();
  });
  it('rechecks owner and cancellation after inference and before execution', async () => {
    const options = setup(), controller = new AbortController(); let current = true;
    options.complete.mockImplementation(async () => { current = false; return { text: '', toolCalls: [call('r')] }; });
    await expect(runChatToolLoop({ ...options, isCurrent: () => current })).rejects.toThrow('changed');
    expect(options.execute).not.toHaveBeenCalled();
    current = true;
    options.complete.mockImplementation(async () => { controller.abort(); return { text: '', toolCalls: [call('r')] }; });
    await expect(runChatToolLoop({ ...options, signal: controller.signal })).rejects.toThrow();
    expect(options.execute).not.toHaveBeenCalled();
  });
  it('bounds repeated calls and rounds and rejects malformed structured responses', async () => {
    const options = setup(); let counter = 0;
    options.complete.mockImplementation(async () => ({ text: '', toolCalls: [call(`r-${++counter}`)] }));
    await expect(runChatToolLoop(options)).rejects.toThrow('round-limit'.replace('-', ' '));
    expect(options.complete).toHaveBeenCalledTimes(10);
    options.execute.mockClear(); options.complete.mockResolvedValue({ text: 'I saved that.' });
    await expect(runChatToolLoop({ ...options, protocol: 'structured' })).rejects.toThrow('valid structured');
    expect(options.execute).not.toHaveBeenCalled();
  });
});

it('continues a truncated prose answer with the complete tool transcript and accumulated usage', async () => {
  const options = setup(), onStream = vi.fn();
  options.complete.mockResolvedValueOnce({ text: '', toolCalls: [call('read')] })
    .mockResolvedValueOnce({ text: 'First part, ', truncated: true, usage: { inputTokens: 10, outputTokens: 2 } })
    .mockResolvedValueOnce({ text: 'completed.', usage: { inputTokens: 20, outputTokens: 3 } });
  const result = await runChatToolLoop({ ...options, onStream });
  expect(result).toMatchObject({ text: 'First part, completed.', usage: { inputTokens: 30, outputTokens: 5 } });
  expect(options.complete.mock.calls[2]![0]).toMatchObject({ messages: expect.arrayContaining([
    expect.objectContaining({ role: 'tool', tool_call_id: 'read' }),
    { role: 'assistant', content: 'First part, ' }, expect.objectContaining({ role: 'user', content: expect.stringContaining('Continue exactly') }),
  ]) });
  expect(onStream).toHaveBeenLastCalledWith('First part, completed.');
});
