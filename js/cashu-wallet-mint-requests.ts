import { getErrorMessage } from './caught-error.js';
interface MintRequestDependencies {
  normalizeMint(value: unknown): string;
  getMeta(key: string): Promise<unknown>;
  setMeta(key: string, value: unknown): Promise<void>;
}
/** Share retry policy across wallet proof, funding and recovery requests. */
export function createMintRequestGuard(deps: MintRequestDependencies) {
  /** Shared mint cooldown. Call while holding the wallet lock. */
  async function withMintRequest<Result>(mint: string, request: () => Promise<Result>) {
    const key = 'mintRetryAt:' + deps.normalizeMint(mint);
    const until = Number(await deps.getMeta(key)) || 0;
    if (until > Date.now()) {
      const error = Object.assign(new Error('The mint requested a pause. Retrying automatically.'), { status: 429, retryAfterMs: until - Date.now() });
      throw error;
    }
    try { return await request(); }
    catch (error) {
      const details = error as { status?: unknown; statusCode?: unknown; retryAfterMs?: unknown; name?: unknown } | null;
      const status = Number(details?.status ?? details?.statusCode);
      const retry = Number(details?.retryAfterMs);
      if (status === 429 || details?.name === 'RateLimitError' || (Number.isFinite(retry) && retry > 0)) {
        const wait = Math.max(60000, Number.isFinite(retry) ? retry : 0);
        await deps.setMeta(key, Math.max(until, Date.now() + wait));
        // Preserve the actual cooldown, including our conservative default.
        throw Object.assign(new Error(getErrorMessage(error)), { status: status || 429, retryAfterMs: wait });
      }
      throw error;
    }
  }

  return withMintRequest;
}
