import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { state } from '../../js/state.js';
import { createAgentToolRuntime } from '../../js/agent-tool-runtime.js';
import { applyAgentDataProposal } from '../../js/agent-data-apply.js';
import { projectAgentDraftCards } from '../../js/agent-draft-presentation.js';

/** Rejected chat operations cannot touch records or native runtime; manual owners have separate tests. */
export function retiredRecordActions(resource: 'sunSessions' | 'lightDevices' | 'lightAudits', operations: string[]) {
  describe(`${resource} native-only actions`, () => {
  const original = { profile: state.currentProfile, data: state.importedData };
  let permission: string | null;
  beforeEach(() => { permission=localStorage.getItem('getbased-chat-controls');localStorage.removeItem('getbased-chat-controls');state.currentProfile='record-scope';state.importedData={...structuredClone(original.data),contextNotes:'Preserve existing health data'}; });
  afterEach(() => { state.currentProfile=original.profile;state.importedData=original.data;if(permission===null)localStorage.removeItem('getbased-chat-controls');else localStorage.setItem('getbased-chat-controls',permission); });
  it.each(operations)(`keeps ${resource} %s in native UI, including historical proposal replay`, async operation => {
    const native=vi.fn(),before=structuredClone(state.importedData),settings=Object.keys(localStorage).sort().map(key=>[key,localStorage.getItem(key)]);
    const runtime=createAgentToolRuntime({readContext:()=>'',userMessage:'Previously requested',prepareDataChange:native});
    const payload={resource,operation,recordId:'existing-record',baseline:'{}',patch:'{}',evidence:'Previously requested',reason:'Explicit previous request',effectiveDate:'2026-10-31',recordedAt:1};
    expect((await runtime.execute({tool:'getbased_draft_data',arguments:{resource,operation,snapshotId:'previous',patch:'{}',evidence:payload.evidence,reason:payload.reason}})).success).toBe(false);
    expect(native).not.toHaveBeenCalled();expect(runtime.getDrafts()).toEqual([]);expect(runtime.getOutcome().reviews).toEqual([]);
    await expect(applyAgentDataProposal(payload,'record-scope')).rejects.toMatchObject({noChangeApplied:true});
    const cards=projectAgentDraftCards({agentDrafts:[{id:'previous',profileId:'record-scope',kind:'data',status:'pending',payload}]});
    expect(cards[0]).toMatchObject({nativeOnly:true,status:'failed'});
    expect(state.importedData).toEqual(before);expect(Object.keys(localStorage).sort().map(key=>[key,localStorage.getItem(key)])).toEqual(settings);
  });
  });
}
