import { describe, expect, it } from 'vitest';

import { CHAT_SYSTEM_PROMPT } from '../js/chat-system-prompt.js';

describe('chat marker range interpretation contract', () => {
  it('requires date provenance for every reported measurement', () => {
    expect(CHAT_SYSTEM_PROMPT).toContain('Give every reported measurement a clear time label');
    expect(CHAT_SYSTEM_PROMPT).toContain('prefer its supplied relative age');
    expect(CHAT_SYSTEM_PROMPT).toContain('Use exact dates in tables, close event-timing comparisons, or when asked');
    expect(CHAT_SYSTEM_PROMPT).toContain('Pair listed trend values with time labels or use labeled endpoints');
    expect(CHAT_SYSTEM_PROMPT).toContain('usually show the first and latest values');
    expect(CHAT_SYSTEM_PROMPT).toContain('date not recorded');
    expect(CHAT_SYSTEM_PROMPT).toContain('Never present an old latest reading as current');
  });

  it('makes interpretation primary and supplied ranges supporting evidence', () => {
    expect(CHAT_SYSTEM_PROMPT).toContain('## Evidence and Ranges');
    expect(CHAT_SYSTEM_PROMPT).toContain('before ranges');
    expect(CHAT_SYSTEM_PROMPT).toContain('evidence, not conclusions');
    expect(CHAT_SYSTEM_PROMPT).not.toContain('supplied range paired to its status');
  });

  it('weighs clinical and broader wellness evidence without an automatic authority', () => {
    expect(CHAT_SYSTEM_PROMPT).toContain('lab/reference, getbased optimal, clinical');
    expect(CHAT_SYSTEM_PROMPT).toContain('broader research/expert frames');
    expect(CHAT_SYSTEM_PROMPT).toContain('none is automatically authoritative');
    expect(CHAT_SYSTEM_PROMPT).toContain('not institutional adoption');
    expect(CHAT_SYSTEM_PROMPT).toContain('seasonal, or expert inference');
    expect(CHAT_SYSTEM_PROMPT).toContain('Clinical evidence governs diagnostic/action claims');
    expect(CHAT_SYSTEM_PROMPT).toContain('broader evidence can support clearly labeled wellness hypotheses');
    expect(CHAT_SYSTEM_PROMPT).toContain('Never invent cutoffs');
    expect(CHAT_SYSTEM_PROMPT).toContain('statuses from different range frames must not be merged');
    expect(CHAT_SYSTEM_PROMPT).toContain('Do not rule named conditions in or out');
    expect(CHAT_SYSTEM_PROMPT).not.toContain('stronger clinical evidence');
    expect(CHAT_SYSTEM_PROMPT).not.toContain('only when asked or safety-relevant');
  });

  it('frames supplement information as educational rather than individualized advice', () => {
    expect(CHAT_SYSTEM_PROMPT).toContain(
      'educational options to review rather than commands or a personalized regimen',
    );
    expect(CHAT_SYSTEM_PROMPT).not.toContain('D3 + K2');
    expect(CHAT_SYSTEM_PROMPT).toContain('because an optional target was missed');
    expect(CHAT_SYSTEM_PROMPT).toContain('Do not give an individualized dose');
  });

  it('keeps routine replies useful and enjoyable instead of disclaimer-heavy', () => {
    expect(CHAT_SYSTEM_PROMPT).toContain('Lead with the useful takeaway, not a disclaimer');
    expect(CHAT_SYSTEM_PROMPT).toContain('Do not open or close routine replies with "I am not a doctor,"');
    expect(CHAT_SYSTEM_PROMPT).toContain('synthesize the 3–5 most meaningful patterns');
    expect(CHAT_SYSTEM_PROMPT).toContain('practical next steps');
    expect(CHAT_SYSTEM_PROMPT).toContain('A little personality or light wit is welcome');
    expect(CHAT_SYSTEM_PROMPT).toContain('walls of numbers');
  });
});
