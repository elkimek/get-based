import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OPT_IN_VARIABLE = 'GETBASED_ALLOW_HIGH_WRITE_TESTS';

function isEnabled(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

export function fullLocalSuiteDecision(env = {}) {
  if (isEnabled(env.CI)) {
    return { allowed: true, source: 'CI' };
  }
  if (isEnabled(env[OPT_IN_VARIABLE])) {
    return { allowed: true, source: OPT_IN_VARIABLE };
  }
  return {
    allowed: false,
    source: null,
    message: [
      'Local full browser suite blocked to protect disk-write endurance.',
      'Run only the unit or Playwright specs relevant to the current diff.',
      'GitHub Actions runs the exhaustive browser and coverage matrix.',
      `After explicit approval for a high-write local run, set ${OPT_IN_VARIABLE}=1.`,
    ].join('\n'),
  };
}

export function runFullLocalSuiteGuard(env = {}, writeError = message => console.error(message)) {
  const decision = fullLocalSuiteDecision(env);
  if (decision.allowed) return 0;
  writeError(decision.message);
  return 2;
}

function runCli() {
  process.exitCode = runFullLocalSuiteGuard(process.env);
}

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (entryPath === fileURLToPath(import.meta.url)) runCli();
