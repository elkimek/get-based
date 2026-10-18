type NavigationOutcome = {kind: 'returned'; value: unknown} | {kind: 'threw'; error: unknown};
interface NavigationCompletion {
  outcome: NavigationOutcome | undefined;
  settlement: Promise<NavigationOutcome> | undefined;
  replaced: Promise<void>;
  replace(): void;
}

/** Observe route completion without wrapping the public route return value. */
export function createNavigationCompletionTracker() {
  let latest: NavigationCompletion | undefined;
  let observed: NavigationCompletion | undefined;
  const promises = new WeakMap<Promise<unknown>, NavigationCompletion>();
  let active = true;

  async function settleCurrent(first: NavigationCompletion): Promise<unknown> {
    let current = first;
    for (;;) {
      if (latest && current !== latest) current = latest;
      const outcome = current.outcome;
      // run() publishes its outcome before any asynchronous continuation. An
      // observed native Promise therefore always has a completed invocation.
      if (!outcome) throw new Error('Navigation invocation has not returned');
      const completion = current.settlement || (outcome.kind === 'threw'
        ? Promise.resolve({kind: 'threw' as const, error: outcome.error})
        : Promise.resolve(outcome.value).then(
          value => ({kind: 'returned' as const, value}),
          error => ({kind: 'threw' as const, error}),
        ));
      const result = await Promise.race([
        completion,
        current.replaced.then(() => ({kind: 'replaced' as const})),
      ]);
      // Replacement wins even if the retired route settled in the same turn.
      // Every old rejection has a handler; a stalled old import cannot keep
      // the current route's readiness blocked.
      if (current !== latest || result.kind === 'replaced') {
        if (latest) current = latest;
        continue;
      }
      if (result.kind === 'threw') throw result.error;
      observed = current;
      return result.value;
    }
  }

  return {
    isActive: () => active,
    run<Result>(navigate: () => Result): Result {
      if (!active) return navigate();
      const previous = latest;
      let replace!: () => void;
      const replaced = new Promise<void>(resolve => {replace = resolve;});
      const request: NavigationCompletion = {outcome: undefined, settlement: undefined, replaced, replace};
      latest = request;
      previous?.replace();
      try {
        const value = navigate();
        request.outcome = {kind: 'returned', value};
        if (value instanceof Promise) {
          const promise: Promise<unknown> = value;
          // Observe immediately, including routes replaced before startup's
          // first waiter runs. Keep the original Promise as the public return.
          request.settlement = promise.then(
            result => ({kind: 'returned', value: result}),
            error => ({kind: 'threw', error}),
          );
          promises.set(value, request);
        }
        return value;
      } catch (error) {
        request.outcome = {kind: 'threw', error};
        throw error;
      }
    },
    completeInitial(value: unknown): unknown {
      // Preserve synchronous/opaque injected returns and untracked Promises.
      // Genuine first-party asynchronous routes return native Promises.
      const request = active && value instanceof Promise ? promises.get(value) : undefined;
      return request ? settleCurrent(request) : value;
    },
    drain(): Promise<unknown> | undefined {
      if (!active) return undefined;
      const request = latest;
      if (!request || request === observed) {
        active = false;
        return undefined;
      }
      const outcome = request.outcome;
      if (outcome?.kind === 'threw') throw outcome.error;
      if (outcome?.kind === 'returned' && outcome.value instanceof Promise) return settleCurrent(request);
      observed = request;
      active = false;
      return undefined;
    },
  };
}
