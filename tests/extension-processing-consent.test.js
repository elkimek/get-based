// @vitest-environment jsdom
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { configureAppExtension } from '../js/app-extension-runtime.js';
import { AI_TRANSPARENCY_KEY, AI_TRANSPARENCY_VERSION, CLOUD_AI_CONSENT_KEY,
  requestAIProcessingApproval, requireAIProcessingApproval,
  withdrawAITransparencyAcknowledgement, withdrawCloudAIConsent } from '../js/cloud-ai-consent.js';

beforeEach(() => {
  document.body.innerHTML = ''; localStorage.clear();
  withdrawAITransparencyAcknowledgement(); withdrawCloudAIConsent();
  localStorage.setItem(AI_TRANSPARENCY_KEY, JSON.stringify({ version: AI_TRANSPARENCY_VERSION, acknowledged: true }));
});
afterEach(() => configureAppExtension(null));
function edition(approve = vi.fn(async () => true)) {
  configureAppExtension({ id: 'test-edition', ai: {
    isCredentialOwned: provider => provider === 'openrouter', requestProcessingApproval: approve,
  } });
  return approve;
}
it('delegates owned consent without recording the built-in recipient or showing its dialog', async () => {
  const approve = edition();
  await expect(requestAIProcessingApproval('openrouter')).resolves.toBe(true);
  await expect(requireAIProcessingApproval('openrouter')).resolves.toBe(true);
  expect(approve).toHaveBeenCalledTimes(2);
  expect(document.querySelector('#cloud-ai-consent-overlay')).toBeNull();
  expect(localStorage.getItem(CLOUD_AI_CONSENT_KEY)).toBeNull();
});
it('fails closed for a missing owned hook', async () => {
  configureAppExtension({ id: 'test-edition', ai: { isCredentialOwned: () => true } });
  await expect(requireAIProcessingApproval('openrouter')).rejects.toThrow('approval was not granted');
  expect(document.body.textContent).toBe('');
});
it('does not turn a denial or thrown error into built-in fallback', async () => {
  edition(vi.fn(async () => false));
  await expect(requestAIProcessingApproval('openrouter')).resolves.toBe(false);
  edition(vi.fn(async () => { throw new Error('unavailable'); }));
  await expect(requireAIProcessingApproval('openrouter')).rejects.toThrow('unavailable');
  expect(document.body.textContent).toBe('');
});
it('rejects an edition change during approval', async () => {
  edition(vi.fn(async () => { configureAppExtension(null); return true; }));
  await expect(requestAIProcessingApproval('openrouter')).resolves.toBe(false);
});
it('keeps automatic requests noninteractive and requires transparency first', async () => {
  const approve = edition();
  await requireAIProcessingApproval('openrouter', { kind: 'automatic-insight' });
  expect(approve).toHaveBeenCalledWith(expect.objectContaining({ interactive: false }));
  approve.mockClear(); withdrawAITransparencyAcknowledgement();
  await expect(requireAIProcessingApproval('openrouter', { kind: 'automatic-insight' })).rejects.toThrow('transparency');
  expect(approve).not.toHaveBeenCalled(); expect(document.body.textContent).toBe('');
});
it('leaves unowned BYOK consent on the core path', async () => {
  const approve = edition();
  const pending = requestAIProcessingApproval('venice');
  expect(document.querySelector('#cloud-ai-consent-overlay')?.textContent).toContain('Venice');
  document.querySelector('[data-ai-processing-action="cancel"]').click();
  await expect(pending).resolves.toBe(false); expect(approve).not.toHaveBeenCalled();
});
