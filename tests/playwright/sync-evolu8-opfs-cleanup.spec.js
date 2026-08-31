import { expect, test } from '@playwright/test';

test('v8 cleanup removes only unlocked superseded OPFS generations', async ({ page }) => {
  await page.goto('/');

  const result = await page.evaluate(async () => {
    const {
      cleanupSupersededEvolu8Databases,
    } = await import('/js/sync-evolu8-candidate.js');
    const suffix = `${Date.now()}_${crypto.randomUUID().replaceAll('-', '_')}`;
    // Exercise the unsuffixed configured appName form. Unit coverage also
    // exercises current Evolu's owner-suffixed tenant directory form.
    const active = 'getbased8g3';
    const stale = 'getbased8g2';
    const locked = 'getbased8g1';
    const legacy = `.getbased4-${suffix}`;
    const root = await navigator.storage.getDirectory();
    const created = [`.${active}`, `.${stale}`, `.${locked}`, legacy];

    try {
      for (const name of created) {
        const directory = await root.getDirectoryHandle(name, { create: true });
        const file = await directory.getFileHandle('sentinel', { create: true });
        const writable = await file.createWritable();
        await writable.write(name);
        await writable.close();
      }

      let releaseLock;
      let markLockAcquired;
      const lockAcquired = new Promise(resolve => { markLockAcquired = resolve; });
      const holdLock = new Promise(resolve => { releaseLock = resolve; });
      const lockRequest = navigator.locks.request(
        `evolu-leaderlock-${locked}`,
        { mode: 'exclusive' },
        async () => {
          markLockAcquired();
          await holdLock;
        },
      );
      await lockAcquired;

      const cleanupResult = await cleanupSupersededEvolu8Databases({ activeDatabaseName: active });
      const namesAfterCleanup = [];
      for await (const name of root.keys()) namesAfterCleanup.push(name);

      releaseLock();
      await lockRequest;
      return { active, stale, locked, legacy, cleanupResult, namesAfterCleanup };
    } finally {
      for (const name of created) {
        await root.removeEntry(name, { recursive: true }).catch(() => {});
      }
    }
  });

  expect(result.cleanupResult).toEqual({
    deleted: [result.stale],
    skipped: [result.locked],
  });
  expect(result.namesAfterCleanup).toContain(`.${result.active}`);
  expect(result.namesAfterCleanup).not.toContain(`.${result.stale}`);
  expect(result.namesAfterCleanup).toContain(`.${result.locked}`);
  expect(result.namesAfterCleanup).toContain(result.legacy);
});
