import type { ProfileData } from '../../types/app-state.js';

/** One-time persisted fixture; all later summary generation/deletion uses the UI. */
export function seedChatSummaryFixture({ defaults, generate = false }: { defaults: ProfileData; generate?: boolean }) {
  if (!['http:', 'https:'].includes(location.protocol) || localStorage.getItem('chat-summary-seeded')) return;
  localStorage.setItem('chat-summary-seeded', '1');
  localStorage.setItem('labcharts-profiles', JSON.stringify([{ id: 'default', name: 'Ada', sex: 'male', dob: '1990-01-01', createdAt: 1 }]));
  localStorage.setItem('labcharts-active-profile', 'default');
  const older = { id: 'older-summary', threadId: 'older-thread', threadName: 'Older summary', content: 'Unrelated summary to preserve.', createdAt: '2026-06-01T00:00:00Z', model: 'Earlier model', attribution: 'AI-generated', cost: null };
  const current = { id: 'current-summary', threadId: 'summary-thread', threadName: 'Wellness <Plan>', content: '## Findings\nFerritin improved.\n\n- Retest vitamin D.\n\nLiteral <img src=x> & kept.', createdAt: '2026-06-02T00:00:00Z', model: 'Fixture summary model', attribution: 'Written with Grok', cost: null };
  localStorage.setItem('labcharts-default-imported', JSON.stringify({ ...defaults, chatSummaries: generate ? [older] : [older, current] }));
  localStorage.setItem('labcharts-default-chat-current-thread', 'summary-thread');
  localStorage.setItem('labcharts-default-chat-threads', JSON.stringify([
    { id: 'summary-thread', name: current.threadName, createdAt: current.createdAt, updatedAt: current.createdAt, messageCount: 4, personality: 'default', ...(generate ? {} : { summary: current.content, summaryDate: current.createdAt, summaryModel: current.model }) },
  ]));
  localStorage.setItem('labcharts-default-chat-t_summary-thread', JSON.stringify([
    { role: 'user', content: 'Please interpret my ferritin.' }, { role: 'assistant', content: 'Ferritin improved.' },
    { role: 'user', content: 'What should I do next?' }, { role: 'assistant', content: 'Retest vitamin D.' },
  ]));
}
