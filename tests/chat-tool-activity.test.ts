// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { createAgentToolRuntime, getAgentToolCatalog } from '../js/agent-tool-runtime.js';
import { normalizeChatToolActivity, chatToolActivityLabel, type ChatToolActivity } from '../shared/chat-tool-activity.js';
import { normalizeChatMessages } from '../js/chat-storage-safety.js';
import { state } from '../js/state.js';
import { createChatLiveMessage, publishChatLiveText, completeChatLiveMessage } from '../js/chat-live-message-component.js';
import { renderChatTranscript, disposeChatTranscript } from '../js/chat-transcript-component.js';
import { projectChatTranscript } from '../js/chat-transcript-presentation.js';
afterEach(() => { disposeChatTranscript(); document.body.replaceChildren(); });
it('emits real running/completed events while excluding values, arguments and returned private data', async () => {
  let release!: (value: unknown) => void;
  const events: ChatToolActivity[] = [];
  const runtime = createAgentToolRuntime({ readContext: () => '', onToolActivity: event => events.push(event), readContextCard: () => new Promise(resolve => { release = resolve; }) });
  const pending = runtime.execute({ tool: 'getbased_read_context_card', arguments: { card: 'environment' } });
  expect(events).toEqual([{ id: '1', tool: 'getbased_read_context_card', card: 'environment', status: 'running' }]);
  expect(chatToolActivityLabel(events[0]!)).toBe('Read Environment & Exposures');
  release({ available: true, note: 'PRIVATE HEALTH RECORD', key: 'PRIVATE_KEY' }); await pending;
  expect(events[1]).toEqual({ ...events[0], status: 'completed' });
  expect(JSON.stringify(events)).not.toMatch(/PRIVATE|arguments|contentItems/);
});
it('records failed requests and isolates progress-render failures from tool execution', async () => {
  const events: ChatToolActivity[] = [];
  const runtime = createAgentToolRuntime({ readContext: () => '', onToolActivity: event => { events.push(event); throw new Error('UI failure'); }, readContextCard: async () => ({ available: false, reason: 'PRIVATE reason' }) });
  expect(await runtime.execute({ tool: 'getbased_read_context_card', arguments: { card: 'environment' } })).toMatchObject({ success: false });
  expect(events.map(event => event.status)).toEqual(['running', 'failed']); expect(JSON.stringify(events)).not.toContain('PRIVATE');
});
it('restores interrupted work without replaying it and rejects unsafe activity metadata', () => {
  const record = { id: '1', tool: 'getbased_read_context_card', card: 'environment', status: 'running', arguments: 'SECRET', result: 'PRIVATE' };
  expect(normalizeChatToolActivity([record])).toEqual([{ id: '1', tool: record.tool, card: 'environment', status: 'interrupted' }]);
  expect(normalizeChatToolActivity([record, record, { ...record, id: '2', tool: '<script>' }, { ...record, id: '3', status: 'saved' }])).toHaveLength(1);
  const restored = normalizeChatMessages([{ role: 'assistant', content: 'Stopped', toolActivity: [record] }])[0]!;
  expect(restored.toolActivity?.[0]?.status).toBe('interrupted'); expect(JSON.stringify(restored.toolActivity)).not.toMatch(/SECRET|PRIVATE/);
  expect(normalizeChatMessages([{ role: 'user', content: 'Example', toolActivity: [record] }])[0]?.toolActivity).toBeUndefined();
});
it('distinguishes verified zero app tools from older replies without recorded activity', () => {
  const host = document.createElement('div'); document.body.append(host);
  state.chatHistory = [{ role: 'assistant', content: 'Old answer' }, { role: 'assistant', content: 'New answer', toolActivity: [] }];
  renderChatTranscript(host, projectChatTranscript(0));
  expect(host.querySelectorAll('[data-chat-transcript-message]')[0]!.textContent).not.toContain('No app tools used');
  expect(host.querySelectorAll('[data-chat-transcript-message]')[1]!.textContent).toContain('No app tools used');
});
it('keeps real progress visible inside the live bubble and separate from response text', () => {
  const host = document.createElement('div'); document.body.append(host);
  const live = createChatLiveMessage(host, {}, () => true);
  live.setToolActivity([{ id: '1', tool: 'getbased_read_context_card', card: 'environment', status: 'running' }]);
  expect(live.element.querySelector('[data-tool-status="running"]')).not.toBeNull(); expect(live.getText()).toBe('');
  publishChatLiveText(live.element, 'Actual answer only.'); expect(live.getText()).toBe('Actual answer only.');
  completeChatLiveMessage(live.element, { role: 'assistant', content: 'Actual answer only.', toolActivity: [{ id: '1', tool: 'getbased_read_context_card', card: 'environment', status: 'completed' }] });
  expect(live.element.querySelector('[data-tool-status="completed"]')).not.toBeNull(); live.dispose();
});

it('covers every exposed app tool without accepting arbitrary model-defined labels', () => {
  const tools = getAgentToolCatalog().map((tool, index) => ({ id: String(index + 1), tool: tool.name, status: 'completed' }));
  expect(normalizeChatToolActivity(tools)).toHaveLength(tools.length);
});
