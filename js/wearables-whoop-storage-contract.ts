// Shared no-op eligibility; keep the existing literal-token storage boundary exact.
export const DEVICE_PROTECTED_WEARABLE_MARKER = '_deviceProtectedWearableProfile';
const WHOOP_SOURCE_TOKEN = '"whoop"';
const WHOOP_STORAGE_MARKER_TOKEN = `"${DEVICE_PROTECTED_WEARABLE_MARKER}"`;

/** A token may occur outside wearable fields; those values still take the full transformer path. */
export function hasWhoopStorageDataToken(value: unknown): value is string {
  return typeof value === 'string'
    && (value.includes(WHOOP_SOURCE_TOKEN) || value.includes(WHOOP_STORAGE_MARKER_TOKEN));
}
