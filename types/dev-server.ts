/** Consumed operations at unchecked development-server inputs; no validation implied. */
export interface BrowserEnvironment { CI?: unknown; OPEN_BROWSER?: unknown; BROWSER?: unknown }
export interface BrowserOptions { env?: unknown; spawn?: unknown; candidates?: unknown; platform?: unknown }
export interface LaunchCandidate { command: unknown; args: Iterable<unknown> }
export interface BrowserChildOperations { once(event: string, handler: (...args: unknown[]) => void): unknown; unref?: unknown }
export type BrowserSpawnOperation = (command: unknown, args: unknown[], options: { detached: true; stdio: 'ignore' }) => BrowserChildOperations;
export interface ShareEnvelopeReader { schema?: unknown; version?: unknown; expiresAt?: unknown; kdf?: { name?: unknown; hash?: unknown; iterations?: unknown } | null; cipher?: { name?: unknown } | null; ciphertext?: unknown }
export interface ShareRecord { id: unknown; createdAt: string; expiresAt: string; manageTokenHash: string; envelope: unknown }
