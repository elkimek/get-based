async function recoveryWait<T>(operation: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([operation, new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error('Offline recovery tools did not become ready. Check the connection and browser service-worker permissions, then retry. The source data is unchanged.')), 15000);
    })]);
  } finally {clearTimeout(timer);}
}
export async function withMigrationLock<T>(name: string, operation: () => Promise<T>): Promise<T> {
  if (!navigator.locks) throw new Error('Recovery requires HTTPS and browser-wide storage locks.');
  const controller = new AbortController();
  let acquired = false;
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    return await navigator.locks.request(name, {mode: 'exclusive', signal: controller.signal}, async () => {
      acquired = true; clearTimeout(timer); return operation();
    });
  } catch (error) {
    if (!acquired && controller.signal.aborted) throw new Error('An ongoing getbased operation still holds its data lock. Close other windows, let pending saves finish and retry. The source data is unchanged.');
    throw error;
  } finally {clearTimeout(timer);}
}

export async function requireSingleMigrationClient(): Promise<void> {
  if (!navigator.serviceWorker || !navigator.locks) throw new Error('Recovery needs a secure browser with service workers and browser-wide storage locks. Open the HTTPS address in a current browser.');
  const existing = await recoveryWait(navigator.serviceWorker.getRegistration('/'));
  const registration = existing?.active ? existing : await recoveryWait(navigator.serviceWorker.register('/service-worker.js', {updateViaCache: 'none'}));
  if (!registration.active) await recoveryWait(navigator.serviceWorker.ready);
  const worker = registration.active;
  if (!worker) throw new Error('Recovery tools are still installing. Wait a moment and retry.');
  const count = await new Promise<number>((resolve, reject) => {
    const channel = new MessageChannel();
    const timeout = setTimeout(() => {channel.port1.close(); reject(new Error('Close every getbased tab and installed window, then reopen this recovery page to finish updating the recovery tools.'));}, 5000);
    channel.port1.onmessage = event => {
      clearTimeout(timeout); channel.port1.close();
      const value = event.data as {type?: unknown; windows?: unknown};
      if (value.type !== 'MIGRATION_CLIENT_CENSUS' || !Number.isSafeInteger(value.windows)) reject(new Error('The recovery client check failed.'));
      else resolve(Number(value.windows));
    };
    worker.postMessage({type: 'MIGRATION_CLIENT_CENSUS'}, [channel.port2]);
  });
  if (count !== 1) throw new Error('Close every other getbased tab and installed window on this website, then retry here. Your data is unchanged.');
}
