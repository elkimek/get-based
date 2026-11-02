import { expect, test } from './coverage-fixture.js';
import { routeJavaScript } from '../helpers/browser-static-routes.js';
import type { AIToolCall } from '../../shared/ai-tool-protocol.js';

for (const protocol of ['native', 'structured'] as const) for (const kind of ['remove', 'restore'] as const) for (const decision of ['apply', 'discard'] as const) {
  test(`direct ${protocol} ${kind} ${decision} reviews exact SNP removal or explicit restoration`, async ({ page }) => {
    await routeJavaScript(page, '**/js/cloud-ai-consent.js', `export * from '/js/cloud-ai-consent.js?genetics-consent-original'; export async function requestAIProcessingApproval(){return true;} export async function requireAIProcessingApproval(){}`);
    const resource = 'geneticVariants', recordId = 'rs429358';
    const evidence = kind === 'remove' ? 'Remove my rs429358 call and its saved call/source history. Keep my other SNPs and maternal lineage.' : 'My new report says my rs429358 genotype is CT.';
    let round = 0, feedback = false;
    await page.route('https://synthetic-genetics-provider.example/v1/chat/completions', async route => {
      const body = route.request().postDataJSON(); expect(JSON.stringify(body)).not.toMatch(/private-dna-sentinel|private-mutation-sentinel|\/private\/|patient\.pdf/);
      if (protocol === 'structured' && body.tools) { await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: { message: 'tools not supported' } }) }); return; }
      const thanks = body.messages.some((message: { role: string; content: unknown }) => message.role === 'user' && message.content === 'Thanks.');
      const lastResult = () => { const message = body.messages.at(-1); return protocol === 'native' ? JSON.parse(message.content) : JSON.parse(message.content.slice(message.content.indexOf('{"id":'))).output; };
      let call: AIToolCall | undefined;
      if (thanks) feedback = body.messages[0].content.includes(`"resource":"${resource}"`) && body.messages[0].content.includes(`"status":"${decision === 'apply' ? 'applied' : 'discarded'}"`);
      else if (round === 0) call = { id: 'read-genetics', type: 'function', function: { name: 'getbased_read_data', arguments: JSON.stringify({ resource, recordId }) } };
      else if (round === 1) {
        const result = lastResult(); expect(result.success).toBe(true); const snapshot = JSON.parse(result.contentItems[0].text);
        expect(snapshot.current).toMatchObject(kind === 'remove' ? { genotype: 'TT', removed: false } : { genotype: null, removed: true });
        call = { id: 'draft-genetics', type: 'function', function: { name: 'getbased_draft_data', arguments: JSON.stringify({ resource, operation: kind === 'remove' ? 'remove' : 'update', snapshotId: snapshot.snapshotId,
          patch: JSON.stringify(kind === 'remove' ? {} : { genotype: 'CT', sourceLabel: 'New report' }), evidence, reason: 'The user explicitly reported this genetics correction.' }) } };
      } else if (round === 2) {
        const result = lastResult(); expect(result.success).toBe(true); const review = JSON.parse(result.contentItems[0].text).review;
        expect(review.applied).toBe(false); expect(review.effects.after).toMatchObject(kind === 'remove' ? { genotype: null, removed: true } : { genotype: 'CT', removed: false });
        expect(review.effects.apoe).toEqual(kind === 'remove' ? { before: 'ε3/ε3', after: null } : { before: null, after: 'ε3/ε4' });
      }
      round++; const reply = thanks ? 'Your decision is recorded.' : 'Review the reported genetics change before applying.';
      if (protocol === 'structured') await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: JSON.stringify({ reply: call ? '' : reply, calls: call ? [{ id: call.id, name: call.function.name, arguments: call.function.arguments }] : [] }) }, finish_reason: 'stop' }] }) });
      else await route.fulfill({ contentType: 'text/event-stream', body: `data: ${JSON.stringify({ choices: [{ delta: call ? { tool_calls: [{ index: 0, ...call }] } : { content: reply }, finish_reason: call ? 'tool_calls' : 'stop' }] })}\n\ndata: [DONE]\n\n` });
    });
    await page.addInitScript(() => { for (const key of ['tour', 'emptyTour']) localStorage.setItem(`labcharts-default-${key}`, 'completed'); });
    await page.goto('/app');
    await page.locator('html[data-app-ready]').waitFor();
    await page.evaluate(async kind => {
      const profile = await import('/js/profile.js'), id = await profile.createProfile('Synthetic genetics proposal', { sex: 'female', skipInitialSync: true });
      for (const suffix of ['tour', 'emptyTour']) localStorage.setItem(profile.profileStorageKey(id, suffix), 'completed');
      localStorage.setItem(`labcharts-onboard-extras-done-${id}`, '1'); localStorage.setItem(`labcharts-onboard-context-cards-skipped-${id}`, '1'); await profile.switchProfile(id);
      const { state } = await import('/js/state.js'), { upsertGeneticsWithCatalog, removeGeneticsSnpWithCatalog } = await import('/js/genetics-mutations.js'), catalog = await (await import('/js/dna-evidence.js')).loadSnpCatalog();
      upsertGeneticsWithCatalog(state.importedData, 'rs429358', 'TT', { label: 'Synthetic report', fileName: '/private/patient.pdf', rawText: 'private-dna-sentinel' }, catalog, 100);
      upsertGeneticsWithCatalog(state.importedData, 'rs7412', 'CC', {}, catalog, 100);
      if (kind === 'restore') removeGeneticsSnpWithCatalog(state.importedData, 'rs429358', catalog, 200);
      state.importedData.genetics!.mtdna = { haplogroup: 'H', confidence: 0.8, mutations: ['private-mutation-sentinel'], source: '/private/maternal.txt' };
      state.importedData.nutritionMeals = [];
      const context = await import('/js/context-source-registry.js'); context.setContextSourceEnabled(context.CONTEXT_SOURCE_IDS.GENOME_INVENTORY, true); context.setContextSourceEnabled(context.CONTEXT_SOURCE_IDS.GENOME_SUMMARY, true);
      if (!await (await import('/js/data.js')).saveImportedData()) throw new Error('Could not save synthetic genetics');
      await (await import('/js/nutrition-store.js')).hydrateNutritionSummary(id);
      const api = await import('/js/api.js'); await api.saveCustomApiConnection('https://synthetic-genetics-provider.example/v1', 'synthetic-key'); api.setCustomApiModel('synthetic'); api.setAIProvider('custom'); api.setAIPaused(false);
      (await import('/js/agent-chat-settings.js')).setChatBackend('direct'); await (await import('/js/chat-loader.js')).openChatPanel();
    }, kind);
    const receipt = () => page.evaluate(async () => { const { state } = await import('/js/state.js'); return JSON.parse((await (await import('/js/crypto.js')).encryptedGetItem((await import('/js/profile.js')).profileStorageKey(state.currentProfile, 'imported')))!); });
    const before = await receipt(); await page.locator('#chat-input').fill(evidence); await page.locator('#chat-send-btn').click();
    const card = page.locator('.chat-agent-draft-pending'); await expect(card).toContainText('Genetic Variants');
    await expect(card).toContainText(kind === 'remove' ? 'Removed SNP evidence' : 'Explicit SNP restoration');
    expect(await receipt()).toEqual(before); await card.getByRole('button', { name: decision === 'apply' ? 'Apply' : 'Discard', exact: true }).click();
    await expect(page.locator(decision === 'apply' ? '.chat-agent-draft-applied' : '.chat-agent-draft-discarded')).toHaveCount(1);
    const saved = await receipt();
    if (decision === 'discard') expect(saved).toEqual(before);
    else {
      expect(saved.genetics.snps.rs7412).toEqual(before.genetics.snps.rs7412); expect(saved.genetics.mtdna).toEqual(before.genetics.mtdna);
      if (kind === 'remove') { expect(saved.genetics.snps.rs429358).toBeUndefined(); expect(saved.genetics.apoe).toBeUndefined(); expect(JSON.stringify(saved.genetics)).not.toContain('private-dna-sentinel'); expect(saved.geneticsSnpTombstones.rs429358.deletedAt).toBeGreaterThan(100); }
      else { expect(saved.genetics.snps.rs429358).toMatchObject({ genotype: 'CT', source: { label: 'New report' } }); expect(saved.genetics.snps.rs429358.priorCalls).toBeUndefined(); expect(saved.genetics.apoe).toBe('ε3/ε4'); expect(saved.geneticsSnpTombstones.rs429358.restoredAt).toBeGreaterThan(saved.geneticsSnpTombstones.rs429358.deletedAt); }
    }
    await page.locator('#chat-input').fill('Thanks.'); await page.locator('#chat-send-btn').click(); await expect(page.locator('#chat-messages')).toContainText('Your decision is recorded.'); expect(feedback).toBe(true);
    await page.reload(); await page.locator('html[data-app-ready]').waitFor(); expect((await receipt()).genetics).toEqual(saved.genetics);
    if (decision === 'apply') {
      await page.evaluate(async () => { const { state } = await import('/js/state.js'); const runtime = (await import('/js/agent-tool-runtime.js')).createAgentToolRuntime({ readContext: () => '', ...(await import('/js/agent-tool-bindings.js')).createBrowserAgentToolDependencies(state.currentProfile) }); const opened = await runtime.execute({ tool: 'getbased_navigate', arguments: { view: 'genome' } }); if (!opened.success) throw new Error(opened.contentItems[0].text); });
      const genome = page.locator('#main-content [data-widget-id="genome"]'); await expect(genome).toContainText('mtDNA H');
      if (kind === 'restore') await expect(genome).toContainText('ε3/ε4'); else { await expect(genome).not.toContainText('ε3/ε3'); await expect(genome.locator('[data-dashboard-widget-rsid="rs429358"]')).toHaveCount(0); }
    }
  });
}
