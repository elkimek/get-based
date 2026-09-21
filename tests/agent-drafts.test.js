import { describe, expect, it } from 'vitest';

import { renderAgentDraftCards } from '../js/agent-drafts.js';

describe('agent proposal cards', () => {
  it('renders pending proposals with explicit apply and discard actions', () => {
    const html = renderAgentDraftCards({ agentDrafts: [{
      id: 'draft-1', profileId: 'profile-1', kind: 'note', status: 'pending',
      summary: '<unsafe>', payload: { scope: 'profile', text: '<script>bad()</script>', mode: 'append' },
    }] }, 4);

    expect(html).toContain('Proposed change');
    expect(html).toContain('Review required');
    expect(html).toContain('data-chat-message-action="apply-agent-draft"');
    expect(html).toContain('data-chat-message-index="4"');
    expect(html).toContain('data-chat-message-draft-id="draft-1"');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;bad()&lt;/script&gt;');
  });

  it('renders completed proposals without another mutation button', () => {
    const html = renderAgentDraftCards({ agentDrafts: [{
      id: 'draft-2', profileId: 'profile-1', kind: 'biometric', status: 'applied',
      summary: 'Weight 80 kg', payload: { metric: 'weight', value: 80, unit: 'kg' },
    }] }, 2);

    expect(html).toContain('Applied to getbased');
    expect(html).not.toContain('apply-agent-draft');
  });
});

it('explains uncertain proposal outcomes without offering another apply action', () => {
  const html = renderAgentDraftCards({ agentDrafts: [{
    id: 'uncertain', profileId: 'profile-1', kind: 'note', status: 'failed',
    payload: { scope: 'profile', text: 'Note', mode: 'append' },
  }] }, 0);
  expect(html).toContain('Outcome unconfirmed');
  expect(html).toContain('check your data');
  expect(html).not.toContain('apply-agent-draft');
});

it.each([
  ['meal', { name: 'Reviewed lunch', mealType: 'lunch', eatenAt: '2026-09-21T12:00:00Z', nutrients: { protein: 24 }, note: '<b>Reviewed</b>' }, ['Reviewed lunch', 'protein', '24', '&lt;b&gt;Reviewed&lt;/b&gt;']],
  ['biometric', { metric: 'bp', systolic: 120, diastolic: 80, pulse: 62, date: '2026-09-21', note: '<b>Seated</b>' }, ['120/80 · pulse 62', '2026-09-21', '&lt;b&gt;Seated&lt;/b&gt;']],
  ['supplement', { type: 'medication', name: 'Reviewed medication', startDate: '2026-10-01', dosage: '<b>One daily</b>', note: 'With food' }, ['Reviewed medication', '2026-10-01', '&lt;b&gt;One daily&lt;/b&gt;', 'With food']],
])('shows the meaningful %s fields for review and escapes user text', (kind, payload, expected) => {
  const html = renderAgentDraftCards({ agentDrafts: [{ id: 'review', kind, payload, status: 'pending' }] }, 0);
  for (const value of expected) expect(html).toContain(value);
  expect(html).not.toContain('<b>');
  expect(html).toContain('apply-agent-draft');
});
it.each([['applying', 'Applying…'], ['discarded', 'Discarded']])('prevents another mutation while a proposal is %s', (status, label) => {
  const html = renderAgentDraftCards({ agentDrafts: [{ id: 'done', kind: 'note', payload: { text: 'Reviewed' }, status }] }, 0);
  expect(html).toContain(label);
  expect(html).not.toContain('apply-agent-draft');
  expect(html).not.toContain('discard-agent-draft');
});
it('omits the review section when a message contains no proposals', () => {
  expect(renderAgentDraftCards({ content: 'Normal reply' }, 0)).toBe('');
});
