// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AI_ROUTE_CONFIRMATION_KEY,
  AI_TRANSPARENCY_KEY,
  AI_TRANSPARENCY_VERSION,
  CLOUD_AI_CONSENT_KEY,
  CLOUD_AI_CONSENT_VERSION,
  cloudAIConsentDetails,
  hasAcknowledgedAITransparency,
  hasAIRouteConfirmation,
  hasCloudAIConsent,
  requestAIProviderActivation,
  requestAIProcessingApproval,
  requestAITransparencyAcknowledgement,
  requireAIProcessingApproval,
  requireCloudAIConsent,
  withdrawAIRouteConfirmations,
  withdrawAITransparencyAcknowledgement,
  withdrawCloudAIConsent,
} from '../js/cloud-ai-consent.js';
import { setCustomApiUrl } from '../js/api-provider-storage.js';
import { updateKeyCache } from '../js/crypto-key-cache.js';
import { getSupplementaryDeploymentPolicy } from '../js/deployment-policy.js';
import { directTranscription } from '../js/voice-provider-cloud-shared.js';

const realLocation = globalThis.location;
const realFetch = globalThis.fetch;

function seedTransparency() {
  localStorage.setItem(AI_TRANSPARENCY_KEY, JSON.stringify({
    version: AI_TRANSPARENCY_VERSION,
    acknowledged: true,
    acknowledgedAt: '2026-08-31T00:00:00.000Z',
  }));
}

function decisionControls(overlayId) {
  const overlay = document.getElementById(overlayId);
  const checkbox = overlay?.querySelector('input[type="checkbox"]');
  const approve = overlay?.querySelector('[data-ai-processing-action="approve"]');
  const cancel = overlay?.querySelector('[data-ai-processing-action="cancel"]');
  return { overlay, checkbox, approve, cancel };
}

function approve(overlayId) {
  const controls = decisionControls(overlayId);
  controls.checkbox.click();
  controls.approve.click();
}

beforeEach(() => {
  document.head.querySelectorAll('meta[name^="getbased-operator-"]').forEach(node => node.remove());
  document.body.innerHTML = '';
  localStorage.clear();
  withdrawCloudAIConsent();
  withdrawAIRouteConfirmations();
  withdrawAITransparencyAcknowledgement();
  updateKeyCache('labcharts-ollama', JSON.stringify({
    url: 'http://localhost:11434',
    model: 'llama3.2',
    apiKey: '',
  }));
  vi.stubGlobal('location', {
    hostname: 'selfhost.example',
    origin: 'https://selfhost.example',
    pathname: '/app',
  });
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.stubGlobal('location', realLocation);
  globalThis.fetch = realFetch;
  delete globalThis.GETBASED_DEPLOYMENT_CONFIG;
});

describe('AI transparency and route-aware approval', () => {
  it('stores provider-neutral AI transparency separately and discloses automatic requests', async () => {
    const pending = requestAITransparencyAcknowledgement();
    const { overlay, checkbox, approve: approveButton } = decisionControls('ai-transparency-overlay');
    expect(overlay.textContent).toContain('AI output is generated or altered by AI');
    expect(overlay.textContent).toContain('automatic insights may make later requests');
    expect(checkbox.checked).toBe(false);
    expect(approveButton.disabled).toBe(true);
    approve('ai-transparency-overlay');
    await expect(pending).resolves.toBe(true);

    expect(hasAcknowledgedAITransparency()).toBe(true);
    expect(JSON.parse(localStorage.getItem(AI_TRANSPARENCY_KEY))).toMatchObject({
      version: AI_TRANSPARENCY_VERSION,
      acknowledged: true,
    });
    expect(localStorage.getItem(CLOUD_AI_CONSENT_KEY)).toBeNull();
  });

  it('shows only the transparency notice for same-device Ollama inference', async () => {
    const pending = requestAIProcessingApproval('ollama');
    expect(document.getElementById('ai-transparency-overlay')).not.toBeNull();
    approve('ai-transparency-overlay');
    await expect(pending).resolves.toBe(true);
    expect(document.getElementById('cloud-ai-consent-overlay')).toBeNull();
    expect(document.getElementById('ai-route-confirmation-overlay')).toBeNull();
    expect(localStorage.getItem(CLOUD_AI_CONSENT_KEY)).toBeNull();
    expect(localStorage.getItem(AI_ROUTE_CONFIRMATION_KEY)).toBeNull();
  });

  it('combines first remote activation into one decision while storing separate records', async () => {
    const pending = requestAIProviderActivation('openrouter');
    const { overlay } = decisionControls('cloud-ai-consent-overlay');
    expect(document.getElementById('ai-transparency-overlay')).toBeNull();
    expect(overlay.textContent).toContain('The connection check succeeded');
    expect(overlay.textContent).toContain('AI-generated output may be incomplete or inaccurate');
    expect(overlay.textContent).toContain('automatic AI insight requests');
    expect(overlay.textContent).toContain('health, genetic, biometric');
    approve('cloud-ai-consent-overlay');
    await expect(pending).resolves.toBe(true);

    expect(hasAcknowledgedAITransparency()).toBe(true);
    expect(hasCloudAIConsent('openrouter')).toBe(true);
    expect(localStorage.getItem(AI_TRANSPARENCY_KEY)).not.toBeNull();
    expect(localStorage.getItem(CLOUD_AI_CONSENT_KEY)).not.toBeNull();
  });

  it('combines first activation with an origin-scoped private-network confirmation', async () => {
    updateKeyCache('labcharts-ollama', JSON.stringify({
      url: 'http://192.168.1.44:11434',
      model: 'llama3.2',
      apiKey: '',
    }));
    const pending = requestAIProviderActivation('ollama');
    const { overlay } = decisionControls('ai-route-confirmation-overlay');
    expect(document.getElementById('ai-transparency-overlay')).toBeNull();
    expect(overlay.textContent).toContain('The connection check succeeded');
    expect(overlay.textContent).toContain('192.168.1.44:11434');
    expect(overlay.textContent).toContain('leave this browser device');
    expect(overlay.querySelectorAll('a')).toHaveLength(0);
    expect(localStorage.getItem(CLOUD_AI_CONSENT_KEY)).toBeNull();
    approve('ai-route-confirmation-overlay');
    await expect(pending).resolves.toBe(true);
    expect(hasAIRouteConfirmation('ollama')).toBe(true);

    updateKeyCache('labcharts-ollama', JSON.stringify({
      url: 'http://192.168.1.45:11434',
      model: 'llama3.2',
      apiKey: '',
    }));
    expect(hasAIRouteConfirmation('ollama')).toBe(false);
  });

  it('treats a cloud-tagged Ollama model as remote even through loopback', () => {
    expect(cloudAIConsentDetails('ollama', { modelId: 'gpt-oss:120b-cloud' })).toMatchObject({
      boundary: 'remote',
      required: true,
      label: 'Ollama Cloud',
      privacyUrl: 'https://ollama.com/privacy',
      termsUrl: 'https://ollama.com/terms',
    });
  });

  it('selects API-specific processing and terms links for remote voice providers', () => {
    expect(cloudAIConsentDetails('xai')).toMatchObject({
      privacyUrl: 'https://x.ai/legal/data-processing-addendum',
      termsUrl: 'https://x.ai/legal/terms-of-service-enterprise',
    });
    expect(cloudAIConsentDetails('elevenlabs')).toMatchObject({
      privacyUrl: 'https://elevenlabs.io/dpa',
      termsUrl: 'https://elevenlabs.io/elevenapi-terms',
    });
  });

  it('uses provider policies without a getbased fallback on an independent self-host', async () => {
    seedTransparency();
    const pending = requestAIProcessingApproval('openrouter');
    const { overlay } = decisionControls('cloud-ai-consent-overlay');
    const hrefs = [...overlay.querySelectorAll('a')].map(link => link.href);
    expect(hrefs).toContain('https://openrouter.ai/privacy');
    expect(hrefs).toContain('https://openrouter.ai/terms');
    expect(hrefs.some(href => href.includes('getbased.health'))).toBe(false);
    expect(overlay.textContent).not.toContain('agree to OpenRouter');
    decisionControls('cloud-ai-consent-overlay').cancel.click();
    await expect(pending).resolves.toBe(false);
  });

  it('adds getbased policies only as supplementary links on the official host', async () => {
    vi.stubGlobal('location', {
      hostname: 'app.getbased.health',
      origin: 'https://app.getbased.health',
      pathname: '/app',
    });
    expect(getSupplementaryDeploymentPolicy()).toMatchObject({ name: 'getbased' });
    seedTransparency();
    const pending = requestAIProcessingApproval('openrouter');
    const { overlay } = decisionControls('cloud-ai-consent-overlay');
    const hrefs = [...overlay.querySelectorAll('a')].map(link => link.href);
    expect(hrefs).toEqual(expect.arrayContaining([
      'https://openrouter.ai/privacy',
      'https://openrouter.ai/terms',
      'https://getbased.health/privacy',
      'https://getbased.health/terms',
    ]));
    expect(overlay.textContent).toContain('Supplementary getbased policies');
    decisionControls('cloud-ai-consent-overlay').cancel.click();
    await pending;
  });

  it('identifies the selected Routstr node without implying protocol-level policies or terms', async () => {
    vi.stubGlobal('location', {
      hostname: 'app.getbased.health',
      origin: 'https://app.getbased.health',
      pathname: '/app',
    });
    globalThis.GETBASED_DEPLOYMENT_CONFIG = {
      aiProviders: {
        routstr: {
          label: 'Misleading static Routstr recipient',
          privacyUrl: 'https://example.test/privacy',
          termsUrl: 'https://example.test/terms',
        },
      },
    };
    localStorage.setItem('labcharts-routstr-node', 'https://node.example.test/v1');
    seedTransparency();

    const details = cloudAIConsentDetails('routstr');
    expect(details).toMatchObject({
      label: 'the Routstr node at https://node.example.test',
      origin: 'https://node.example.test',
      privacyUrl: '',
      termsUrl: '',
    });

    const pending = requestAIProcessingApproval('routstr');
    const { overlay } = decisionControls('cloud-ai-consent-overlay');
    expect(overlay.textContent).toContain('Routstr is a decentralized protocol, not the recipient');
    expect(overlay.textContent).toContain('node may publish no privacy policy or terms');
    expect(overlay.textContent).toContain('getbased app policies (these do not govern the selected Routstr node)');
    expect(overlay.textContent).not.toContain('Misleading static Routstr recipient');
    expect([...overlay.querySelectorAll('a')].map(link => link.href)).toEqual([
      'https://getbased.health/privacy',
      'https://getbased.health/terms',
    ]);
    decisionControls('cloud-ai-consent-overlay').cancel.click();
    await pending;
  });

  it('adds a configured independent deployment operator without replacing provider policies', async () => {
    globalThis.GETBASED_DEPLOYMENT_CONFIG = {
      operator: {
        name: 'Community Health Cooperative',
        privacyUrl: 'https://health.example/privacy',
        termsUrl: 'https://health.example/terms',
      },
    };
    seedTransparency();
    const pending = requestAIProcessingApproval('openrouter');
    const { overlay } = decisionControls('cloud-ai-consent-overlay');
    expect(overlay.textContent).toContain('Supplementary Community Health Cooperative policies');
    expect([...overlay.querySelectorAll('a')].map(link => link.href)).toEqual([
      'https://openrouter.ai/privacy',
      'https://openrouter.ai/terms',
      'https://health.example/privacy',
      'https://health.example/terms',
    ]);
    decisionControls('cloud-ai-consent-overlay').cancel.click();
    await pending;
  });

  it('identifies a remote custom endpoint by origin without asking the user for policy metadata', async () => {
    seedTransparency();
    setCustomApiUrl('https://inference.example/v1');
    const pending = requestAIProcessingApproval('custom');
    const { overlay } = decisionControls('cloud-ai-consent-overlay');
    expect(overlay.textContent).toContain('the custom API at https://inference.example');
    expect([...overlay.querySelectorAll('a')]).toHaveLength(0);
    approve('cloud-ai-consent-overlay');
    await pending;
    expect(hasCloudAIConsent('custom')).toBe(true);

    setCustomApiUrl('https://other.example/v1');
    expect(hasCloudAIConsent('custom')).toBe(false);
  });

  it('uses deployment-level recipient metadata for a managed custom endpoint', async () => {
    globalThis.GETBASED_DEPLOYMENT_CONFIG = {
      aiProviders: {
        custom: {
          label: 'Example Inference Cooperative',
          privacyUrl: 'https://inference.example/privacy',
          termsUrl: 'https://inference.example/terms',
        },
      },
    };
    seedTransparency();
    setCustomApiUrl('https://inference.example/v1');
    const pending = requestAIProcessingApproval('custom');
    const { overlay } = decisionControls('cloud-ai-consent-overlay');
    expect(overlay.textContent).toContain('Example Inference Cooperative');
    expect([...overlay.querySelectorAll('a')].map(link => link.href)).toEqual([
      'https://inference.example/privacy',
      'https://inference.example/terms',
    ]);
    decisionControls('cloud-ai-consent-overlay').cancel.click();
    await pending;
  });

  it('accurately scopes an automatic request and persists provider approval', async () => {
    seedTransparency();
    const pending = requestAIProcessingApproval('ppq', { kind: 'automatic-insight' });
    const { overlay } = decisionControls('cloud-ai-consent-overlay');
    expect(overlay.textContent).toContain('automatic AI insight after relevant profile or data changes');
    expect(overlay.textContent).toContain('later requests to the same recipient');
    approve('cloud-ai-consent-overlay');
    await pending;

    const stored = JSON.parse(localStorage.getItem(CLOUD_AI_CONSENT_KEY));
    expect(stored.version).toBe(CLOUD_AI_CONSENT_VERSION);
    expect(stored.approvals.ppq).toMatchObject({
      accepted: true,
      provider: 'ppq',
      recipient: 'PPQ',
    });
    expect(stored.approvals.ppq.purpose).toContain('automatic insights');
    expect(hasCloudAIConsent('openrouter')).toBe(false);
  });

  it('does not interrupt an automatic request with an activation prompt', async () => {
    seedTransparency();
    await expect(requireAIProcessingApproval('ppq', { kind: 'automatic-insight' }))
      .rejects.toMatchObject({ name: 'CloudAIConsentDeclinedError' });
    expect(document.getElementById('cloud-ai-consent-overlay')).toBeNull();
    expect(document.getElementById('ai-transparency-overlay')).toBeNull();
  });

  it('prompts once for each new provider and not again when returning to an approved provider', async () => {
    const first = requestAIProviderActivation('openrouter');
    approve('cloud-ai-consent-overlay');
    await first;

    const switched = requestAIProviderActivation('ppq');
    const { overlay } = decisionControls('cloud-ai-consent-overlay');
    expect(overlay.textContent).toContain('PPQ');
    expect(overlay.textContent).toContain('The connection check succeeded');
    expect(overlay.textContent).not.toContain('AI-generated output may be incomplete');
    approve('cloud-ai-consent-overlay');
    await switched;

    await expect(requestAIProviderActivation('openrouter')).resolves.toBe(true);
    expect(document.getElementById('cloud-ai-consent-overlay')).toBeNull();
  });

  it('withdraws remote approval without erasing the transparency record', async () => {
    seedTransparency();
    const pending = requestAIProcessingApproval('venice');
    approve('cloud-ai-consent-overlay');
    await pending;
    expect(hasCloudAIConsent('venice')).toBe(true);

    withdrawCloudAIConsent();
    expect(hasCloudAIConsent('venice')).toBe(false);
    expect(hasAcknowledgedAITransparency()).toBe(true);
    expect(localStorage.getItem(CLOUD_AI_CONSENT_KEY)).toBeNull();

    const retry = requireCloudAIConsent('venice');
    decisionControls('cloud-ai-consent-overlay').cancel.click();
    await expect(retry).rejects.toMatchObject({ name: 'CloudAIConsentDeclinedError' });
  });

  it('sends zero voice requests when remote sensitive-data approval is declined', async () => {
    seedTransparency();
    globalThis.fetch = vi.fn();
    const pending = directTranscription('elevenlabs', {
      audio: new Blob(['audio'], { type: 'audio/webm' }),
      apiKey: 'user-owned-key',
      modelId: 'scribe_v2',
    });
    expect(globalThis.fetch).not.toHaveBeenCalled();
    decisionControls('cloud-ai-consent-overlay').cancel.click();
    await expect(pending).rejects.toThrow('No request was sent');
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('restores focus after a destination decision', async () => {
    seedTransparency();
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();
    const pending = requestAIProcessingApproval('openrouter');
    decisionControls('cloud-ai-consent-overlay').cancel.click();
    await pending;
    expect(document.activeElement).toBe(trigger);
  });
});
