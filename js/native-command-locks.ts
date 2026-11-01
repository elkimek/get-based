// Native Web Lock callbacks always fulfill with an owned outcome. Some engines
// report an already rejected callback promise globally before adopting it.
// Throw only after leaving the native callback, where the caller owns rejection.
export async function runNativeCommandWithLocks<T>(manager: Pick<LockManager, 'request'>, names: readonly string[], command: () => T | Promise<T>): Promise<T> {
  type Outcome = { ok: true; value: T } | { ok: false; error: unknown };
  async function enter(index: number): Promise<Outcome> {
    try {
      if (index === names.length) return { ok: true, value: await command() };
      return await manager.request(names[index]!, { mode: 'exclusive' }, () => enter(index + 1));
    } catch (error) { return { ok: false, error }; }
  }
  const outcome = await enter(0);
  if (!outcome.ok) throw outcome.error;
  return outcome.value;
}
