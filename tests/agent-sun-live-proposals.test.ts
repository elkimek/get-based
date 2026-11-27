// @vitest-environment jsdom
import { it } from 'vitest';
import { retiredRecordActions } from './helpers/retired-health-record-actions.js';
retiredRecordActions('sunSessions', (title, verify) => {
  it.each(['pause', 'resume', 'stop', 'setCoverage', 'setSunscreen', 'rotateSides'])(title, verify);
});
