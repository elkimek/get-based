// @vitest-environment jsdom
// The former positive chat-control contract is retired; native owners are tested separately.
import {describe, it} from 'vitest';
import { retiredManagementCases } from './helpers/chat-management-retirement.js';
describe('assistant.connection remains native-only', () => {
  const cases = retiredManagementCases('assistant.connection');
  it('creates no snapshot or proposal and invokes no injected native handler', cases.noProposal);
  it.each(['pending','applying','changed','undone','discarded','expired','conflict','unknown'])('cannot execute or grant Undo from a stored %s label', cases.storedLabel);
  it('does not restore management authority after off/on or a fresh native-looking lease', cases.noAuthority);
});
