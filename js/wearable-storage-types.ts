// Persisted wearable rows keep opaque provider fields at the storage boundary.
export interface DeviceLocalEnvelope {
  version: number;
  iv: Uint8Array<ArrayBuffer>;
  ciphertext: ArrayBuffer | Uint8Array<ArrayBuffer>;
}
export interface PassphraseEnvelope extends Record<string, unknown> { _enc?: unknown }
export interface StoredWearableRow extends Record<string, unknown> {
  source: string;
  date: string;
  importedAt?: unknown;
  _payload?: PassphraseEnvelope | null;
  _devicePayload?: DeviceLocalEnvelope | null;
}
export interface WearablesStoreCryptoDeps {
  getEncryptionEnabled: () => boolean;
  encryptObject: (value: unknown) => Promise<PassphraseEnvelope | null>;
  isEncryptedObject: (value: unknown) => boolean;
  decryptObject: (value: unknown) => Promise<Record<string, unknown> | null>;
}
export interface WearableVersionGuard { versionKey: string; expectedVersion: number }
export interface WearableDeleteOptions {
  source?: string | null;
  metaKeys?: string[];
  metaWrites?: Record<string, unknown>;
}
