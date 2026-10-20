// Normal installs always compile. CI may reuse only the exact qualified output;
// npm still runs dependency install scripts normally on the consumer platform.
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import type {verifyCompiledInputs as VerifyCompiledInputs} from './ci-compiled.mjs';
const {verifyCompiledInputs}: {verifyCompiledInputs: typeof VerifyCompiledInputs} = await import(new URL('./ci-compiled.mts', import.meta.url).href);

if (process.env['GETBASED_CI_COMPILED'] !== undefined) {
  assert.equal(process.env['GETBASED_CI_COMPILED'], '1', 'Explicit compiled CI reuse');
  assert.equal(process.env['GITHUB_ACTIONS'], 'true', 'Compiled reuse is CI-only');
  const manifest = await verifyCompiledInputs();
  console.log(`Verified ${manifest.outputs.length} exact generated outputs; producer compiler and semantic gates retained.`);
} else execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'typescript:build'], {stdio: 'inherit'});
