// @vitest-environment node
import './_node-shim.js';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createAgentHostService } from '../lib/agent-host-service.js';
import { AGENT_HOST_MAX_PROMPT_CHARS } from '../shared/agent-host-protocol.js';
import { state } from '../js/state.js';
import { getActiveData, invalidateActiveDataCache } from '../js/data.js';
import { computeBiologyScoreAssessments } from '../js/biology-scores.js';
import { configureBiologyScoreAIDeps, generateBiologyScoreAIAnswers, generateBiologyScoreAIAnswer, scoreLine } from '../js/biology-score-ai.js';

const answer = { summary: 'The pattern varies across dates. Check the available core markers.', explanation: '## Main signal\nReview the supplied ranges.\n## Context\nResults span several dates.\n## Next check\nCompare the core markers together.' };
let previous;
beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-09-16T12:00:00Z'));
  state.profileSex = 'male'; state.profileDob = '1987-11-22'; state.rangeMode = 'optimal'; state.unitSystem = 'EU';
  state.importedData = JSON.parse(readFileSync(new URL('../data/demo-male.json', import.meta.url)));
  invalidateActiveDataCache();
});
afterEach(() => { if (previous) configureBiologyScoreAIDeps(previous); previous = null; vi.restoreAllMocks(); });
function profileAcrossDates() {
  const data = getActiveData(); data.dates = ['2025-12-01', '2026-04-01', '2026-08-01'];
  let index = 0;
  for (const category of Object.values(data.categories)) for (const marker of Object.values(category.markers)) {
    const value = marker.values?.filter(v => v != null).at(-1);
    if (value == null) continue;
    marker.values = [null, null, null]; marker.values[index++ % 3] = value;
    delete marker.canonicalScoring; delete marker.contextRefRanges; delete marker.contextOptimalRanges;
  }
  return computeBiologyScoreAssessments(data);
}
function configure(call) {
  previous = configureBiologyScoreAIDeps({ callClaudeAPI: call, hasAIProvider: () => true, isAIPaused: () => false });
}
function validResponse(options) {
  return { text: JSON.stringify(Object.fromEntries(Object.keys(options.jsonSchema.properties).map(id => [id, answer]))) };
}
function turnRequest(prompt) {
  return new Request('http://127.0.0.1:8324/v1/turns', { method: 'POST', headers: { Authorization: 'Bearer budget-test', Origin: 'http://127.0.0.1:8000', 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt, purpose: 'feature', tools: [] }) });
}

it('reproduces the Companion rejection and sends complete bounded comparison groups through the real HTTP boundary', async () => {
  // No live provider or user data: test the actual Companion validation with a fake CLI.
  const appServer = new EventEmitter(); appServer.request = async method => method === 'thread/start' ? { thread: { id: 'budget-thread' } } : { turn: { id: 'budget-turn' } };
  const service = createAgentHostService({ appServer, token: 'budget-test', workspaceRoot: '/tmp' });
  const scores = profileAcrossDates();
  const oldPrompt = 'User request:\n' + scores.map(s => `Score ID: ${s.id}\n${scoreLine(s)}`).join('\n\n');
  expect(oldPrompt.length).toBeGreaterThan(AGENT_HOST_MAX_PROMPT_CHARS);
  const rejected = await service.handleRequest(turnRequest(oldPrompt));
  expect(rejected.status).toBe(400); expect(await rejected.json()).toEqual({ error: 'invalid_prompt' });
  const call = vi.fn(async options => {
    const prompt = `User request:\n${options.messages[0].content}`;
    expect(prompt.length).toBeLessThanOrEqual(AGENT_HOST_MAX_PROMPT_CHARS);
    const accepted = await service.handleRequest(turnRequest(prompt));
    expect(accepted.status).toBe(200); await accepted.body.cancel();
    return validResponse(options);
  });
  configure(call);
  const result = await generateBiologyScoreAIAnswers(scores, { automatic: true });
  expect(result.failedIds).toEqual([]); expect(Object.keys(result.answers)).toHaveLength(19);
  expect(call.mock.calls.length).toBeGreaterThan(1); expect(call.mock.calls.length).toBeLessThan(19);
  for (const score of scores) {
    const matching = call.mock.calls.filter(([options]) => options.jsonSchema.properties[score.id]);
    expect(matching).toHaveLength(1);
    expect(matching[0][0].messages[0].content).toContain(scoreLine(score));
    expect(matching[0][0].consentKind).toBe('automatic-insight');
  }
});

it('still uses one call for a profile that fits and one call for a single-score refresh', async () => {
  const scores = computeBiologyScoreAssessments(getActiveData()); const call = vi.fn(validResponse); configure(call);
  expect((await generateBiologyScoreAIAnswers(scores)).failedIds).toEqual([]); expect(call).toHaveBeenCalledTimes(1);
  call.mockResolvedValueOnce({ text: JSON.stringify(answer) });
  await generateBiologyScoreAIAnswer(scores[1]); expect(call).toHaveBeenCalledTimes(2);
});

it('preserves other groups when a request fails and repairs only invalid score entries', async () => {
  const scores = profileAcrossDates(); let repairId;
  const call = vi.fn(async options => {
    const ids = Object.keys(options.jsonSchema.properties);
    if (call.mock.calls.length === 1) throw new Error('Gateway disconnected');
    if (!repairId) { repairId = ids[0]; const result = JSON.parse(validResponse(options).text); delete result[repairId]; return { text: JSON.stringify(result) }; }
    return validResponse(options);
  });
  configure(call); const result = await generateBiologyScoreAIAnswers(scores);
  const failed = Object.keys(call.mock.calls[0][0].jsonSchema.properties);
  expect(result.failedIds).toEqual(failed); expect(result.errors[failed[0]]).toBe('Gateway disconnected');
  expect(Object.keys(result.answers)).toHaveLength(scores.length - failed.length);
  expect(Object.keys(call.mock.calls[2][0].jsonSchema.properties)).toEqual([repairId]);
  expect(call.mock.calls.slice(1).every(([options]) => !failed.some(id => options.jsonSchema.properties[id]))).toBe(true);
});

it('isolates an individually oversized score without truncation or blocking other scores', async () => {
  const scores = computeBiologyScoreAssessments(getActiveData()).slice(0, 2);
  scores[0] = { ...scores[0], aiViews: undefined, methodology: 'x'.repeat(100_001) };
  const call = vi.fn(validResponse); configure(call);
  const result = await generateBiologyScoreAIAnswers(scores);
  expect(result.failedIds).toEqual([scores[0].id]); expect(result.errors[scores[0].id]).toContain('too large');
  expect(result.answers[scores[1].id]).toBeDefined(); expect(call).toHaveBeenCalledTimes(1);
  await expect(generateBiologyScoreAIAnswer(scores[0])).rejects.toThrow('too large'); expect(call).toHaveBeenCalledTimes(1);
});

it('checkpoints each group before requesting the next and stops on a profile change', async () => {
  const scores = profileAcrossDates(); let active = true;
  const events = [], saved = [];
  const call = vi.fn(async options => { events.push('request'); return validResponse(options); }); configure(call);
  const result = await generateBiologyScoreAIAnswers(scores, {
    shouldContinue: () => active,
    onBatch: async (_group, result) => { events.push('save'); saved.push(...Object.keys(result.answers)); active = false; },
  });
  expect(events).toEqual(['request', 'save']);
  expect(saved.length).toBeGreaterThan(0); expect(saved.length).toBeLessThan(scores.length);
  expect(Object.keys(result.answers)).toEqual(saved);
  expect(result.failedIds.every(id => result.errors[id].includes('Profile changed'))).toBe(true);
});

it('reports an unsuccessful checkpoint as unsaved while retaining other successful groups', async () => {
  const scores = profileAcrossDates(); let count = 0;
  const call = vi.fn(validResponse); configure(call);
  const result = await generateBiologyScoreAIAnswers(scores, {
    onBatch: async () => { if (++count === 1) throw new Error('Could not save the explanation.'); },
  });
  const unsaved = Object.keys(call.mock.calls[0][0].jsonSchema.properties);
  expect(result.failedIds).toEqual(unsaved);
  expect(unsaved.every(id => !result.answers[id] && result.errors[id].includes('Could not save'))).toBe(true);
  expect(Object.keys(result.answers).length).toBe(scores.length - unsaved.length);
});
