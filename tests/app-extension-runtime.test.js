import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  authorizeAppExtensionAIRequest,
  authorizeAppExtensionVoiceRequest,
  configureAppExtension,
  getAppExtensionAIModelPolicy,
  getAppExtensionSettingsPolicy,
  getAppExtensionSyncStorageKeys,
  getAppExtensionSyncStoragePrefixes,
  handleAppExtensionOnboardingAction,
  handleAppExtensionSettingsAction,
  isAppExtensionAICredentialOwned,
  isAppExtensionAIProviderActive,
  isAppExtensionAvailable,
  renderAppExtensionOnboardingSlot,
  renderAppExtensionSettingsSlot,
  runAppExtensionStartup,
  shouldHideAppExtensionAIUsage,
} from '../js/app-extension-runtime.js';

afterEach(() => configureAppExtension(null));

describe('app extension runtime', () => {
  it('keeps the public core on safe no-op defaults', async () => {
    expect(isAppExtensionAvailable()).toBe(false);
    expect(renderAppExtensionSettingsSlot('tabs')).toBe('');
    expect(renderAppExtensionOnboardingSlot('provider-quiz')).toBe('');
    expect(getAppExtensionSettingsPolicy()).toEqual({});
    expect(getAppExtensionAIModelPolicy({ provider: 'openrouter' })).toBeNull();
    expect(getAppExtensionSyncStorageKeys()).toEqual([]);
    expect(getAppExtensionSyncStoragePrefixes()).toEqual([]);
    expect(isAppExtensionAIProviderActive('openrouter')).toBe(false);
    expect(isAppExtensionAICredentialOwned('openrouter')).toBe(false);
    expect(shouldHideAppExtensionAIUsage('openrouter')).toBe(false);
    await expect(authorizeAppExtensionAIRequest({ provider: 'openrouter' })).resolves.toBe(true);
    await expect(authorizeAppExtensionVoiceRequest({ providerId: 'openrouter' })).resolves.toBe(true);
    await expect(handleAppExtensionSettingsAction({ action: 'anything' })).resolves.toBe(false);
    await expect(handleAppExtensionOnboardingAction({ action: 'anything' })).resolves.toBe(false);
  });

  it('exposes one available build-time adapter through neutral hooks', async () => {
    const startup = vi.fn();
    const settingsAction = vi.fn(async ({ action }) => action === 'hosted-action');
    const onboardingAction = vi.fn(({ action }) => action === 'hosted-onboarding');
    configureAppExtension({
      id: 'test-edition',
      isAvailable: () => true,
      settings: {
        renderSlot: (slot, context) => `${slot}:${context.activeTab}`,
        getPolicy: () => ({ hideProviderSettings: true }),
        handleAction: settingsAction,
      },
      onboarding: {
        renderSlot: slot => `onboarding:${slot}`,
        handleAction: onboardingAction,
      },
      ai: {
        isProviderActive: provider => provider === 'openrouter',
        isCredentialOwned: provider => provider === 'openrouter',
        shouldHideUsage: provider => provider === 'openrouter',
        getModelPolicy: () => ({ enforced: true, allowlist: ['reviewed/model'] }),
        authorizeRequest: async ({ model }) => model === 'reviewed/model',
      },
      voice: {
        authorizeRequest: ({ modelId }) => modelId === 'reviewed/voice',
      },
      sync: {
        storageKeys: ['edition-key', 'edition-key'],
        storagePrefixes: () => ['edition-profile-'],
      },
      onStartup: startup,
    });

    expect(isAppExtensionAvailable()).toBe(true);
    expect(renderAppExtensionSettingsSlot('tabs', { activeTab: 'ai' })).toBe('tabs:ai');
    expect(renderAppExtensionOnboardingSlot('provider-quiz')).toBe('onboarding:provider-quiz');
    expect(getAppExtensionSettingsPolicy()).toEqual({ hideProviderSettings: true });
    expect(isAppExtensionAIProviderActive('openrouter')).toBe(true);
    expect(isAppExtensionAICredentialOwned('openrouter')).toBe(true);
    expect(shouldHideAppExtensionAIUsage('openrouter')).toBe(true);
    expect(getAppExtensionAIModelPolicy({ provider: 'openrouter' })).toEqual({
      enforced: true,
      allowlist: ['reviewed/model'],
    });
    expect(getAppExtensionSyncStorageKeys()).toEqual(['edition-key']);
    expect(getAppExtensionSyncStoragePrefixes()).toEqual(['edition-profile-']);
    await expect(handleAppExtensionSettingsAction({ action: 'hosted-action' })).resolves.toBe(true);
    await expect(handleAppExtensionOnboardingAction({ action: 'hosted-onboarding' })).resolves.toBe(true);
    await expect(authorizeAppExtensionAIRequest({ model: 'reviewed/model' })).resolves.toBe(true);
    await expect(authorizeAppExtensionAIRequest({ model: 'other/model' })).resolves.toBe(false);
    await expect(authorizeAppExtensionVoiceRequest({ modelId: 'reviewed/voice' })).resolves.toBe(true);
    await expect(authorizeAppExtensionVoiceRequest({ modelId: 'other/voice' })).resolves.toBe(false);

    runAppExtensionStartup({ reason: 'test' });
    await vi.waitFor(() => expect(startup).toHaveBeenCalledWith({ reason: 'test' }));
  });

  it('does not activate an adapter when its origin policy rejects the runtime', () => {
    configureAppExtension({
      id: 'disabled-edition',
      isAvailable: () => false,
      settings: { renderSlot: () => '<button>private</button>' },
      ai: { isCredentialOwned: () => true },
    });

    expect(isAppExtensionAvailable()).toBe(false);
    expect(renderAppExtensionSettingsSlot('tabs')).toBe('');
    expect(isAppExtensionAICredentialOwned('openrouter')).toBe(false);
  });

  it('rejects adapters without a stable id', () => {
    expect(() => configureAppExtension({ id: '' })).toThrow(/stable id/i);
    expect(() => configureAppExtension({ id: 'contains spaces' })).toThrow(/stable id/i);
  });
});
