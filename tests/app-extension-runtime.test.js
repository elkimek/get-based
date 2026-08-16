import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  authorizeAppExtensionAIRequest,
  authorizeAppExtensionVoiceRequest,
  configureAppExtension,
  getAppExtensionAIModelPolicy,
  getAppExtensionSettingsPolicy,
  getAppExtensionSyncEncryptedStorageKeys,
  getAppExtensionSyncEncryptedStoragePrefixes,
  getAppExtensionSyncStorageKeys,
  getAppExtensionSyncStoragePrefixes,
  handleAppExtensionOnboardingAction,
  handleAppExtensionSettingsAction,
  isAppExtensionAICredentialOwned,
  isAppExtensionAIProviderActive,
  isAppExtensionAvailable,
  isAppExtensionSyncEncryptedStorageKey,
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
    expect(getAppExtensionSyncEncryptedStorageKeys()).toEqual([]);
    expect(getAppExtensionSyncEncryptedStoragePrefixes()).toEqual([]);
    expect(isAppExtensionSyncEncryptedStorageKey('edition-secret')).toBe(false);
    expect(isAppExtensionAIProviderActive('openrouter')).toBe(false);
    expect(isAppExtensionAICredentialOwned('openrouter')).toBe(false);
    expect(shouldHideAppExtensionAIUsage('openrouter')).toBe(false);
    await expect(authorizeAppExtensionAIRequest({ provider: 'openrouter' })).resolves.toBe(true);
    await expect(authorizeAppExtensionVoiceRequest({ providerId: 'openrouter' })).resolves.toBe(true);
    expect(handleAppExtensionSettingsAction({ action: 'anything' })).toBe(false);
    expect(handleAppExtensionOnboardingAction({ action: 'anything' })).toBe(false);
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
        isRequestOwned: ({ providerId }) => providerId === 'openrouter',
        authorizeRequest: ({ modelId }) => modelId === 'reviewed/voice',
      },
      sync: {
        storageKeys: ['edition-key', 'edition-key'],
        storagePrefixes: () => ['edition-profile-'],
        encryptedStorageKeys: ['edition-secret', 'edition-secret'],
        encryptedStoragePrefixes: () => ['edition-encrypted-profile-'],
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
    expect(getAppExtensionSyncEncryptedStorageKeys()).toEqual(['edition-secret']);
    expect(getAppExtensionSyncEncryptedStoragePrefixes()).toEqual(['edition-encrypted-profile-']);
    expect(isAppExtensionSyncEncryptedStorageKey('edition-secret')).toBe(true);
    expect(isAppExtensionSyncEncryptedStorageKey('edition-encrypted-profile-a')).toBe(true);
    expect(isAppExtensionSyncEncryptedStorageKey('edition-profile-a')).toBe(false);
    await expect(handleAppExtensionSettingsAction({ action: 'hosted-action' })).resolves.toBe(true);
    expect(handleAppExtensionOnboardingAction({ action: 'hosted-onboarding' })).toBe(true);
    await expect(authorizeAppExtensionAIRequest({ model: 'reviewed/model' })).resolves.toBe(true);
    await expect(authorizeAppExtensionAIRequest({ model: 'other/model' })).resolves.toBe(false);
    await expect(authorizeAppExtensionVoiceRequest({ providerId: 'openrouter', modelId: 'reviewed/voice' })).resolves.toBe(true);
    await expect(authorizeAppExtensionVoiceRequest({ providerId: 'openrouter', modelId: 'other/voice' })).resolves.toBe(false);
    await expect(authorizeAppExtensionVoiceRequest({ providerId: 'browser-local', modelId: 'other/voice' })).resolves.toBe(true);

    runAppExtensionStartup({ reason: 'test' });
    await vi.waitFor(() => expect(startup).toHaveBeenCalledWith({ reason: 'test' }));
  });

  it('fails closed when an active adapter omits request authorization hooks', async () => {
    configureAppExtension({
      id: 'incomplete-edition',
      isAvailable: () => true,
      ai: { isCredentialOwned: () => true },
      voice: { isRequestOwned: () => true },
    });

    await expect(authorizeAppExtensionAIRequest({ provider: 'openrouter' })).resolves.toBe(false);
    await expect(authorizeAppExtensionVoiceRequest({ providerId: 'openrouter' })).resolves.toBe(false);
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
