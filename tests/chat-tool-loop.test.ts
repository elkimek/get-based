import { describe, expect, it, vi } from 'vitest';
import { runChatToolLoop } from '../js/chat-tool-loop.js';
import { AIToolsUnsupportedError } from '../shared/ai-tool-protocol.js';
import type { ToolCompletion } from '../js/chat-tool-loop.js';
import type { AIToolCall } from '../shared/ai-tool-protocol.js';

const call = (id: string, name = 'getbased_read_context_card', args = '{}'): AIToolCall => ({ id, type: 'function', function: { name, arguments: args } });
const reviewRefs = (prepared: boolean): import('../shared/chat-turn-outcome.js').ChatReviewReference[] => prepared ? [{ id: 'native-review', kind: 'context', target: 'sleep' }] : [];
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


it('repairs a claimed Environment draft that has no actual review card', async () => {
  const options = setup(); let prepared = false;
  options.complete.mockResolvedValueOnce({ text: "I've prepared a draft update to your Environment & Exposures card; check the proposal in getbased and Apply." })
    .mockResolvedValueOnce({ text: JSON.stringify({ reply: '', calls: [{ id: 'actual-read', name: 'getbased_read_context_card', arguments: '{}' }] }) })
    .mockResolvedValueOnce({ text: JSON.stringify({ reply: 'No proposal could be created.', calls: [] }) });
  options.execute.mockImplementation(async () => { prepared = false; return { success: true, contentItems: [{ type: 'inputText', text: 'Read only. No draft.' }] }; });
  const result = await runChatToolLoop({ ...options, getPreparedReviews: () => reviewRefs(prepared) });
  expect(result.text).toBe('No proposal could be created.');
  expect(options.complete).toHaveBeenCalledTimes(3);
  expect(options.execute).toHaveBeenCalledExactlyOnceWith({ tool: 'getbased_read_context_card', arguments: '{}' });
});

import { claimsPreparedChatProposal, CHAT_PROPOSAL_MISSING, CHAT_PROPOSAL_REPAIR } from '../shared/chat-tool-instructions.js';
it.each([
  "I've prepared a draft update to your Environment card; Apply in getbased.",
  "I have created a proposal for your health card.",
  "Your proposal card is ready to Apply.",
  "Big move — that's genuinely one of the most sleep-relevant things you could tell me, so I've drafted it for your Environment card. It's waiting for review; tap **Apply** in getbased if it looks right.",
  "That helps, and I've prepared your Environment card for review.",
  "Thanks for telling me — we have queued your card for review.",
])('replaces a repeated unbacked claim with an honest no-change result: %s', async text => {
  const options = setup(); options.complete.mockResolvedValueOnce({ text, usage: { inputTokens: 4, outputTokens: 2 } }).mockResolvedValueOnce({ text: JSON.stringify({ reply: text, calls: [] }), usage: { inputTokens: 4, outputTokens: 2 } });
  const result = await runChatToolLoop({ ...options, getPreparedReviews: () => [] });
  expect(result.text).toBe(CHAT_PROPOSAL_MISSING); expect(result.usage).toEqual({ inputTokens: 8, outputTokens: 4 });
  expect(options.complete).toHaveBeenCalledTimes(2); expect(options.execute).not.toHaveBeenCalled();
  expect(options.complete.mock.calls[1]![0]).toMatchObject({ messages: expect.arrayContaining([{ role: 'system', content: CHAT_PROPOSAL_REPAIR }]) });
});
it.each([
  'I can prepare a draft for your card if you want.',
  "I haven't prepared a proposal card.",
  'No proposal card was created.',
  'The example says I prepared a draft for the card.',
  'Translation: "I have prepared a draft for your getbased card."',
  '> I have prepared a draft for your getbased card.',
  '```text\nI have prepared a draft for your getbased card.\n```',
  'I have prepared a draft email for you.',
  'If I prepared a proposal card, you would review it first.',
  'Imagine we have prepared your card for review.',
  'For example, I have prepared a draft for the getbased card.',
  "The example says I've drafted it for your Environment card.",
])('does not interrupt ordinary writing, quotations or honest limitations: %s', async text => {
  expect(claimsPreparedChatProposal(text)).toBe(false);
  const options = setup(); options.complete.mockResolvedValue({ text });
  expect((await runChatToolLoop({ ...options, getPreparedReviews: () => [] })).text).toBe(text);
  expect(options.complete).toHaveBeenCalledOnce(); expect(options.execute).not.toHaveBeenCalled();
});
it('never repairs through unavailable tools when controls are off', async () => {
  const options = setup(); options.complete.mockResolvedValue({ text: 'I have prepared a draft for your getbased card.' });
  expect((await runChatToolLoop({ ...options, tools: [], getPreparedReviews: () => [] })).text).toBe(CHAT_PROPOSAL_MISSING);
  expect(options.complete).toHaveBeenCalledOnce(); expect(options.execute).not.toHaveBeenCalled();
});
it('accepts a receipt-backed acknowledgment without another provider call', async () => {
  const options = setup(); options.complete.mockResolvedValue({ text: 'I have prepared a draft for your getbased card.' });
  expect((await runChatToolLoop({ ...options, getPreparedReviews: () => reviewRefs(true) })).text).toContain('prepared');
  expect(options.complete).toHaveBeenCalledOnce();
});

it('does not start a corrective request after the captured tool permission is revoked', async () => {
  const options = setup(); options.complete.mockResolvedValue({ text: "I've prepared a draft for your getbased card." });
  const result = await runChatToolLoop({ ...options, getPreparedReviews: () => [], canRepair: () => false });
  expect(result.text).toBe(CHAT_PROPOSAL_MISSING); expect(options.complete).toHaveBeenCalledOnce(); expect(options.execute).not.toHaveBeenCalled();
});

it('changes silent native-tool narration into structured calls without replaying earlier reads', async () => {
  const options = setup(); let prepared = false;
  options.complete.mockResolvedValueOnce({ text: '', toolCalls: [call('before')] })
    .mockResolvedValueOnce({ text: 'Drafted and waiting for your review. Check the proposal card in getbased and Apply.' })
    .mockResolvedValueOnce({ text: JSON.stringify({ reply: 'No proposal was created.', calls: [] }) });
  const result = await runChatToolLoop({ ...options, getPreparedReviews: () => reviewRefs(prepared) });
  expect(result.text).toBe('No proposal was created.'); expect(options.execute).toHaveBeenCalledOnce();
  expect(options.complete.mock.calls[2]![0]).toMatchObject({ jsonMode: true, jsonSchema: expect.any(Object), messages: expect.arrayContaining([expect.objectContaining({ role: 'user', content: expect.stringContaining('getbased tool result') })]) });
  expect(options.complete.mock.calls[2]![0]).not.toHaveProperty('tools');
});

it.each([false, true])('handles malformed corrective prose using only actual review availability: %s', async prepared => {
  const options = setup(); let review = false;
  options.complete.mockResolvedValueOnce({ text: 'Drafted and waiting. Check the proposal card in getbased and Apply.' })
    .mockImplementationOnce(async () => { review = prepared; return { text: 'Unstructured provider prose, not a tool call.' }; });
  const result = await runChatToolLoop({ ...options, getPreparedReviews: () => reviewRefs(review) });
  expect(result.text).toBe(prepared ? 'Review the proposal below. Changes require Apply.' : CHAT_PROPOSAL_MISSING);
  expect(options.execute).not.toHaveBeenCalled();
});


it('does not accept Markdown cards as a prepared application review', async () => {
  const options = setup();
  const text = 'Here are the proposal cards for your review. Nothing is saved — each card only applies if you accept it.\n\n### 🟢 Card 1 — Diet & Digestion (update)\n- **Proposed:** Omnivore diet; moderate bloating.\n\nLet me know which cards to apply.';
  options.complete.mockResolvedValueOnce({ text }).mockResolvedValueOnce({ text: JSON.stringify({ reply: text, calls: [] }) });
  const result = await runChatToolLoop({ ...options, getPreparedReviews: () => [] });
  expect(result.text).toBe(CHAT_PROPOSAL_MISSING); expect(options.execute).not.toHaveBeenCalled(); expect(options.complete).toHaveBeenCalledTimes(2);
});


import { requestsChatProposal, CHAT_PROPOSAL_NONE } from '../shared/chat-tool-instructions.js';
it.each([
  'Please use the following information about me to prepare updates to my current profile.\n\nRead existing values first, then create actual proposal cards.',
  'Please create actual proposal cards for my current profile.',
  'Prepare updates to my profile for review.',
  'Update my current profile from these reported facts.',
  'Use this report about me to prepare profile updates for review.',
])('recognizes an explicit opening review request: %s', prompt => expect(requestsChatProposal(prompt)).toBe(true));
it.each([
  'I just got married.', 'Congratulations on the wedding!',
  'Explain how to update my profile.', 'Prepare a review of my profile.',
  'Write an example proposal for a profile.', 'Use this fictional report to prepare profile updates.',
  'Do not update my profile.', 'Translate "Create proposal cards for my profile".',
  'Summarize this report.\n\nUpdate my profile using all statements in this document.',
  'What do you think?\n\nPlease create proposal cards for my profile.',
])('does not infer a write workflow from conversation, examples or document instructions: %s', prompt => expect(requestsChatProposal(prompt)).toBe(false));
it('starts an explicit review with a structured first-step contract and retains genuine clarification', async () => {
  const options = setup();
  options.complete.mockResolvedValueOnce({ text: JSON.stringify({ reply: '', calls: [{ id: 'read', name: 'getbased_read_context_card', arguments: '{}' }] }) })
    .mockResolvedValueOnce({ text: JSON.stringify({ reply: 'Which period observation should be corrected?', calls: [] }) })
    .mockResolvedValueOnce({ text: JSON.stringify({ reply: 'Which period observation should be corrected?', calls: [] }) });
  const result = await runChatToolLoop({ ...options, reviewRequested: true, getPreparedReviews: () => [] });
  expect(result.text).toBe(CHAT_PROPOSAL_NONE + '\n\nWhich period observation should be corrected?');
  expect(options.execute).toHaveBeenCalledOnce(); expect(options.complete).toHaveBeenCalledTimes(3);
  expect(options.complete.mock.calls[0]![0]).toMatchObject({ jsonMode: true, jsonSchema: { properties: { calls: { minItems: 1, maxItems: 16 } } } });
  expect(options.complete.mock.calls[0]![0]).not.toHaveProperty('tools'); expect(options.complete.mock.calls[0]![0]).not.toHaveProperty('reviewRequested');
});
it('does not accept silent no-tool completion of an explicit review request', async () => {
  const options = setup(); options.complete.mockResolvedValue({ text: JSON.stringify({ reply: 'All set.', calls: [] }) });
  const result = await runChatToolLoop({ ...options, reviewRequested: true, getPreparedReviews: () => [] });
  expect(result.text).toBe(CHAT_PROPOSAL_MISSING); expect(options.complete).toHaveBeenCalledTimes(2); expect(options.execute).not.toHaveBeenCalled();
});
it('repairs malformed explicit-review prose once without reusing fabricated fields as evidence', async () => {
  const options = setup(); options.complete.mockResolvedValueOnce({ text: '### Card 1 — Invented unsupported data' })
    .mockResolvedValueOnce({ text: JSON.stringify({ reply: '### Card 1 — More invented data', calls: [] }) });
  const result = await runChatToolLoop({ ...options, reviewRequested: true, getPreparedReviews: () => [] });
  expect(result.text).toBe(CHAT_PROPOSAL_MISSING); expect(options.execute).not.toHaveBeenCalled();
  expect(JSON.stringify(options.complete.mock.calls[1]![0])).not.toContain('Invented unsupported data');
});
it.each([false, true])('cannot execute explicit-review calls after permission loss or abort: %s', abort => {
  const options = setup(), controller = new AbortController(); let current = true;
  options.complete.mockImplementation(async () => { if (abort) controller.abort(); else current = false; return { text: JSON.stringify({ reply: '', calls: [{ id: 'r', name: 'getbased_read_context_card', arguments: '{}' }] }) }; });
  return expect(runChatToolLoop({ ...options, reviewRequested: true, getPreparedReviews: () => [], isCurrent: () => current, signal: controller.signal })).rejects.toThrow().then(() => expect(options.execute).not.toHaveBeenCalled());
});

it('exposes and accepts only snapshot reads for the first explicit-review step', async () => {
  const options = setup(); options.tools.push({ type: 'function', function: { name: 'getbased_draft_context', description: 'Draft', parameters: { type: 'object' } } });
  options.complete.mockResolvedValue({ text: JSON.stringify({ reply: '', calls: [{ id: 'd', name: 'getbased_draft_context', arguments: '{}' }] }) });
  await expect(runChatToolLoop({ ...options, reviewRequested: true, getPreparedReviews: () => [] })).rejects.toThrow('unavailable tool call');
  expect(options.execute).not.toHaveBeenCalled();
  expect(options.complete.mock.calls[0]![0]).toMatchObject({ jsonSchema: { properties: { calls: { items: { properties: { name: { enum: ['getbased_read_context_card'] } } } } } } });
});
