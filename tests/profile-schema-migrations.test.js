import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  CURRENT_PROFILE_SCHEMA_VERSION,
  PROFILE_MIGRATION_REGISTRY,
  runProfileMigrationsInShadow,
  validateProfileMigrationRegistry,
} from '../js/profile-schema-migrations.js';

const FIXTURE_NAMES = [
  'pre-v1.6.json',
  'v1.7-structured-context.json',
  'current-unversioned.json',
];

function loadProfileFixture(name = 'current-unversioned.json') {
  const fixtureUrl = new URL(`./fixtures/profile-migrations/${name}`, import.meta.url);
  return JSON.parse(readFileSync(fileURLToPath(fixtureUrl), 'utf8')).profile;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

describe('profile schema migration registry', () => {
  it('defines a valid sequential registry through the current schema', () => {
    expect(validateProfileMigrationRegistry()).toEqual({ ok: true });
    expect(PROFILE_MIGRATION_REGISTRY).toHaveLength(CURRENT_PROFILE_SCHEMA_VERSION);
    expect(PROFILE_MIGRATION_REGISTRY[0]).toMatchObject({
      fromVersion: 0,
      toVersion: 1,
    });
  });

  it('rejects duplicate and non-sequential registry steps', () => {
    const migrate = () => {};
    expect(validateProfileMigrationRegistry([
      { id: 'invalid-jump', fromVersion: 0, toVersion: 2, migrate },
    ])).toEqual({ ok: false, reason: 'STEP_NOT_SEQUENTIAL' });
    expect(validateProfileMigrationRegistry([
      { id: 'first-step', fromVersion: 0, toVersion: 1, migrate },
      { id: 'duplicate-step', fromVersion: 0, toVersion: 1, migrate },
    ])).toEqual({ ok: false, reason: 'STEP_DUPLICATE_SOURCE' });
  });
});

describe('shadow profile migrations', () => {
  it.each(FIXTURE_NAMES)('validates the %s historical profile through the registry', name => {
    const profile = loadProfileFixture(name);
    const original = clone(profile);
    const result = runProfileMigrationsInShadow(profile);

    expect(result.ok).toBe(true);
    expect(profile).toEqual(original);
    expect(result.data.schemaVersion).toBe(CURRENT_PROFILE_SCHEMA_VERSION);
    expect(result.validation.counts.entries).toBe(original.entries.length);
    expect(result.validation.counts.notes).toBe(original.notes.length);
  });

  it('migrates an unversioned profile on a detached copy', () => {
    const profile = loadProfileFixture();
    const original = clone(profile);
    const result = runProfileMigrationsInShadow(profile);

    expect(result.ok).toBe(true);
    expect(profile).toEqual(original);
    expect(result.data).not.toBe(profile);
    expect(result.data.schemaVersion).toBe(CURRENT_PROFILE_SCHEMA_VERSION);
    expect(result.appliedMigrations).toEqual([
      { id: 'profile-v0-to-v1-normalize', fromVersion: 0, toVersion: 1 },
    ]);
    expect(result.validation.counts.entries).toBe(1);
    expect(result.validation.counts.notes).toBe(1);
    expect(result.data.currentUnknownSurface).toEqual(original.currentUnknownSurface);
  });

  it('is deterministic and idempotent without reusing object references', () => {
    const profile = loadProfileFixture();
    const first = runProfileMigrationsInShadow(profile);
    const independent = runProfileMigrationsInShadow(profile);
    const repeated = runProfileMigrationsInShadow(first.data);

    expect(first).toEqual(independent);
    expect(repeated.ok).toBe(true);
    expect(repeated.changed).toBe(false);
    expect(repeated.appliedMigrations).toEqual([]);
    expect(repeated.data).toEqual(first.data);
    expect(repeated.data).not.toBe(first.data);
  });

  it('fills only missing baseline collections and preserves existing identities', () => {
    const profile = loadProfileFixture();
    delete profile.supplements;
    const result = runProfileMigrationsInShadow(profile);

    expect(result.ok).toBe(true);
    expect(result.data.supplements).toEqual([]);
    expect(result.data.entries[0].id).toBe('entry_current_001');
    expect(result.data.notes[0].id).toBe('note_current_001');
    expect(result.validation.identifiedRecords).toBe(2);
  });

  it('fails closed for invalid and future schema versions', () => {
    const invalid = runProfileMigrationsInShadow({ ...loadProfileFixture(), schemaVersion: -1 });
    const future = runProfileMigrationsInShadow({ ...loadProfileFixture(), schemaVersion: 99 });
    const legacyTarget = runProfileMigrationsInShadow(loadProfileFixture(), { targetVersion: 0 });

    expect(invalid).toMatchObject({ ok: false, error: { code: 'PROFILE_SCHEMA_VERSION_INVALID' } });
    expect(future).toMatchObject({ ok: false, error: { code: 'PROFILE_SCHEMA_VERSION_FUTURE' } });
    expect(legacyTarget).toMatchObject({ ok: false, error: { code: 'PROFILE_TARGET_VERSION_INVALID' } });
    expect(invalid).not.toHaveProperty('data');
    expect(future).not.toHaveProperty('data');
  });

  it('fails closed when a sequential migration step is missing', () => {
    const result = runProfileMigrationsInShadow(loadProfileFixture(), { registry: [] });

    expect(result).toMatchObject({
      ok: false,
      error: { code: 'MIGRATION_STEP_MISSING', fromVersion: 0 },
    });
    expect(result).not.toHaveProperty('data');
  });

  it('discards a failed migration draft without mutating the input', () => {
    const profile = loadProfileFixture();
    const original = clone(profile);
    const result = runProfileMigrationsInShadow(profile, {
      registry: [{
        id: 'throwing-step',
        fromVersion: 0,
        toVersion: 1,
        migrate(draft) {
          draft.notes = [];
          throw new Error('synthetic failure');
        },
      }],
    });

    expect(result).toMatchObject({ ok: false, error: { code: 'MIGRATION_STEP_FAILED' } });
    expect(result).not.toHaveProperty('data');
    expect(profile).toEqual(original);
  });

  it('rejects record loss even when a migration stamps the expected version', () => {
    const profile = loadProfileFixture();
    const result = runProfileMigrationsInShadow(profile, {
      registry: [{
        id: 'lossy-step',
        fromVersion: 0,
        toVersion: 1,
        migrate(draft) {
          draft.entries.pop();
          draft.schemaVersion = 1;
        },
      }],
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: 'PROFILE_VALIDATION_FAILED',
        reason: 'COLLECTION_COUNT_CHANGED',
        field: 'entries',
      },
    });
    expect(result).not.toHaveProperty('data');
  });

  it('rejects changes outside the declared migration surface', () => {
    const profile = loadProfileFixture();
    const result = runProfileMigrationsInShadow(profile, {
      registry: [{
        id: 'overbroad-step',
        fromVersion: 0,
        toVersion: 1,
        migrate(draft) {
          draft.currentUnknownSurface = { preserve: [] };
          draft.schemaVersion = 1;
        },
      }],
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: 'PROFILE_VALIDATION_FAILED',
        reason: 'PROTECTED_ROOT_VALUE_CHANGED',
        field: 'currentUnknownSurface',
      },
    });
  });
});
