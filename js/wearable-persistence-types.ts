import type { OAuthConnection } from './wearable-oauth-types.js';

/** Partial profile fields used by connection persistence before normalization. */
export interface WearableConnection extends OAuthConnection {
  connectedAt?: unknown;
  lastSyncAt?: unknown;
  coverageDays?: unknown;
  hasStoredCredentials?: unknown;
  credentialGeneration?: unknown;
  needsReauth?: unknown;
  dataSourceFamily?: unknown;
}
export interface WearableProfileMutation {
  changeHistory?: Array<Record<string, unknown> | null | undefined>;
  wearableConnections?: Record<string, WearableConnection>;
  wearableSummary?: {
    metrics?: Record<string, { primarySource?: unknown } | null> | null;
    sources?: Record<string, unknown> | null;
  };
  _deleted?: Record<string, readonly unknown[] | null | undefined> | null;
  wearablePrimaryOverride?: Record<string, string>;
  [key: string]: unknown;
}
