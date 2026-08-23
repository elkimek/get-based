import { describe, expect, it } from 'vitest';

import { CHAT_SYSTEM_PROMPT } from '../js/constants.js';

describe('chat marker range interpretation contract', () => {
  it('keeps routine marker answers concise while preserving range context', () => {
    expect(CHAT_SYSTEM_PROMPT).toContain('## Marker Values and Ranges');
    expect(CHAT_SYSTEM_PROMPT).toContain('Lead with one useful takeaway');
    expect(CHAT_SYSTEM_PROMPT).toContain('Do not recite every available range');
    expect(CHAT_SYSTEM_PROMPT).toContain('named comparison frame, not universal medical truth');
    expect(CHAT_SYSTEM_PROMPT).toContain('compress the contrast into one plain sentence');
    expect(CHAT_SYSTEM_PROMPT).toContain('Do not repeat ranges that lead to the same conclusion');
  });

  it('allows useful outside evidence without creating an unnamed model range', () => {
    expect(CHAT_SYSTEM_PROMPT).toContain('when the user asks about alternatives, sources, or range validity');
    expect(CHAT_SYSTEM_PROMPT).toContain('materially changes a safety-relevant interpretation');
    expect(CHAT_SYSTEM_PROMPT).toContain('Label it as external guidance');
    expect(CHAT_SYSTEM_PROMPT).toContain('Never present a threshold recalled from training as a "model range."');
    expect(CHAT_SYSTEM_PROMPT).toContain('Without a verifiable source, state the uncertainty');
    expect(CHAT_SYSTEM_PROMPT).toContain('Never silently substitute, merge, or relabel ranges');
  });

  it('does not turn a missed optional target into an automatic supplement recommendation', () => {
    expect(CHAT_SYSTEM_PROMPT).toContain(
      'Do not recommend a supplement solely because a value misses an optional optimal band',
    );
  });
});
