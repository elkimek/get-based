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
it('keeps zero-call and older ordinary replies free of activity UI while retaining their distinct metadata', () => {
  const host = document.createElement('div'); document.body.append(host);
  state.chatHistory = [{ role: 'assistant', content: 'Old answer' }, { role: 'assistant', content: 'New answer', toolActivity: [] }];
  renderChatTranscript(host, projectChatTranscript(0));
  expect(host.querySelector('[data-chat-tool-activity]')).toBeNull();
  expect(host.textContent).not.toContain('No app tools used');
  const restored = normalizeChatMessages(state.chatHistory);
  expect(restored[0]?.toolActivity).toBeUndefined(); expect(restored[1]?.toolActivity).toEqual([]);
});
it('shows generation progress outside the bubble, hides the empty bubble, and collapses finished activity', () => {
  const host = document.createElement('div'); document.body.append(host);
  const live = createChatLiveMessage(host, {}, () => true);
  live.setToolActivity([{ id: '1', tool: 'getbased_read_context_card', card: 'environment', status: 'running' }]);
  const activity = host.querySelector<HTMLDetailsElement>('[data-chat-tool-activity]')!;
  expect(activity.querySelector('[data-tool-status="running"]')).not.toBeNull();
  expect(activity.querySelector('summary')?.textContent).toContain('Reading Environment & Exposures');
  expect(live.element.querySelector('[data-chat-tool-activity]')).toBeNull();
  expect(activity.closest('.chat-msg')).toBeNull(); expect(live.element.style.display).toBe('none');
  expect(activity.compareDocumentPosition(live.element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(live.getText()).toBe(''); activity.open = true;
  publishChatLiveText(live.element, 'Actual answer only.'); expect(live.getText()).toBe('Actual answer only.');
  expect(live.element.style.display).toBe('');
  completeChatLiveMessage(live.element, { role: 'assistant', content: 'Actual answer only.', toolActivity: [{ id: '1', tool: 'getbased_read_context_card', card: 'environment', status: 'completed' }] });
  expect(activity.open).toBe(false); expect(activity.querySelector('summary')?.textContent).toContain('1 action completed');
  expect(host.querySelector('[data-tool-status="completed"]')).not.toBeNull();
  expect(live.element.textContent).not.toContain('App activity'); live.dispose();
});
it.each(['failed', 'interrupted'] as const)('preserves a visible %s summary outside restored response text', status => {
  const host = document.createElement('div'); document.body.append(host);
  state.chatHistory = [{ role: 'assistant', content: 'An ordinary reply.', toolActivity: [{ id: '1', tool: 'getbased_read_context_card', card: 'environment', status }] }];
  renderChatTranscript(host, projectChatTranscript(0));
  const activity = host.querySelector('[data-chat-tool-activity]')!;
  expect(activity.querySelector('summary')?.textContent).toContain(status === 'failed' ? 'Action needs attention' : 'Action interrupted');
  expect(activity.closest('.chat-msg')).toBeNull();
  expect(host.querySelector('.chat-msg')?.textContent).not.toMatch(/Action needs attention|Action interrupted|Read Environment/);
});

it('covers every exposed app tool without accepting arbitrary model-defined labels', () => {
  const tools = getAgentToolCatalog().map((tool, index) => ({ id: String(index + 1), tool: tool.name, status: 'completed' }));
  expect(normalizeChatToolActivity(tools)).toHaveLength(tools.length);
});
