// Storage-only reset shared by ordinary sync and standalone recovery.
export function clearProfileDeltaSnapshots(profileId: unknown) {
  if (typeof profileId !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(profileId)) return 0;
  const prefix = `labcharts-${profileId}-delta-`;
  const telemetryKey = `${prefix}telemetry`;
  let cleared = 0;
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (!key || key === telemetryKey || !key.startsWith(prefix)) continue;
      localStorage.removeItem(key);
      cleared++;
    }
  } catch {}
  return cleared;
}
