// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';

import {
  HOSTED_WEARABLE_CONSENT_KEY,
  HOSTED_WEARABLE_CONSENT_VERSION,
  getHostedWearableConsentRecord,
  hasHostedWearableRelayConsent,
  requestHostedWearableRelayConsent,
  withdrawHostedWearableRelayConsent,
} from '../js/wearable-relay-consent.js';

function consentControls() {
  const checkbox = document.getElementById('wearable-relay-consent-checkbox');
  const approve = document.querySelector('[data-wearable-relay-consent-action="approve"]');
  const cancel = document.querySelector('[data-wearable-relay-consent-action="cancel"]');
  return { checkbox, approve, cancel };
}

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  for (const adapterId of ['oura', 'withings', 'polar', 'fitbit']) {
    withdrawHostedWearableRelayConsent(adapterId);
  }
});

describe('hosted wearable relay consent', () => {
  it('requires an unticked provider-specific explicit statement', async () => {
    const pending = requestHostedWearableRelayConsent('withings', 'Withings');
    const overlay = document.getElementById('wearable-relay-consent-overlay');
    expect(overlay).not.toBeNull();
    expect(overlay.textContent).toContain('getbased s.r.o.');
    expect(overlay.textContent).toContain('account details and health readings you choose');
    expect(overlay.textContent).toContain('Encrypted sync and cloud AI are separate choices');
    expect(overlay.textContent).toContain('Disconnect Withings to stop imports');

    const { checkbox, approve } = consentControls();
    expect(checkbox.checked).toBe(false);
    expect(approve.disabled).toBe(true);
    expect(approve.textContent).toBe('Continue to Withings');

    checkbox.click();
    expect(approve.disabled).toBe(false);
    approve.click();
    await expect(pending).resolves.toBe(true);

    expect(hasHostedWearableRelayConsent('withings')).toBe(true);
    expect(hasHostedWearableRelayConsent('polar')).toBe(false);
    expect(getHostedWearableConsentRecord()).toMatchObject({
      version: HOSTED_WEARABLE_CONSENT_VERSION,
      approvals: {
        withings: {
          accepted: true,
          provider: 'withings',
          recipient: 'Withings',
          controller: 'getbased s.r.o.',
        },
      },
    });
    expect(getHostedWearableConsentRecord().approvals.withings.acceptedAt)
      .toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('does not save approval when the user declines', async () => {
    const pending = requestHostedWearableRelayConsent('polar', 'Polar');
    consentControls().cancel.click();
    await expect(pending).resolves.toBe(false);
    expect(hasHostedWearableRelayConsent('polar')).toBe(false);
    expect(localStorage.getItem(HOSTED_WEARABLE_CONSENT_KEY)).toBeNull();
  });

  it('reuses ongoing approval and asks again after withdrawal', async () => {
    const first = requestHostedWearableRelayConsent('oura', 'Oura');
    const { checkbox, approve } = consentControls();
    checkbox.click();
    approve.click();
    await first;

    await expect(requestHostedWearableRelayConsent('oura', 'Oura')).resolves.toBe(true);
    expect(document.getElementById('wearable-relay-consent-overlay')).toBeNull();

    withdrawHostedWearableRelayConsent('oura');
    expect(hasHostedWearableRelayConsent('oura')).toBe(false);
    const retry = requestHostedWearableRelayConsent('oura', 'Oura');
    expect(document.getElementById('wearable-relay-consent-overlay')).not.toBeNull();
    consentControls().cancel.click();
    await expect(retry).resolves.toBe(false);
  });

  it('treats Escape as refusal', async () => {
    const pending = requestHostedWearableRelayConsent('fitbit', 'Fitbit');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await expect(pending).resolves.toBe(false);
    expect(document.getElementById('wearable-relay-consent-overlay')).toBeNull();
  });
});
