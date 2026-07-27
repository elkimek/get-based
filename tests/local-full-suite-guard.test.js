import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  fullLocalSuiteDecision,
  runFullLocalSuiteGuard,
} from '../scripts/local-full-suite-guard.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('local full-suite disk-write guard', () => {
  it('blocks the exhaustive suite by default outside CI', () => {
    const decision = fullLocalSuiteDecision({});

    expect(decision.allowed).toBe(false);
    expect(decision.message).toContain('disk-write endurance');
    expect(decision.message).toContain('GETBASED_ALLOW_HIGH_WRITE_TESTS=1');
  });

  it.each(['1', 'true', 'YES', 'on'])('allows explicit local opt-in value %s', value => {
    expect(fullLocalSuiteDecision({
      GETBASED_ALLOW_HIGH_WRITE_TESTS: value,
    })).toEqual({
      allowed: true,
      source: 'GETBASED_ALLOW_HIGH_WRITE_TESTS',
    });
  });

  it.each(['1', 'true', 'YES', 'on'])('allows the exhaustive suite in CI with value %s', value => {
    expect(fullLocalSuiteDecision({ CI: value })).toEqual({
      allowed: true,
      source: 'CI',
    });
  });

  it('does not treat false-like environment values as approval', () => {
    expect(fullLocalSuiteDecision({
      CI: 'false',
      GETBASED_ALLOW_HIGH_WRITE_TESTS: '0',
    }).allowed).toBe(false);
  });

  it('returns the blocking exit code and explanation without opt-in', () => {
    let message = '';
    const exitCode = runFullLocalSuiteGuard({
      CI: 'false',
      GETBASED_ALLOW_HIGH_WRITE_TESTS: '0',
    }, value => {
      message = value;
    });

    expect(exitCode).toBe(2);
    expect(message).toContain('Local full browser suite blocked');
  });

  it('returns success without an error message in CI', () => {
    let message = '';
    const exitCode = runFullLocalSuiteGuard({
      CI: 'true',
      GETBASED_ALLOW_HIGH_WRITE_TESTS: '0',
    }, value => {
      message = value;
    });

    expect(exitCode).toBe(0);
    expect(message).toBe('');
  });

  it('wires the guard into both exhaustive local entry points', () => {
    const runTests = fs.readFileSync(path.join(ROOT, 'run-tests.sh'), 'utf8');
    const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

    expect(runTests.indexOf('scripts/local-full-suite-guard.mjs'))
      .toBeLessThan(runTests.indexOf('npm run typecheck'));
    expect(packageJson.scripts['test:playwright'])
      .toMatch(/^node scripts\/local-full-suite-guard\.mjs && /);
  });
});
