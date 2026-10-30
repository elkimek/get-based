interface PreparedWriteProtection {
  usesNativeWriter: (key: string) => boolean;
  isSensitiveKey: (key: string) => boolean;
  encryptionEnabled: () => boolean;
  sessionKey: () => CryptoKey | null;
  encryptValue: (key: CryptoKey, value: string) => Promise<string>;
}

/** Capture protection identity as well as bytes; a retired preparation cannot commit. */
export function createPreparedLocalStorageValue(protection: PreparedWriteProtection) {
  return async (key: string, value: string) => {
    if (protection.usesNativeWriter(key)) throw new Error('This storage key requires its native storage writer.');
    const enabled = protection.encryptionEnabled(), sessionKey = protection.sessionKey();
    if (protection.isSensitiveKey(key) && enabled && !sessionKey) throw new Error('Profile storage is locked; unlock encryption before saving.');
    const stored = protection.isSensitiveKey(key) && enabled && sessionKey ? await protection.encryptValue(sessionKey, value) : value;
    return { value: stored, isCurrent: () => enabled === protection.encryptionEnabled() && sessionKey === protection.sessionKey() };
  };
}
