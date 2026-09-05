import { expect, it } from 'vitest';
import { cleanError } from '../lib/agent-host-boundary.js';
it('does not expose CLI stack traces, paths, secrets, or private prompt text', () => {
  for (const value of [new Error('secret-token /home/private/report.pdf\n at private.js:45'),
    { stack: 'private-stack', message: 'health-data' }, 'private string']) {
    expect(cleanError(value)).toBe('The agent request failed. Check the Companion and selected agent, then try again.');
  }
  expect(cleanError(new Error('request_too_large'))).toBe('request_too_large');
});
