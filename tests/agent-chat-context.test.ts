import { librarySourceDigest } from '../js/knowledge-library-source.js';
import { knowledgeFileDescriptorDigest } from '../js/knowledge-file-descriptor.js';
import { describe, expect, it } from 'vitest';
import { buildAgentChatInstructions, buildAgentApplicationContext, buildAgentDraftReviewContext, isPersonalAgentTarget } from '../js/agent-chat-context.js';
import { state } from '../js/state.js';

describe('agent context routing', () => {
  it.each(['pending', 'changed', 'failed'] as const)('omits retired persona controls in %s state from both provider context formats', status => {
    const profile = state.currentProfile, thread = state.currentThreadId;
    try {
      state.currentProfile = 'persona-context'; state.currentThreadId = 'thread';
      const messages = [{ appControls: [{ version: 1, id: 'queued-persona', profileId: 'persona-context', threadId: 'thread', action: 'assistant.persona', automatic: true, leaseId: 'PRIVATE_LEASE_NOT_DISCLOSED', parameters: { personaId: 'next' }, baseline: { id: 'default', name: 'PRIVATE_OLD_NAME', icon: 'O' }, proposed: { id: 'next', name: 'PRIVATE_NEW_NAME', icon: 'N' }, reason: 'Requested persona', evidence: 'Use next.', status }] }];
      const data = JSON.parse(buildAgentApplicationContext('', messages));
      expect(buildAgentDraftReviewContext(messages)).toBe('');
      expect(data.appControlReviewStatus).toBeUndefined();
      expect(JSON.stringify(data)).not.toContain('assistant.persona'); expect(JSON.stringify(data)).not.toContain('queued-persona');
      expect(JSON.stringify(data)).not.toContain('PRIVATE_');
    } finally { state.currentProfile = profile; state.currentThreadId = thread; }
  });
  it('delivers the current enabled snapshot and exact actions separately from static instructions', () => {
    const context = '[section:profile]\nExplicit enabled context\n[/section:profile]';
    const data = JSON.parse(buildAgentApplicationContext(context, [{ agentDrafts: [
      { id: 'old', kind: 'context', status: 'discarded', payload: {} },
      { id: 'legacy', kind: 'note', status: 'pending', payload: {} },
      { id: 'new', kind: 'context', status: 'pending', payload: {} },
      { id: 'hidden', kind: 'context', status: 'pending', payload: { evidence: 'Withheld source sentinel' } },
    ] }], draft => draft.id !== 'hidden'));
    expect(data.enabledContext).toBe(context);
    expect(data.proposalReviewStatus.map((row: { id: string; reviewActions: string[] }) => ({ id: row.id, actions: row.reviewActions }))).toEqual([
      { id: 'old', actions: [] }, { id: 'legacy', actions: ['Refresh review', 'Discard'] }, { id: 'new', actions: ['Apply', 'Discard'] },
    ]);
    expect(JSON.stringify(data)).not.toContain('Withheld source sentinel');
    const instructions = buildAgentChatInstructions('Static rules', '', 'local', true);
    expect(instructions).toContain('attached to this turn'); expect(instructions).not.toContain(context); expect(instructions).not.toContain('No enabled health context');
  });
  it('supplies the enabled baseline to local and personal targets with the correct tool boundary', () => {
    const base = 'Be careful with private health data.';
    const context = '[section:profile]\nFatigue noted\n[/section:profile]';
    expect(isPersonalAgentTarget('local')).toBe(false);
    expect(isPersonalAgentTarget('gateway-home')).toBe(true);
    const local = buildAgentChatInstructions(base, context, 'local');
    expect(local).toContain(context);
    expect(local).toContain('Use the bounded getbased tools');
    expect(local).toContain('getbased_read_context_card(card: healthGoals)');
    expect(local).toContain('Never use getbased_draft_note or a Profile context note as a substitute');
    const remote = buildAgentChatInstructions(base, context, 'gateway-home');
    expect(remote).toContain('## Current User Health and Lab Context');
    expect(remote).toContain('exact enabled getbased context snapshot');
    expect(remote).toContain(context);
    expect(remote).toContain('never send it to web searches');
    expect(remote).toContain('tool bridge is not attached');
    expect(remote).not.toContain('Structured destination rule:');
  });
});

it('omits retired Knowledge Base file requests and selected-file metadata from both model contexts',()=>{
 const source={version:1,scope:'browser',revision:'a'.repeat(64),configuration:'b'.repeat(64),record:{libraryId:'default',name:'Research',modelKey:'all-minilm',modelLabel:'MiniLM',active:true,documentCount:0,chunkCount:0},documents:[]};
 const base={resource:'knowledgeImports',operation:'start',recordId:'default',baseline:JSON.stringify(source),patch:JSON.stringify({input:'chooseFiles'}),reason:'Requested local source input',evidence:'Import a file',effectiveDate:'2026-10-26',recordedAt:1};
 const request={id:'request',kind:'data',status:'pending',summary:'Choose local source files',payload:base};
 const first=JSON.parse(buildAgentApplicationContext('',[{agentDrafts:[request]}]));expect(first.proposalReviewStatus).toEqual([]);expect(buildAgentDraftReviewContext([{agentDrafts:[request]}])).toBe('');
 const facts={version:1 as const,token:`knowledge-input-${crypto.randomUUID()}`,files:[{name:'private-file-name.md',bytes:80,type:'text/markdown',contentHash:librarySourceDigest('original')}],documents:[{source:'private-file-name.md',characters:80,utf8Bytes:80,contentHash:librarySourceDigest('extracted'),excerpts:1}],totalTextBytes:80};
 const selection={...facts,digest:knowledgeFileDescriptorDigest({...facts,digest:''})};
 const selected={...request,id:'selected',summary:'Review chosen Knowledge Base files',payload:{...base,baseline:JSON.stringify({version:2,source,selection}),patch:JSON.stringify({input:'selectedFiles',replacementIds:[null]})}};
 const result=buildAgentApplicationContext('',[{agentDrafts:[selected]}]);expect(JSON.parse(result).proposalReviewStatus).toEqual([]);expect(buildAgentDraftReviewContext([{agentDrafts:[selected]}])).toBe('');expect(result).not.toContain('private-file-name.md');expect(result).not.toContain(selection.token);
});

it.each([undefined, null, '', 'unrecognized'])('does not invent pending status or execution actions for an unknown stored draft status %j', status => {
  const messages = [{ agentDrafts: [{ id: 'uncertain', kind: 'note', payload: {}, status }] }];
  const result = JSON.parse(buildAgentApplicationContext('', messages));
  expect(result.proposalReviewStatus).toEqual([expect.objectContaining({ id: 'uncertain', status: 'unknown', reviewActions: [] })]);
  const direct = buildAgentDraftReviewContext(messages);
  const encoded = direct.split('\n').find(line => line.startsWith('['));
  expect(encoded).toBeDefined(); expect(JSON.parse(encoded!)).toEqual(result.proposalReviewStatus);
});

it('retains exact pending actions for a supported preference and omits historical UI-only fields', () => {
  const profile = state.currentProfile, thread = state.currentThreadId;
  try {
    state.currentProfile = 'retained-control'; state.currentThreadId = 'thread';
    const record = { version: 1, id: 'units', profileId: 'retained-control', threadId: 'thread', action: 'display.preferences', parameters: { unitSystem: 'US' }, baseline: { unitSystem: 'EU' }, reason: 'Requested units', evidence: 'Use US units.', status: 'pending' };
    const current = JSON.parse(buildAgentApplicationContext('', [{ appControls: [record] }]));
    expect(current.appControlReviewStatus).toEqual([{ id: 'units', action: 'display.preferences', parameters: { unitSystem: 'US' }, status: 'pending', saved: false, reviewActions: ['Apply', 'Discard'] }]);
    const retired = { ...record, parameters: { ...record.parameters, timeFormat: '12h' } };
    expect(JSON.parse(buildAgentApplicationContext('', [{ appControls: [retired] }])).appControlReviewStatus).toBeUndefined();
    expect(buildAgentDraftReviewContext([{ appControls: [retired] }])).toBe('');
  } finally { state.currentProfile = profile; state.currentThreadId = thread; }
});
