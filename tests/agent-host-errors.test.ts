import { expect, it } from 'vitest';
import { cleanError, codexTurnErrorMessage } from '../lib/agent-host-boundary.js';
it('does not expose CLI stack traces, paths, secrets, or private prompt text', () => {
  for (const value of [new Error('secret-token /home/private/report.pdf\n at private.js:45'),
    { stack: 'private-stack', message: 'health-data' }, 'private string']) {
    expect(cleanError(value)).toBe('The agent request failed. Check the Companion and selected agent, then try again.');
  }
  expect(cleanError(new Error('request_too_large'))).toBe('request_too_large');
});

it.each([
  ['badRequest', 'rejected the AI request'],
  ['unauthorized', 'could not authenticate'],
  ['rateLimitExceeded', 'rate limit'],
  ['usageLimitExceeded', 'usage limit'],
  ['contextWindowExceeded', 'context limit'],
])('classifies %s using application-owned text only', (codexErrorInfo, expected) => {
  const message = codexTurnErrorMessage({ codexErrorInfo, message: 'secret-token /home/private/report.pdf glucose: 123', additionalDetails: 'private stack' });
  expect(message).toContain(expected);
  for (const privateText of ['secret-token', '/home/private', 'glucose', 'private stack']) expect(message).not.toContain(privateText);
});

it.each([null, 'private text', [], { message: 'private text', codexErrorInfo: { unknown: 'secret-token' } }, { message: 'unsupported_value: private text' }])('keeps unclassified turn errors private: %j', error => {
  expect(codexTurnErrorMessage(error)).toBe(cleanError(null));
});

it('keeps existing application-owned errors and recognizes safe codes in RPC errors', () => {
  expect(codexTurnErrorMessage(new Error('request_too_large'))).toBe('request_too_large');
  expect(codexTurnErrorMessage(new Error('invalid_json_schema: secret-token'))).toContain('rejected the output schema');
});
