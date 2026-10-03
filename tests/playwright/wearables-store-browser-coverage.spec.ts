import { expect, test } from './coverage-fixture.js';

test('wearables store browser coverage handles rows raw backup metadata and database lifecycle', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const results = await page.evaluate(async () => {
    const store = await import('/js/wearables-store.js');
    const failures: string[] = [];
    const check = (name: string, condition: unknown, detail: unknown = '') => {
      if (!condition) failures.push(detail ? `${name}: ${detail}` : name);
    };
    const profileId = `wearables-store-coverage-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    try {
      await store.deleteWearablesDB(profileId).catch(() => {});

      let validationMessage: unknown = '';
      try {
        await (store.upsertDaily as unknown as (profileId: Parameters<typeof store.upsertDaily>[0], rows: Partial<Parameters<typeof store.upsertDaily>[1]>, ...rest: Parameters<typeof store.upsertDaily> extends [unknown, unknown, ...infer Rest] ? Rest : never) => ReturnType<typeof store.upsertDaily>)(profileId, { source: 'oura' });
      } catch (error) {
        validationMessage = (error as {message?:unknown}|null|undefined)?.message || String(error);
      }
      check('upsertDaily validates source and date fields',
        (validationMessage as string).includes('upsertDaily requires {source, date}'));

      await (store.upsertDaily as unknown as (profileId: Parameters<typeof store.upsertDaily>[0], rows: Partial<Parameters<typeof store.upsertDaily>[1]>, ...rest: Parameters<typeof store.upsertDaily> extends [unknown, unknown, ...infer Rest] ? Rest : never) => ReturnType<typeof store.upsertDaily>)(profileId, {
        source: 'oura',
        date: '2026-06-01',
        hrv_rmssd: 44,
        rhr: 54,
      });
      const firstRead = await store.getDaily(profileId, 'oura', '2026-06-01');
      check('upsertDaily round-trips a browser IndexedDB row',
        firstRead?.source === 'oura'
        && firstRead?.date === '2026-06-01'
        && firstRead?.hrv_rmssd === 44
        && typeof firstRead?.importedAt === 'number');

      await (store.upsertDailyBatch as unknown as (profileId: Parameters<typeof store.upsertDailyBatch>[0], rows: readonly (Partial<NonNullable<Parameters<typeof store.upsertDailyBatch>[1][number]>> | null | undefined)[], ...rest: Parameters<typeof store.upsertDailyBatch> extends [unknown, unknown, ...infer Rest] ? Rest : never) => ReturnType<typeof store.upsertDailyBatch>)(profileId, [
        { source: 'oura', date: '2026-06-01', hrv_rmssd: null, rhr: 52, steps: 3200 },
        { source: 'oura', date: '2026-06-02', hrv_rmssd: 47, rhr: 51 },
        { source: 'oura' },
        null,
      ]);
      const merged = await store.getDaily(profileId, 'oura', '2026-06-01');
      const range = await store.getDailyRange(profileId, 'oura', '2026-06-01', '2026-06-30');
      const countAfterBatch = await store.countSource(profileId, 'oura');
      check('upsertDailyBatch preserves existing non-null fields and merges incoming values',
        merged?.hrv_rmssd === 44
        && merged?.rhr === 52
        && merged?.steps === 3200);
      check('getDailyRange returns inclusive source rows in chronological order',
        range.length === 2
        && range[0]!.date === '2026-06-01'
        && range[1]!.date === '2026-06-02');
      check('countSource ignores invalid batch rows',
        countAfterBatch === 2);

      await store.deleteDaily(profileId, 'oura', '2026-06-02');
      const afterDelete = await store.getDaily(profileId, 'oura', '2026-06-02');
      const countAfterDelete = await store.countSource(profileId, 'oura');
      check('deleteDaily removes one compound-key row',
        afterDelete == null && countAfterDelete === 1);

      await (store.upsertDailyBatchRaw as unknown as (profileId: Parameters<typeof store.upsertDailyBatchRaw>[0], rows: readonly (Partial<NonNullable<Parameters<typeof store.upsertDailyBatchRaw>[1][number]>> | null | undefined)[], ...rest: Parameters<typeof store.upsertDailyBatchRaw> extends [unknown, unknown, ...infer Rest] ? Rest : never) => ReturnType<typeof store.upsertDailyBatchRaw>)(profileId, [
        { source: 'backup', date: '2026-05-01', hrv_rmssd: 33, _raw: { vendor: 'fixture' } },
        { source: 'backup' },
        null,
      ]);
      const rawRows = await store.getDailyRangeRaw(profileId, 'backup', '2026-05-01', '2026-05-01') as {_raw?:{vendor?:unknown}|null}[];
      const restoredRows = await store.getDailyRange(profileId, 'backup', '2026-05-01', '2026-05-01');
      check('raw backup APIs preserve stored row shape',
        rawRows.length === 1
        && rawRows[0]!._raw?.vendor === 'fixture'
        && restoredRows.length === 1
        && restoredRows[0]!.hrv_rmssd === 33);

      await store.setMeta(profileId, 'last-sync:oura', { at: 12345, rows: 2 });
      const meta = await store.getMeta(profileId, 'last-sync:oura') as {at?:unknown;rows?:unknown}|null|undefined;
      await store.deleteMeta(profileId, 'last-sync:oura');
      const metaAfterDelete = await store.getMeta(profileId, 'last-sync:oura');
      check('meta kv supports set get and delete',
        meta?.at === 12345 && meta?.rows === 2 && metaAfterDelete == null);

      await store.clearSource(profileId, 'oura');
      const ouraCount = await store.countSource(profileId, 'oura');
      const backupCount = await store.countSource(profileId, 'backup');
      check('clearSource removes one source without touching others',
        ouraCount === 0 && backupCount === 1);

      const db1 = await store.openWearablesDB(profileId);
      db1.close();
      store.resetWearablesDB(profileId);
      const db2 = await store.openWearablesDB(profileId);
      check('resetWearablesDB evicts the cached connection promise',
        db2 !== db1 && db2.name.includes(profileId));
      db2.close();

      await store.deleteWearablesDB(profileId);
      const afterDbDelete = await store.getDailyRange(profileId, 'backup', '2026-05-01', '2026-05-01');
      check('deleteWearablesDB removes the profile database',
        afterDbDelete.length === 0);
    } finally {
      await store.deleteWearablesDB(profileId).catch(() => {});
    }

    return failures;
  });

  expect(results).toEqual([]);
});

test('wearables store browser coverage rejects IndexedDB request and transaction failures', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const results = await page.evaluate(async () => {
    const failures: string[] = [];
    const check = (name: string, condition: unknown, detail: unknown = '') => {
      if (!condition) failures.push(detail ? `${name}: ${detail}` : name);
    };
    const originalIndexedDB = Object.getOwnPropertyDescriptor(window, 'indexedDB');
    let mode = 'open-error';

    const requestError = () => {
      const req = {
        result: null,
        error: new Error(`${mode} request failed`),
        onsuccess: null as null | (() => unknown),
        onerror: null as null | (() => unknown),
        onupgradeneeded: null as null | (() => unknown),
      };
      setTimeout(() => req.onerror?.(), 0);
      return req;
    };
    const successRequest = <Result>(result:Result) => {
      const req = {
        result,
        error: null,
        onsuccess: null as null | (() => unknown),
        onerror: null as null | (() => unknown),
        onupgradeneeded: null as null | (() => unknown),
      };
      setTimeout(() => req.onsuccess?.(), 0);
      return req;
    };
    const makeTx = () => {
      const tx = {
        error: mode === 'tx-abort' ? null : new Error(`${mode} transaction failed`),
        oncomplete: null as null | (() => unknown),
        onerror: null as null | (() => unknown),
        onabort: null as null | (() => unknown),
        objectStore: () => ({
          put: () => {
            setTimeout(() => {
              if (mode === 'tx-abort') tx.onabort?.();
              else tx.onerror?.();
            }, 0);
          },
          delete: () => {
            setTimeout(() => {
              if (mode === 'tx-abort') tx.onabort?.();
              else tx.onerror?.();
            }, 0);
          },
          get: () => requestError(),
          openCursor: () => requestError(),
          index: () => ({
            count: () => requestError(),
            openCursor: () => requestError(),
          }),
        }),
      };
      return tx;
    };
    const fakeDb = {
      name: 'fake-wearables-error-db',
      close() {},
      transaction: () => makeTx(),
    };
    const fakeIndexedDB = {
      open: () => mode === 'open-error' ? requestError() : successRequest(fakeDb),
      deleteDatabase: () => successRequest(undefined),
    };

    try {
      Object.defineProperty(window, 'indexedDB', {
        configurable: true,
        value: fakeIndexedDB,
      });
      const store = await ((import(`/js/wearables-store.js?errorCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`) as Promise<unknown>) as Promise<Pick<typeof import("../../js/wearables-store.js"), "deleteWearablesDB" | "upsertDaily" | "getDaily" | "upsertDailyBatch" | "getDailyRange" | "countSource" | "deleteDaily" | "upsertDailyBatchRaw" | "getDailyRangeRaw" | "setMeta" | "getMeta" | "deleteMeta" | "clearSource" | "openWearablesDB" | "resetWearablesDB"> >);

      const openError = await store.openWearablesDB('open-fails')
        .then(() => '', (error:unknown) => (error as {message?:unknown}|null|undefined)?.message || String(error));
      check('openWearablesDB rejects when indexedDB.open errors',
        (openError as string).includes('open-error request failed'), openError);

      mode = 'tx-error';
      const txError = await (store.upsertDaily as unknown as (profileId: Parameters<typeof store.upsertDaily>[0], rows: Partial<Parameters<typeof store.upsertDaily>[1]>, ...rest: Parameters<typeof store.upsertDaily> extends [unknown, unknown, ...infer Rest] ? Rest : never) => ReturnType<typeof store.upsertDaily>)('fake-profile', { source: 'oura', date: '2026-06-01' })
        .then(() => '', (error:unknown) => (error as {message?:unknown}|null|undefined)?.message || String(error));
      check('txPromise rejects transaction error callbacks',
        (txError as string).includes('tx-error transaction failed'), txError);

      mode = 'tx-abort';
      const abortError = await store.deleteDaily('fake-profile', 'oura', '2026-06-01')
        .then(() => '', (error:unknown) => (error as {message?:unknown}|null|undefined)?.message || String(error));
      check('txPromise rejects transaction abort callbacks',
        (abortError as string).includes('Transaction aborted'), abortError);

      mode = 'batch-read-error';
      const batchError = await (store.upsertDailyBatch as unknown as (profileId: Parameters<typeof store.upsertDailyBatch>[0], rows: readonly (Partial<NonNullable<Parameters<typeof store.upsertDailyBatch>[1][number]>> | null | undefined)[], ...rest: Parameters<typeof store.upsertDailyBatch> extends [unknown, unknown, ...infer Rest] ? Rest : never) => ReturnType<typeof store.upsertDailyBatch>)('fake-profile', [{ source: 'oura', date: '2026-06-02' }])
        .then(() => '', (error:unknown) => (error as {message?:unknown}|null|undefined)?.message || String(error));
      check('upsertDailyBatch rejects row read request errors',
        (batchError as string).includes('batch-read-error request failed'), batchError);

      mode = 'get-error';
      const getError = await store.getDaily('fake-profile', 'oura', '2026-06-02')
        .then(() => '', (error:unknown) => (error as {message?:unknown}|null|undefined)?.message || String(error));
      check('getDaily rejects request errors',
        (getError as string).includes('get-error request failed'), getError);

      mode = 'range-error';
      const rangeError = await store.getDailyRangeRaw('fake-profile', 'oura', '2026-06-01', '2026-06-30')
        .then(() => '', (error:unknown) => (error as {message?:unknown}|null|undefined)?.message || String(error));
      check('getDailyRangeRaw rejects cursor request errors',
        (rangeError as string).includes('range-error request failed'), rangeError);
      const decryptedRangeError = await store.getDailyRange('fake-profile', 'oura', '2026-06-01', '2026-06-30')
        .then(() => '', (error:unknown) => (error as {message?:unknown}|null|undefined)?.message || String(error));
      check('getDailyRange rejects cursor request errors',
        (decryptedRangeError as string).includes('range-error request failed'), decryptedRangeError);

      mode = 'count-error';
      const countError = await store.countSource('fake-profile', 'oura')
        .then(() => '', (error:unknown) => (error as {message?:unknown}|null|undefined)?.message || String(error));
      check('countSource rejects index count request errors',
        (countError as string).includes('count-error request failed'), countError);
    } finally {
      if (originalIndexedDB) Object.defineProperty(window, 'indexedDB', originalIndexedDB);
      else delete (window as {indexedDB?:unknown}).indexedDB;
    }

    return failures;
  });

  expect(results).toEqual([]);
});
