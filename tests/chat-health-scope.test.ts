import { reviewedNoteText } from '../js/marker-note-commands.js';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { getCodexDynamicTools } from '../shared/agent-tool-contract.js';
import { expect, it, vi } from 'vitest';
import { getAgentToolCatalog } from '../shared/agent-tool-contract.js';
import { chatAppControlAllowed, chatNavigationAllowed, chatDataChangeAllowed, chatDataPatchAllowed } from '../shared/chat-control-policy.js';
import { createAgentToolRuntime } from '../js/agent-tool-runtime.js';

it('offers health reads, two proposal routes, history search and health navigation without management tools', () => {
  expect(getAgentToolCatalog(undefined, 'current').map(tool => tool.name)).toEqual([
    'getbased_lab_context', 'getbased_section', 'getbased_search_markers', 'getbased_marker_history',
    'getbased_nutrition_summary', 'getbased_wearable_series', 'getbased_search_knowledge',
    'getbased_read_context_card', 'getbased_read_data', 'getbased_draft_data', 'getbased_navigate',
    'getbased_draft_context', 'getbased_search_conversations',
  ]);
});
it.each(['assistant.selection', 'assistant.connection', 'profile.selection', 'display.preferences', 'labs.overlays'])('keeps old %s cards unable to Apply or Undo', action => {
  expect(chatAppControlAllowed(action, {})).toBe(false);
});
it.each(['aiSettings','agentSettings','displaySettings','privacySettings','voiceSettings','dataSettings','wearablesSettings','healthImport','profileShare','reportBuilder','knowledgeBase','lightTools','lightDevices'])('does not open management destination %s', view => {
  expect(chatNavigationAllowed({view})).toBe(false);
});
it.each(['start','pause','resume','stop','setCoverage','setSunscreen','rotateSides'])('does not control live Sun timers through %s', operation => {
  expect(chatDataChangeAllowed('sunSessions', operation)).toBe(false);
});
it.each(['lightDevices','lightAudits'])('leaves %s administration in native UI', resource => {
  for (const operation of ['add','update','remove']) expect(chatDataChangeAllowed(resource, operation)).toBe(false);
});
it.each(['getbased_app_actions','getbased_read_app','getbased_request_app','getbased_draft_note'])('does not execute retired %s in current chat even if a handler is injected', async tool => {
  const handler=vi.fn(), runtime=createAgentToolRuntime({readContext:()=>'',listAppActions:handler,readAppState:handler,prepareAppControl:handler,prepareLegacyDraft:handler});
  expect((await runtime.execute({tool,arguments:{}})).success).toBe(false);expect(handler).not.toHaveBeenCalled();expect(runtime.getDrafts()).toEqual([]);
});

it.each([{widgetNutrients:['protein']},{proteinBasis:'general'},{proteinBasis:'active'},{proteinBasis:'high'},{proteinBasis:'custom'},{proteinBasis:'fixed'}])('rejects nutrition preference/preset management %j', patch => {
  expect(chatDataPatchAllowed('nutritionTargets','update',patch)).toBe(false);
});
it('retains explicit nutrition goals and reported profile facts', () => {
  expect(chatDataPatchAllowed('nutritionTargets','update',{energyKcal:2100,proteinFixedG:100})).toBe(true);
  expect(chatDataPatchAllowed('profile','update',{height:{value:70,unit:'in'},location:{country:'El Salvador'}})).toBe(true);
});

it('pins every field of the reduced v61 API/CLI schemas and isolates mutable caller copies', () => {
  const expected = JSON.parse(fs.readFileSync('tests/fixtures/agent-tool-contract-v61.json','utf8'));
  expect(createHash('sha256').update(JSON.stringify(expected)).digest('hex')).toBe('a27f65985adcb311481e59909aa3ec6b770048b7230e3327289f3c70aa3c4f01');
  const catalog = getAgentToolCatalog(undefined,'current');
  expect({catalog,codex:getCodexDynamicTools(catalog)}).toEqual(expected);
  const navigation = catalog.find(tool => tool.name === 'getbased_navigate')!;
  (navigation.inputSchema.properties!.view!.enum as string[]).push('dataSettings');
  catalog[0]!.name = 'caller mutation';
  expect(getAgentToolCatalog(undefined,'current')).toEqual(expected.catalog);
});

it('does not turn an empty update into a configuration-only change', () => {
  expect(chatDataPatchAllowed('nutritionTargets','update',{})).toBe(false);
  expect(chatDataPatchAllowed('profile','update',{})).toBe(false);
});

it('preserves marker note bytes on append and refuses an overlong final note', () => {
  const old = '  Existing note.\n';
  expect(reviewedNoteText(old,{appendText:'Reported addition'},500)).toBe(old+'\n\nReported addition');
  expect(() => reviewedNoteText('x'.repeat(499),{appendText:'Added'},500)).toThrow('length limit');
  expect(() => reviewedNoteText(old,{appendText:'Added',text:'Replacement'},500)).toThrow('never both');
});
