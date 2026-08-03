import { describe, expect, it } from 'vitest';

import {
  compareAndSetBlob,
  getBlob,
  setBlob,
} from '../js/blob-storage.js';
import {
  commitProfileMigrationWithRecovery,
  estimateMigrationRecoveryBytes,
  listMigrationRecoverySnapshots,
  preflightMigrationRecoveryStorage,
  prepareMigrationRecoverySnapshot,
  reconcileMigrationRecoverySnapshot,
  rollbackProfileMigration,
  withProfileMigrationLock,
} from '../js/migration-recovery-store.js';

const ampleEstimate = async () => ({ usage: 1024, quota: 100 * 1024 * 1024 });

function profileKey(label) {
  return `labcharts-recovery-${label}-${crypto.randomUUID()}-imported`;
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readRawRecoveryStorage(snapshotId) {
  const db = await requestResult(indexedDB.open('labcharts-migration-recovery'));
  const snapshotTx = db.transaction('snapshots', 'readonly');
  const snapshot = await requestResult(snapshotTx.objectStore('snapshots').get(snapshotId));
  const keyTx = db.transaction('device-keys', 'readonly');
  const key = await requestResult(
    keyTx.objectStore('device-keys').get('migration-recovery-aes-key:v1'),
  );
  db.close();
  return { snapshot, key };
}

describe('migration recovery storage preflight', () => {
  it('budgets for the encrypted previous value, replacement value, and IDB overhead', () => {
    const sizes = estimateMigrationRecoveryBytes('a'.repeat(1000), 'b'.repeat(2000));

    expect(sizes.previousBytes).toBe(1000);
    expect(sizes.nextBytes).toBe(2000);
    expect(sizes.requiredBytes).toBeGreaterThan(3000);
  });

  it('refuses before writing when reported storage headroom is insufficient', async () => {
    const key = profileKey('quota');
    const previousValue = JSON.stringify({ secret: 'quota-old' });
    const nextValue = JSON.stringify({ secret: 'quota-new' });
    await setBlob(key, previousValue);

    const preflight = await preflightMigrationRecoveryStorage(previousValue, nextValue, {
      estimate: async () => ({ usage: 999_999, quota: 1_000_000 }),
    });
    const result = await commitProfileMigrationWithRecovery({
      profileKey: key,
      previousValue,
      nextValue,
      fromVersion: 0,
      toVersion: 1,
      estimate: async () => ({ usage: 999_999, quota: 1_000_000 }),
    });

    expect(preflight).toMatchObject({ ok: false, supported: true });
    expect(result).toMatchObject({
      ok: false,
      error: { code: 'RECOVERY_STORAGE_INSUFFICIENT' },
    });
    expect(await getBlob(key)).toBe(previousValue);
    expect(await listMigrationRecoverySnapshots(key)).toEqual([]);
  });

  it('rejects corrupt-copy keys and no-op replacements before storage access', async () => {
    const value = JSON.stringify({ schemaVersion: 0 });
    const corruptCopy = await prepareMigrationRecoverySnapshot({
      profileKey: `${profileKey('invalid')}-corrupt`,
      previousValue: value,
      nextValue: JSON.stringify({ schemaVersion: 1 }),
      fromVersion: 0,
      toVersion: 1,
      estimate: ampleEstimate,
    });
    const noOp = await commitProfileMigrationWithRecovery({
      profileKey: profileKey('no-op'),
      previousValue: value,
      nextValue: value,
      fromVersion: 0,
      toVersion: 1,
      estimate: ampleEstimate,
    });

    expect(corruptCopy).toMatchObject({ ok: false, error: { code: 'RECOVERY_INPUT_INVALID' } });
    expect(noOp).toMatchObject({ ok: false, error: { code: 'RECOVERY_INPUT_INVALID' } });
  });
});

describe('encrypted migration recovery lifecycle', () => {
  it('commits with an encrypted non-extractable snapshot and rolls back exactly', async () => {
    const key = profileKey('roundtrip');
    const previousValue = JSON.stringify({ secret: 'private-before-value', schemaVersion: 0 });
    const nextValue = JSON.stringify({ secret: 'private-after-value', schemaVersion: 1 });
    await setBlob(key, previousValue);

    const committed = await commitProfileMigrationWithRecovery({
      profileKey: key,
      previousValue,
      nextValue,
      fromVersion: 0,
      toVersion: 1,
      estimate: ampleEstimate,
    });

    expect(committed).toMatchObject({ ok: true, journalStatus: 'committed' });
    expect(await getBlob(key)).toBe(nextValue);
    const metadata = await listMigrationRecoverySnapshots(key);
    expect(metadata).toHaveLength(1);
    expect(metadata[0]).toMatchObject({
      id: committed.snapshotId,
      status: 'committed',
      fromVersion: 0,
      toVersion: 1,
    });
    expect(metadata[0]).not.toHaveProperty('envelope');

    const raw = await readRawRecoveryStorage(committed.snapshotId);
    expect(JSON.stringify(raw.snapshot)).not.toContain('private-before-value');
    expect(JSON.stringify(raw.snapshot)).not.toContain('private-after-value');
    expect(raw.key).toMatchObject({ type: 'secret', extractable: false });

    const rolledBack = await rollbackProfileMigration(committed.snapshotId);
    expect(rolledBack).toMatchObject({ ok: true, journalStatus: 'rolled-back' });
    expect(await getBlob(key)).toBe(previousValue);
    expect((await listMigrationRecoverySnapshots(key))[0].status).toBe('rolled-back');
  });

  it('refuses a stale commit without changing the active profile', async () => {
    const key = profileKey('conflict');
    const callerValue = JSON.stringify({ revision: 1 });
    const concurrentValue = JSON.stringify({ revision: 2 });
    const migratedValue = JSON.stringify({ revision: 1, schemaVersion: 1 });
    await setBlob(key, concurrentValue);

    const result = await commitProfileMigrationWithRecovery({
      profileKey: key,
      previousValue: callerValue,
      nextValue: migratedValue,
      fromVersion: 0,
      toVersion: 1,
      estimate: ampleEstimate,
    });

    expect(result).toMatchObject({ ok: false, error: { code: 'RECOVERY_COMMIT_CONFLICT' } });
    expect(await getBlob(key)).toBe(concurrentValue);
    expect(await listMigrationRecoverySnapshots(key)).toEqual([]);
  });

  it('reconciles both interrupted-before-write and interrupted-after-write journals', async () => {
    const beforeKey = profileKey('prepared-before');
    const beforeValue = JSON.stringify({ state: 'old-before' });
    const beforeNext = JSON.stringify({ state: 'new-before' });
    await setBlob(beforeKey, beforeValue);
    const preparedBefore = await prepareMigrationRecoverySnapshot({
      profileKey: beforeKey,
      previousValue: beforeValue,
      nextValue: beforeNext,
      fromVersion: 0,
      toVersion: 1,
      estimate: ampleEstimate,
    });

    const beforeResult = await reconcileMigrationRecoverySnapshot(preparedBefore.snapshotId);
    expect(beforeResult).toMatchObject({ ok: true, outcome: 'rolled-back' });
    expect(await getBlob(beforeKey)).toBe(beforeValue);

    const afterKey = profileKey('prepared-after');
    const afterValue = JSON.stringify({ state: 'old-after' });
    const afterNext = JSON.stringify({ state: 'new-after' });
    await setBlob(afterKey, afterValue);
    const preparedAfter = await prepareMigrationRecoverySnapshot({
      profileKey: afterKey,
      previousValue: afterValue,
      nextValue: afterNext,
      fromVersion: 0,
      toVersion: 1,
      estimate: ampleEstimate,
    });
    await compareAndSetBlob(afterKey, afterValue, afterNext);

    const afterResult = await reconcileMigrationRecoverySnapshot(preparedAfter.snapshotId);
    expect(afterResult).toMatchObject({ ok: true, outcome: 'committed' });
    expect(await getBlob(afterKey)).toBe(afterNext);
  });

  it('refuses automatic rollback after a later profile edit', async () => {
    const key = profileKey('later-edit');
    const previousValue = JSON.stringify({ revision: 1 });
    const migratedValue = JSON.stringify({ revision: 1, schemaVersion: 1 });
    const laterValue = JSON.stringify({ revision: 2, schemaVersion: 1 });
    await setBlob(key, previousValue);
    const committed = await commitProfileMigrationWithRecovery({
      profileKey: key,
      previousValue,
      nextValue: migratedValue,
      fromVersion: 0,
      toVersion: 1,
      estimate: ampleEstimate,
    });
    await setBlob(key, laterValue);

    const result = await rollbackProfileMigration(committed.snapshotId);
    expect(result).toMatchObject({
      ok: false,
      error: { code: 'RECOVERY_CURRENT_VALUE_CHANGED' },
    });
    expect(await getBlob(key)).toBe(laterValue);
  });
});

describe('profile migration lock fallback', () => {
  it('serializes same-profile callbacks when Navigator Locks is unavailable', async () => {
    const key = profileKey('lock');
    const order = [];
    let releaseFirst;
    const firstGate = new Promise(resolve => { releaseFirst = resolve; });
    const first = withProfileMigrationLock(key, async () => {
      order.push('first-start');
      await firstGate;
      order.push('first-end');
    });
    await Promise.resolve();
    const second = withProfileMigrationLock(key, async () => {
      order.push('second');
    });
    await Promise.resolve();

    expect(order).toEqual(['first-start']);
    releaseFirst();
    await Promise.all([first, second]);
    expect(order).toEqual(['first-start', 'first-end', 'second']);
  });
});
