import { describe, expect, it } from 'vitest';

import { CHAT_SYSTEM_PROMPT } from '../js/chat-system-prompt.js';

describe('chat marker range interpretation contract', () => {
  it('keeps routine marker answers concise while preserving range context', () => {
    expect(CHAT_SYSTEM_PROMPT).toContain('## Marker Values and Ranges');
    expect(CHAT_SYSTEM_PROMPT).toContain('Lead with one takeaway');
    expect(CHAT_SYSTEM_PROMPT).toContain('supplied range paired to its status');
    expect(CHAT_SYSTEM_PROMPT).toContain('do not list them all');
    expect(CHAT_SYSTEM_PROMPT).toContain('comparison frames, not universal truth');
    expect(CHAT_SYSTEM_PROMPT).toContain('only if it changes the conclusion');
  });

  it('allows useful outside evidence without creating an unnamed model range', () => {
    expect(CHAT_SYSTEM_PROMPT).toContain('only when asked or safety-relevant');
    expect(CHAT_SYSTEM_PROMPT).toContain('Label and cite the source and purpose');
    expect(CHAT_SYSTEM_PROMPT).toContain('never call them "model ranges."');
    expect(CHAT_SYSTEM_PROMPT).toContain('Keep uncertain recalled cutoffs secondary');
    expect(CHAT_SYSTEM_PROMPT).toContain('Never merge or replace them');
  });

  it('does not turn a missed optional target into an automatic supplement recommendation', () => {
    expect(CHAT_SYSTEM_PROMPT).toContain(
      "Name the specific form and why it fits the user's context and evidence",
    );
    expect(CHAT_SYSTEM_PROMPT).not.toContain('D3 + K2');
    expect(CHAT_SYSTEM_PROMPT).toContain(
      'Do not recommend one solely because an optional target is missed',
    );
  });
});
