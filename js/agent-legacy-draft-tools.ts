// Compatibility names prepare the same exact domain proposals as read_data /
// draft_data. There is no compatibility persistence path.
import { agentDataObject, normalizeAgentDataProposal, validAgentDate, validateFieldNames } from '../shared/agent-data-contract.js';
import type { AgentDataProposal, AgentDataResource, AgentLegacyDraftKind } from '../shared/agent-data-contract.js';
import type { AgentToolReadOptions } from './agent-tool-runtime.js';

interface DataTools {
  readData(input: AgentToolReadOptions['readData']): Promise<unknown>;
  prepareDataChange(input: AgentToolReadOptions['prepareDataChange']): Promise<unknown>;
}
interface ReadResult {
  available?: boolean; reason?: string; missingRecord?: boolean; snapshotId?: string; current?: unknown;
  records?: Array<{ recordId: string; name?: string; type?: string; markerKey?: string; markerName?: string }>;
  nextOffset?: number | null;
}
const unavailable = (reason: string) => ({ available: false as const, reason });
function text(value: unknown, label: string, max: number, required = false) {
  if (value == null && !required) return '';
  if (typeof value !== 'string' || value.length > max || required && !value.trim()) throw new Error(`Supply ${label}${required ? ' before refreshing this review' : ''}.`);
  return value.trim();
}
function date(value: unknown, label: string) {
  if (!validAgentDate(value)) throw new Error(`This saved proposal needs an explicit ${label}. Ask the chat to propose it again with a date.`);
  return value;
}
function amount(value: unknown, label: string) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) throw new Error(`Supply the reported ${label}.`);
  return value;
}
export async function prepareLegacyAgentData(input: { kind: AgentLegacyDraftKind; payload: Record<string, unknown>; evidence: string }, tools: DataTools) {
  try {
    const evidence = text(input.evidence, 'the original user message', 1000, true), payload = agentDataObject(input.payload);
    const plans: Array<{ resource: AgentDataResource; patch: Record<string, unknown>; recordId?: string; singleton?: boolean }> = [];
    const note = text(payload.note, 'note text', 500);
    if (input.kind === 'note') {
      validateFieldNames(payload, ['scope', 'marker', 'text', 'mode']);
      if (!['profile', 'marker'].includes(String(payload.scope)) || !['append', 'replace'].includes(String(payload.mode || 'append'))) throw new Error('Choose a supported note destination and mode.');
      let recordId = '';
      const resource = payload.scope === 'marker' ? 'markerNotes' : 'profileNotes';
      if (resource === 'markerNotes') {
        const query = text(payload.marker, 'marker', 160, true);
        if (/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(query)) recordId = query;
        else {
          const matches = await list(resource, query), normalized = query.toLowerCase();
          const exact = matches.filter(row => row.markerKey?.toLowerCase() === normalized || row.markerName?.toLowerCase() === normalized);
          const candidates = exact.length ? exact : matches.filter(row => row.markerKey?.toLowerCase().includes(normalized) || row.markerName?.toLowerCase().includes(normalized));
          if (candidates.length !== 1) throw new Error(candidates.length ? 'Choose an unambiguous marker with the exact record tools.' : 'This marker is unavailable. Read its exact record first.');
          recordId = candidates[0]!.recordId;
        }
      }
      const read = await readRecord(resource, recordId, false), current = resource === 'profileNotes' ? String(read.current || '') : text(agentDataObject(read.current).text, 'current note', 64000);
      const added = text(payload.text, 'note text', 2000, true), replacement = payload.mode === 'replace' || !current.trim() ? added : `${current.trim()}\n\n${added}`;
      return await prepare([{ resource, snapshotId: read.snapshotId!, operation: 'update', patch: { text: replacement } }]);
    }
    if (input.kind === 'meal') {
      validateFieldNames(payload, ['name', 'mealType', 'eatenAt', 'nutrients', 'note']);
      const eatenAt = text(payload.eatenAt, 'meal date and time', 64, true);
      if (!Number.isFinite(Date.parse(eatenAt))) throw new Error('The saved meal needs a valid date and time. Ask for a new proposal.');
      const nutrients = payload.nutrients == null ? {} : agentDataObject(payload.nutrients);
      plans.push({ resource: 'meals', patch: { name: text(payload.name, 'meal name', 160, true), mealType: payload.mealType || 'other', eatenAt, nutrients, ...(note ? { note } : {}) } });
    } else if (input.kind === 'biometric') {
      validateFieldNames(payload, ['metric', 'date', 'value', 'unit', 'systolic', 'diastolic', 'pulse', 'note']);
      const readingDate = date(payload.date, 'measurement date');
      if (payload.metric === 'bp') {
        plans.push({ resource: 'manualReadings', recordId: `bp.${readingDate}`, patch: { kind: 'bloodPressure', date: readingDate, systolic: amount(payload.systolic, 'systolic pressure'), diastolic: amount(payload.diastolic, 'diastolic pressure'), ...(payload.pulse == null ? {} : { pulse: amount(payload.pulse, 'pulse') }), ...(note ? { note } : {}) } });
      } else {
        if (!['weight', 'rhr'].includes(String(payload.metric))) throw new Error('Choose a supported manual reading.');
        if (payload.metric === 'weight' && !['kg', 'lb', 'lbs'].includes(String(payload.unit))) throw new Error('This weight proposal needs an explicit unit. Ask the chat to propose it again with kg or lb.');
        plans.push({ resource: 'manualReadings', recordId: `${payload.metric}.${readingDate}`, patch: { kind: payload.metric === 'weight' ? 'weight' : 'pulse', date: readingDate, value: amount(payload.value, 'measurement'), unit: payload.metric === 'weight' ? payload.unit : 'bpm', ...(note ? { note } : {}) } });
      }
    } else if (input.kind === 'supplement') {
      validateFieldNames(payload, ['name', 'type', 'dosage', 'note', 'startDate']);
      const name = text(payload.name, 'therapy name', 160, true), startDate = date(payload.startDate, 'therapy start date');
      if (!['supplement', 'medication'].includes(String(payload.type))) throw new Error('Choose supplement or medication.');
      const candidates = (await list('supplements', name)).filter(row => row.name?.trim().toLowerCase() === name.toLowerCase() && row.type === payload.type);
      if (candidates.length > 1) throw new Error('Multiple therapies have this name. Read the intended record ID first.');
      plans.push({ resource: 'supplements', ...(candidates[0] ? { recordId: candidates[0].recordId } : {}), patch: { name, type: payload.type, startDate,
        ...(payload.dosage ? { dosage: text(payload.dosage, 'directions', 160) } : {}), ...(note ? { note } : {}) } });
    } else throw new Error('This saved proposal kind is not supported.');
    const prepared = [];
    for (const plan of plans) {
      let read = plan.recordId ? await readRecord(plan.resource, plan.recordId, false, true) : null;
      const existing = read?.available === true;
      if (read && !existing && !read.missingRecord) return unavailable(read.reason || 'This record is unavailable.');
      if (!existing) read = await readRecord(plan.resource, '', true);
      const patch = { ...plan.patch };
      if (existing && plan.resource === 'supplements') {
        if (agentDataObject(read!.current).startDate !== patch.startDate) throw new Error('This therapy already exists with a different start date. Use its exact record and dated restart or history operations.');
        delete patch.startDate;
      }
      prepared.push({ resource: plan.resource, snapshotId: read!.snapshotId!, operation: existing ? 'update' as const : 'add' as const, patch });
    }
    return await prepare(prepared);

    async function readRecord(resource: AgentDataResource, recordId: string, create: boolean, allowMissing = false) {
      const result = await tools.readData({ resource, recordId, create, query: '', offset: 0, limit: 25 }) as ReadResult;
      if (!result?.available && !(allowMissing && result?.missingRecord)) throw new Error(result?.reason || 'This record is unavailable.');
      return result;
    }
    async function list(resource: AgentDataResource, query: string) {
      const rows: NonNullable<ReadResult['records']> = []; let offset = 0;
      for (let page = 0; page < 10; page++) {
        const result = await tools.readData({ resource, query, recordId: '', create: false, offset, limit: 25 }) as ReadResult;
        if (!result?.available) throw new Error(result?.reason || 'This resource is unavailable.');
        rows.push(...result.records || []);
        if (result.nextOffset == null) return rows;
        offset = result.nextOffset;
      }
      throw new Error('Too many matches for this shortcut. Read an exact record ID first.');
    }
    async function prepare(commands: Array<{ resource: AgentDataResource; snapshotId: string; operation: 'add' | 'update'; patch: Record<string, unknown> }>) {
      const proposals: AgentDataProposal[] = [];
      for (const command of commands) {
        const result = await tools.prepareDataChange({ ...command, patch: JSON.stringify(command.patch), evidence, reason: 'Refresh an explicitly reported change through its exact domain review.' }) as { available?: boolean; payload?: unknown; reason?: string };
        const proposal = normalizeAgentDataProposal(result?.payload);
        if (!result?.available || !proposal) return unavailable(result?.reason || 'This change could not be prepared.');
        proposals.push(proposal);
      }
      return { available: true as const, proposals };
    }
  } catch (error) { return unavailable(error instanceof Error ? error.message : 'This saved proposal needs a new review.'); }
}
