import { test, expect } from './coverage-fixture.js';
import { prepareDemoProfile } from './biology-score-fixture.js';

async function installAI(page, mode = 'success') {
  await page.evaluate(async mode => {
    globalThis.biologyAuditCalls = [];
    (await import('/js/biology-score-ai.js')).configureBiologyScoreAIDeps({
      automaticEnabled: () => mode !== 'manual', hasAIProvider: () => true, isAIPaused: () => false,
      callClaudeAPI: async options => {
        const ids = Object.keys(options.jsonSchema.properties);
        globalThis.biologyAuditCalls.push(ids);
        if (mode === 'fail') throw new Error('Provider unavailable. Retry this score.');
        if (mode === 'hold-second' && globalThis.biologyAuditCalls.length === 2) await new Promise(resolve => globalThis.releaseBiologyBatch = resolve);
        const answer = { summary: 'Saved complete interpretation. Check the collection dates.', explanation: '## Main signal\nThe core markers describe a range pattern.\n## Context\nDates and ranges affect interpretation.\n## Next check\nReview the core panel.' };
        return { text: JSON.stringify(ids.includes('summary') ? answer : Object.fromEntries(ids.map(id => [id, answer]))) };
      },
    });
  }, mode);
}

async function assess(page) {
  await page.evaluate(async () => { (await import('/js/views.js')).navigate('biology-scores'); await (await import('/js/biology-scores.js')).loadBiologyScoreInsights(); });
}

test('ordinary edits and AI saves both survive storage, backup and reload in either order', async ({ page }) => {
  await prepareDemoProfile(page);
  const results = await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const data = await import('/js/data.js');
    const { computeBiologyScores } = await import('/js/biology-scores.js');
    const { writeScoreAIAnswer } = await import('/js/biology-score-sections.js');
    const { encryptedGetItem } = await import('/js/crypto.js');
    const { profileStorageKey } = await import('/js/profile.js');
    const results = [];
    for (const order of ['ai-first', 'edit-first']) {
      state.importedData.biologyScoreAI = {}; state.importedData.contextNotes = 'Original'; await data.saveImportedData();
      const score = computeBiologyScores(data.getActiveData()).find(s => s.id === 'cardiovascularLipoprotein');
      const ai = () => writeScoreAIAnswer(score, { text: `Saved ${order}.`, summary: 'Complete summary.' });
      const edit = () => { state.importedData.contextNotes = `Edited ${order}`; state.importedData.entries[0].fasting = true; return data.saveImportedData(); };
      const pending = order === 'ai-first' ? ai() : edit(); await Promise.resolve();
      await Promise.all([pending, order === 'ai-first' ? edit() : ai()]);
      const stored = JSON.parse(await encryptedGetItem(profileStorageKey(state.currentProfile, 'imported')));
      results.push({ note: stored.contextNotes, ai: stored.biologyScoreAI?.[score.id]?.text, fasting: stored.entries[0].fasting, memoryAI: state.importedData.biologyScoreAI?.[score.id]?.text });
    }
    const { buildFullBackupSnapshot } = await import('/js/backup.js');
    const snapshot = await buildFullBackupSnapshot();
    const backup = JSON.parse(snapshot.profiles.find(p => p.profileId === state.currentProfile).keys.imported);
    return { results, backupAI: backup.biologyScoreAI?.cardiovascularLipoprotein?.text };
  });
  expect(results.results).toEqual(['ai-first', 'edit-first'].map(order => ({ note: `Edited ${order}`, ai: `Saved ${order}.`, fasting: true, memoryAI: `Saved ${order}.` })));
  expect(results.backupAI).toBe('Saved edit-first.');
  await page.reload(); await prepareDemoProfile(page);
  expect(await page.evaluate(async () => (await import('/js/state.js')).state.importedData.biologyScoreAI?.cardiovascularLipoprotein?.text)).toBe('Saved edit-first.');
});

test('a stale second tab cannot erase a completed interpretation with a note save', async ({ page }) => {
  await prepareDemoProfile(page);
  await page.evaluate(async () => { (await import('/js/state.js')).state.importedData.contextNotes = 'Original'; await (await import('/js/data.js')).saveImportedData(); });
  const other = await page.context().newPage(); await prepareDemoProfile(other);
  await page.evaluate(async () => {
    const { computeBiologyScores } = await import('/js/biology-scores.js');
    const score = computeBiologyScores((await import('/js/data.js')).getActiveData()).find(s => s.id === 'cardiovascularLipoprotein');
    await (await import('/js/biology-score-sections.js')).writeScoreAIAnswer(score, { text: 'Saved in tab one.', summary: 'Saved summary.' });
  });
  await other.evaluate(async () => {
    const { state } = await import('/js/state.js');
    state.importedData.contextNotes = 'Edited in tab two';
    await (await import('/js/data.js')).saveImportedData();
  });
  await page.evaluate(async () => {
    const data = await import('/js/data.js');
    const score = (await import('/js/biology-scores.js')).computeBiologyScores(data.getActiveData()).find(s => s.id === 'cardiovascularLipoprotein');
    await (await import('/js/biology-score-sections.js')).writeScoreAIAnswer(score, { text: 'Updated in tab one.', summary: 'Saved summary.' });
    // A later maintenance save must not restore tab one's old note.
    await data.saveImportedData();
  });
  await other.reload(); await prepareDemoProfile(other);
  expect(await other.evaluate(async () => {
    const d = (await import('/js/state.js')).state.importedData;
    return { note: d.contextNotes, answer: d.biologyScoreAI?.cardiovascularLipoprotein?.text };
  })).toEqual({ note: 'Edited in tab two', answer: 'Updated in tab one.' });
  await other.close();
});

test('completed batches are durable before the next finishes and resume only missing scores', async ({ page }) => {
  await prepareDemoProfile(page);
  await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const { setProfileSex, setProfileDob } = await import('/js/profile.js');
    await setProfileSex(state.currentProfile, state.profileSex); await setProfileDob(state.currentProfile, state.profileDob);
    const latest = {}; for (const entry of state.importedData.entries) Object.assign(latest, entry.markers);
    const entries = ['2025-12-01', '2026-03-01', '2026-07-01'].map(date => ({ date, markers: {}, sampleTime: '08:00', fasting: true }));
    Object.entries(latest).forEach(([key, value], index) => { entries[index % 3].markers[key] = value; });
    state.importedData.entries = entries; state.importedData.biologyScoreAI = {};
    state.importedData.sunSessions = []; state.importedData.deviceSessions = []; state.importedData.sunDefaults = { completedAt: Date.now() };
    await (await import('/js/data.js')).saveImportedData();
  });
  await installAI(page, 'hold-second');
  await page.evaluate(async () => { (await import('/js/views.js')).navigate('biology-scores'); void (await import('/js/biology-scores.js')).loadBiologyScoreInsights(); });
  await page.waitForFunction(() => globalThis.biologyAuditCalls.length === 2);
  const completed = await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const { profileStorageKey } = await import('/js/profile.js');
    const saved = JSON.parse(await (await import('/js/crypto.js')).encryptedGetItem(profileStorageKey(state.currentProfile, 'imported')));
    return { requested: globalThis.biologyAuditCalls[0], saved: Object.keys(saved.biologyScoreAI || {}) };
  });
  expect(completed.saved.sort()).toEqual(completed.requested.sort());
  for (const id of completed.saved) await expect(page.locator(`[data-biology-score-ai-summary="${id}"]`)).toHaveAttribute('aria-busy', 'false');
  await page.reload(); await prepareDemoProfile(page); await installAI(page); await assess(page);
  const resumed = await page.evaluate(() => globalThis.biologyAuditCalls.flat());
  expect(resumed.length).toBeGreaterThan(0);
  expect(resumed.filter(id => completed.saved.includes(id))).toEqual([]);
});

test('display-unit changes reuse all cached interpretations without additional AI calls', async ({ page }) => {
  await prepareDemoProfile(page); await installAI(page); await assess(page);
  const count = await page.evaluate(() => globalThis.biologyAuditCalls.length);
  for (const units of ['US', 'ANZ', 'EU']) {
    await page.evaluate(async units => { (await import('/js/state.js')).state.unitSystem = units; (await import('/js/data.js')).invalidateActiveDataCache(); }, units);
    await assess(page);
    expect(await page.evaluate(() => globalThis.biologyAuditCalls.length)).toBe(count);
    await expect(page.locator('.biology-score-ai-teaser-label').filter({ hasText: 'refresh needed' })).toHaveCount(0);
  }
});

test('provider errors survive navigation and an individual retry clears only that score', async ({ page }) => {
  await prepareDemoProfile(page); await installAI(page, 'fail'); await assess(page);
  const count = await page.locator('.biology-score-ai-error').filter({ hasText: 'Provider unavailable' }).count();
  expect(count).toBeGreaterThan(0);
  const calls = await page.evaluate(() => globalThis.biologyAuditCalls.length);
  await page.evaluate(async () => (await import('/js/views.js')).navigate('dashboard')); await assess(page);
  await expect(page.locator('.biology-score-ai-error').filter({ hasText: 'Provider unavailable' })).toHaveCount(count);
  expect(await page.evaluate(() => globalThis.biologyAuditCalls.length)).toBe(calls);
  await installAI(page);
  const card = page.locator('#biology-score-metabolicFlexibility');
  await card.locator('.biology-score-ai-teaser-action').click();
  await expect(card.locator('.biology-score-ai-teaser')).toContainText('Saved complete interpretation.');
  await expect(card.locator('.biology-score-ai-error')).toBeEmpty();
  await expect(page.locator('.biology-score-ai-error').filter({ hasText: 'Provider unavailable' })).toHaveCount(count - 1);
  await page.locator('#biology-score-biologicalCoherence .biology-score-ai-teaser-action').click();
  await expect(page.locator('[data-biology-score-ai-summary][aria-busy=true]')).toHaveCount(0);
  await expect(page.locator('.biology-score-ai-error').filter({ hasText: 'Provider unavailable' })).toHaveCount(0);
});

test('score controls have independent keyboard actions and valid accessible status', async ({ page }) => {
  await prepareDemoProfile(page);
  await page.evaluate(async () => { (await import('/js/utils.js')).dismissAnalyticsConsent(); (await import('/js/views.js')).navigate('biology-scores'); });
  const card = page.locator('#biology-score-metabolicFlexibility');
  const toggle = card.getByRole('button', { name: 'Details for Metabolic Flexibility' });
  await toggle.focus(); await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(card.locator('.biology-score-expanded')).toBeVisible();
  await page.keyboard.press('Space'); await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await installAI(page, 'manual');
  await expect(card.locator('.biology-score-ai-teaser-action')).toBeEnabled();
  await card.locator('.biology-score-ai-teaser-action').focus(); await page.keyboard.press('Enter');
  await expect(card.locator('.biology-score-ai-teaser')).toContainText('Saved complete interpretation.');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await page.addScriptTag({ path: 'node_modules/axe-core/axe.min.js' });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await toggle.click();
    const violations = await page.evaluate(async () => (await globalThis.axe.run('#main-content', { runOnly: { type: 'rule', values: ['nested-interactive', 'aria-prohibited-attr', 'aria-valid-attr-value', 'button-name'] } })).violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) })));
    expect(violations).toEqual([]);
    await toggle.click();
  }
});

test('two tabs preserve independent lab additions and edits through reload', async ({ page }) => {
  await prepareDemoProfile(page);
  await page.evaluate(async () => {
    const {state} = await import('/js/state.js');
    state.importedData.entries.push(
      {date:'2026-08-01',specimen:'serum',context:{sampleTime:'08:00',fasting:true},markers:{'hormones.cortisol':350}},
      {date:'2026-08-01',specimen:'saliva',context:{sampleTime:'23:00',fasting:false},markers:{'hormones.cortisol':3}},
    );
    if (!await (await import('/js/data.js')).saveImportedData()) throw new Error('Panel setup failed');
  });
  const other = await page.context().newPage(); await prepareDemoProfile(other);
  // Capture both stale intents before either tab writes.
  for (const [tab, date, value] of [[page, '2026-09-14', .7], [other, '2026-09-15', .8]]) {
    await tab.evaluate(async ({date, value}) => {
      const {state} = await import('/js/state.js');
      const {profileDataBaseline} = await import('/js/profile-data-writes.js');
      globalThis.staleProfileBaseline = structuredClone(profileDataBaseline(state.importedData));
      globalThis.staleProfileIntent = structuredClone(state.importedData);
      globalThis.staleProfileIntent.entries.push({date, markers: {'lipids.apoB': value}});
    }, {date, value});
  }
  await Promise.all([page, other].map(tab => tab.evaluate(async () => {
    const {state} = await import('/js/state.js');
    const saved = await (await import('/js/data.js')).saveImportedDataForProfile(state.currentProfile, globalThis.staleProfileIntent, {baseData: globalThis.staleProfileBaseline, forceProfileScope: true});
    if (!saved) throw new Error('Concurrent lab save failed');
  })));
  await other.reload(); await prepareDemoProfile(other);
  expect(await other.evaluate(async () => (await import('/js/state.js')).state.importedData.entries
    .filter(e => ['2026-09-14', '2026-09-15'].includes(e.date)).sort((a,b) => a.date.localeCompare(b.date))
    .map(e => ({date:e.date, value:e.markers['lipids.apoB']})))).toEqual([{date:'2026-09-14',value:.7},{date:'2026-09-15',value:.8}]);
  expect(await other.evaluate(async () => (await import('/js/state.js')).state.importedData.entries
    .filter(e => e.date === '2026-08-01').map(e => ({specimen:e.specimen,time:e.context.sampleTime,fasting:e.context.fasting,value:e.markers['hormones.cortisol']}))))
    .toEqual([{specimen:'serum',time:'08:00',fasting:true,value:350},{specimen:'saliva',time:'23:00',fasting:false,value:3}]);
  await other.close();
});
