// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CLOUD_AI_CONSENT_KEY,
  CLOUD_AI_CONSENT_VERSION,
  hasCloudAIConsent,
  requestCloudAIConsent,
  requireCloudAIConsent,
  withdrawCloudAIConsent,
} from '../js/cloud-ai-consent.js';
import { directTranscription } from '../js/voice-provider-cloud-shared.js';

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  withdrawCloudAIConsent();
  vi.restoreAllMocks();
});

function consentControls() {
  const checkbox = document.getElementById('cloud-ai-consent-checkbox');
  const approve = document.querySelector('[data-cloud-ai-consent-action="approve"]');
  const cancel = document.querySelector('[data-cloud-ai-consent-action="cancel"]');
  return { checkbox, approve, cancel };
}

describe('cloud AI explicit consent', () => {
  it('does not gate Local AI', async () => {
    await expect(requestCloudAIConsent('ollama')).resolves.toBe(true);
    expect(document.getElementById('cloud-ai-consent-overlay')).toBeNull();
    expect(localStorage.getItem(CLOUD_AI_CONSENT_KEY)).toBeNull();
  });

  it('requires an unchecked express approval and scopes it to the provider', async () => {
    const pending = requestCloudAIConsent('openrouter', { kind: 'text' });
    const overlay = document.getElementById('cloud-ai-consent-overlay');
    expect(overlay).not.toBeNull();
    expect(overlay.textContent).toContain('OpenRouter');
    const { checkbox, approve } = consentControls();
    expect(checkbox.checked).toBe(false);
    expect(approve.disabled).toBe(true);

    checkbox.click();
    expect(approve.disabled).toBe(false);
    approve.click();
    await expect(pending).resolves.toBe(true);

    expect(hasCloudAIConsent('openrouter')).toBe(true);
    expect(hasCloudAIConsent('ppq')).toBe(false);
    const stored = JSON.parse(localStorage.getItem(CLOUD_AI_CONSENT_KEY));
    expect(stored.version).toBe(CLOUD_AI_CONSENT_VERSION);
    expect(stored.approvals.openrouter).toMatchObject({
      accepted: true,
      provider: 'openrouter',
    });
    expect(stored.approvals.openrouter.acceptedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('keeps data on-device when refused and sends no cloud voice request', async () => {
    globalThis.fetch = vi.fn();
    const pending = directTranscription('elevenlabs', {
      audio: new Blob(['audio'], { type: 'audio/webm' }),
      apiKey: 'user-owned-key',
      modelId: 'scribe_v2',
    });
    expect(globalThis.fetch).not.toHaveBeenCalled();
    consentControls().cancel.click();
    await expect(pending).rejects.toThrow('No request was sent');
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(hasCloudAIConsent('elevenlabs')).toBe(false);
  });

  it('makes withdrawal one action and requires approval again', async () => {
    const pending = requestCloudAIConsent('ppq');
    const { checkbox, approve } = consentControls();
    checkbox.click();
    approve.click();
    await pending;
    expect(hasCloudAIConsent('ppq')).toBe(true);

    withdrawCloudAIConsent();
    expect(hasCloudAIConsent('ppq')).toBe(false);
    expect(localStorage.getItem(CLOUD_AI_CONSENT_KEY)).toBeNull();

    const retry = requireCloudAIConsent('ppq');
    consentControls().cancel.click();
    await expect(retry).rejects.toMatchObject({ name: 'CloudAIConsentDeclinedError' });
  });
});
