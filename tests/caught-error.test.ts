import { describe, expect, it } from 'vitest';

import {
  getErrorCode,
  getErrorMessage,
  getErrorName,
  getErrorStatus,
} from '../js/caught-error.js';

describe('caught error normalization', () => {
  it('preserves native Error and DOMException diagnostics', () => {
    expect(getErrorMessage(new Error('request failed'))).toBe('request failed');
    expect(getErrorName(new DOMException('stopped', 'AbortError'))).toBe('AbortError');
  });

  it('supports string and plain-object throws', () => {
    expect(getErrorMessage('string failure')).toBe('string failure');
    expect(getErrorMessage({ message: 'object failure' })).toBe('object failure');
    expect(getErrorStatus({ status: '429' })).toBe(429);
    expect(getErrorCode({ code: 'token_expired' })).toBe('token_expired');
  });

  it('uses safe fallbacks for primitives and hostile accessors', () => {
    const hostile = {};
    Object.defineProperty(hostile, 'message', {
      get() {
        throw new Error('getter trap');
      },
    });

    expect(getErrorMessage(null, 'fallback')).toBe('fallback');
    expect(getErrorMessage(42, 'fallback')).toBe('fallback');
    expect(getErrorMessage(hostile, 'fallback')).toBe('fallback');
    expect(getErrorName(hostile)).toBe('');
    expect(getErrorStatus({ status: 'not-a-status' })).toBeNull();
    expect(getErrorCode({ code: {} })).toBeNull();
  });
});
