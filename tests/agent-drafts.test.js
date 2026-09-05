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
