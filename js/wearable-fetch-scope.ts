// Optional metric families may fail independently. An entirely failed refresh
// must not be persisted as a successful empty fetch or advance source freshness.
import { getErrorStatus } from './caught-error.js';
export function createWearableFetchScope() {
  let succeeded = false;
  const failures: unknown[] = [];
  function run<T>(request: Promise<T>, fallback: T, onFailure: (error: unknown) => void): Promise<T>;
  function run<T>(request: Promise<T>, fallback: null, onFailure: (error: unknown) => void): Promise<T | null>;
  async function run<T>(request: Promise<T>, fallback: T | null, onFailure: (error: unknown) => void): Promise<T | null> {
    try { const value = await request; succeeded = true; return value; }
    catch (error) { failures.push(error); onFailure(error); return fallback; }
  }
  return { run,
    success() { succeeded = true; },
    failure(error: unknown) { failures.push(error); },
    assertSuccessful() {
      if (!succeeded && failures.length) throw failures.find(error => getErrorStatus(error) === 401)
        || failures.find(error => getErrorStatus(error) === 403) || failures[0];
    },
  };
}
