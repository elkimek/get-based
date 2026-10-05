/** Parse an environment integer only when it lies within the caller's bounds. */
export function readBoundedEnvInteger(name: string, fallback: number, min: number, max: number) {
  const raw = typeof process !== 'undefined' ? process.env?.[name] : undefined;
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value >= min && value <= max ? value : fallback;
}
