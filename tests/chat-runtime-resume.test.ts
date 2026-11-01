// @vitest-environment node
import {afterEach, expect, it} from 'vitest';
import {configureChatRuntimeCallbacks, resumeChatAIRuntime} from '../js/chat-runtime.js';
afterEach(() => {configureChatRuntimeCallbacks({resumeAI: null});});
it('reports completion only after the native resume preference has committed', async () => {
  let settle: () => void, complete = false;
  configureChatRuntimeCallbacks({resumeAI: () => new Promise<void>(resolve => {settle = resolve;})});
  const resumed = resumeChatAIRuntime().then(value => {complete = true; return value;});
  await Promise.resolve(); expect(complete).toBe(false);
  settle!(); expect(await resumed).toBe(true); expect(complete).toBe(true);
});
it('retains missing-handler and failure outcomes for callers', async () => {
  configureChatRuntimeCallbacks({resumeAI: null}); expect(await resumeChatAIRuntime()).toBe(false);
  const error = new Error('Native resume did not commit');
  configureChatRuntimeCallbacks({resumeAI: async () => {throw error;}});
  await expect(resumeChatAIRuntime()).rejects.toBe(error);
});
