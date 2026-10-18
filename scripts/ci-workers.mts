import { availableParallelism } from 'node:os';

/** Leave a CPU for the server and browser subprocesses; stateful suites stay serial. */
export function chromiumWorkers(environment: NodeJS.ProcessEnv = process.env, cpus = availableParallelism()): number {
  if (!Number.isSafeInteger(cpus) || cpus < 1) throw new Error('CPU parallelism must be a positive integer');
  const requested = environment['GETBASED_CHROMIUM_WORKERS'];
  if (requested !== undefined) {
    if (!/^[1-9]\d*$/.test(requested)) throw new Error('GETBASED_CHROMIUM_WORKERS must be a positive integer');
    const workers = Number(requested);
    if (!Number.isSafeInteger(workers) || workers > cpus) throw new Error('GETBASED_CHROMIUM_WORKERS cannot exceed available CPU parallelism');
    return workers;
  }
  return Math.max(1, Math.min(2, cpus - 1));
}
