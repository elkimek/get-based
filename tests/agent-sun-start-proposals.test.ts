// @vitest-environment jsdom
import {describe, it} from 'vitest';
import { retiredRecordActionCase } from './helpers/retired-health-record-actions.js';
describe('sunSessions native-only actions', () => {
  const verify = retiredRecordActionCase('sunSessions');
  it.each(['start'])('keeps sunSessions %s in native UI, including historical proposal replay', verify);
});
