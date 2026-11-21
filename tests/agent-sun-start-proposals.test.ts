// @vitest-environment jsdom
import { it } from 'vitest';
import { retiredRecordActions } from './helpers/retired-health-record-actions.js';
retiredRecordActions('sunSessions', (title, verify) => {
  it.each(['start'])(title, verify);
});
