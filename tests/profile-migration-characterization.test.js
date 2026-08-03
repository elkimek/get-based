import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { migrateProfileData } from '../js/profile-data-migrations.js';

const FIXTURE_FILES = [
  'pre-v1.6.json',
  'v1.7-structured-context.json',
  'current-unversioned.json',
];

function readFixture(filename) {
  return JSON.parse(readFileSync(
    new URL(`./fixtures/profile-migrations/${filename}`, import.meta.url),
    'utf8',
  ));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value).sort().map(key => [key, canonicalize(value[key])]),
  );
}

function readPath(root, path) {
  const segments = path.startsWith('/') ? path.slice(1).split('/') : path.split('.');
  return segments.reduce((value, segment) => value?.[segment], root);
}

function hasPath(root, path) {
  const segments = path.split('.');
  let value = root;
  for (const segment of segments) {
    if (!value || typeof value !== 'object' || !Object.hasOwn(value, segment)) return false;
    value = value[segment];
  }
  return true;
}

describe('historical profile migration characterization', () => {
  for (const filename of FIXTURE_FILES) {
    const fixture = readFixture(filename);

    it(`${fixture.releaseRange} migrates deterministically without losing unrelated data`, () => {
      expect(fixture.fixtureSchema).toBe(1);
      const original = clone(fixture.profile);
      const first = migrateProfileData(clone(original));
      const independentlyMigrated = migrateProfileData(clone(original));

      expect(canonicalize(first)).toEqual(canonicalize(independentlyMigrated));

      for (const path of fixture.expect.removedPaths) {
        expect(hasPath(first, path), `expected ${path} to be removed`).toBe(false);
      }
      for (const path of fixture.expect.preservedPaths) {
        expect(readPath(first, path), `expected ${path} to be preserved`)
          .toEqual(readPath(original, path));
      }
      for (const [path, count] of Object.entries(fixture.expect.arrayCounts)) {
        expect(readPath(first, path), `expected ${path} to remain an array`).toHaveLength(count);
      }
      for (const [path, expected] of Object.entries(fixture.expect.expectedPaths)) {
        expect(readPath(first, path), `unexpected migrated value at ${path}`).toEqual(expected);
      }
    });

    it(`${fixture.releaseRange} is idempotent after the first migration`, () => {
      const migrated = migrateProfileData(clone(fixture.profile));
      const once = canonicalize(migrated);

      migrateProfileData(migrated);

      expect(canonicalize(migrated)).toEqual(once);
    });
  }
});
