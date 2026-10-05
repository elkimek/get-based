import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  logPrivacyDiagnostic,
  sanitizePrivacyDiagnostic,
} from '../js/privacy-safe-diagnostics.js';

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('privacy-safe diagnostics', () => {
  it('keeps bounded metadata and drops content-bearing values', () => {
    const rawReport = 'Patient: Jane Example\nGlucose: 96 mg/dL';
    const safe = sanitizePrivacyDiagnostic({
      method: 'ollama+review',
      durationMs: 1280,
      replacements: 4,
      inputChars: rawReport.length,
      outputChars: 42,
      errorName: rawReport,
      stage: rawReport,
      fileName: 'Jane Example lab.pdf',
      originalText: rawReport,
      nested: { report: rawReport },
      invalidNumber: Number.NaN,
      pageCount: '12',
      fileIndex: Symbol('patient-index'),
    });

    expect(safe).toEqual({
      method: 'ollama+review',
      durationMs: 1280,
      replacements: 4,
      inputChars: rawReport.length,
      outputChars: 42,
    });
    expect(JSON.stringify(safe)).not.toContain('Jane');
    expect(Object.isFrozen(safe)).toBe(true);
  });

  it('does not emit until debug mode is explicitly enabled', () => {
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});

    expect(logPrivacyDiagnostic('transform-complete', { inputChars: 100 })).toBeNull();
    expect(debug).not.toHaveBeenCalled();

    localStorage.setItem('labcharts-debug', 'true');
    expect(logPrivacyDiagnostic('Patient Jane Example', {
      inputChars: 100,
      fileName: 'Private Patient.pdf',
    })).toEqual({ inputChars: 100 });
    expect(debug).toHaveBeenCalledWith(
      '[privacy] event',
      { inputChars: 100 },
    );
  });
});
