import {encodeMigrationValue} from './migration-codec.js';
// Retain a fixed-size receipt between source captures and destination reads.
export async function migrationDigest(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(encodeMigrationValue(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
