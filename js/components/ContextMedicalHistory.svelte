<script lang="ts">
  import { untrack, tick } from 'svelte';
  import ConditionInput from './ContextConditionInput.svelte';
  import { focus, label, button, input, surfaceButton, choiceButton, noteInput, closeButton, rowAction as nativeRowAction, rowRemove, editorHeader, editorKicker, editorTitle, editorFooter } from '../context-form-classes.js';
  import { medicalHistoryDraft, medicalHistoryValue, conditionValue, familyHistoryValue, familyHistoryRows, conditionSuggestions, INTERPRETATION_FLAGS, CONDITION_IMPACT_LABELS, CONDITION_STATUS, FAMILY_RELATIVES, FAMILY_GROUPS, relativeLabel } from '../context-medical-history-model.js';
  import type { MedicalHistoryDraft, ConditionInput as ConditionFields, FamilyHistoryInput } from '../context-medical-history-model.js';
  let { initial, sex, current, save, clear, close }: {
    initial: MedicalHistoryDraft; sex: string; current(): boolean; save(): void; clear(): void; close(): void;
  } = $props();
  let draft = $state(untrack(() => medicalHistoryDraft(initial))), busy = $state(false), status = $state('');
  let conditionIndex = $state(-1), familyIndex = $state(-1), familyOpen = $state(false);
  let condition = $state<ConditionFields>({ name: '', severity: 'mild', status: '', since: '' });
  let family = $state<FamilyHistoryInput>({ relative: 'mother', condition: '', age: '', note: '' });
  let root: HTMLDivElement, conditionControl: ReturnType<typeof ConditionInput>, familyControl: ReturnType<typeof ConditionInput>;
  const rows = $derived(familyHistoryRows(draft));
  const flagCount = $derived(INTERPRETATION_FLAGS.filter(([key]) => draft.flags[key]).length);
  const canClear = $derived(medicalHistoryValue($state.snapshot(draft)) !== null);
  const row = 'gb:context-form:flex gb:context-form:items-center gb:context-form:gap-2 gb:context-form:rounded-control gb:context-form:border gb:context-form:border-line gb:context-form:bg-surface gb:context-form:px-3.5 gb:context-form:py-2.5 gb:context-form:mb-1.5 gb:context-form:text-[13px]';
  const rowAction = nativeRowAction;
  const section = 'gb:context-form:my-3.5 gb:context-form:overflow-clip gb:context-form:rounded-[var(--radius-md)] gb:context-form:border gb:context-form:border-line gb:context-form:bg-surface';
  const summary = `gb:context-form:min-h-14 gb:context-form:px-3.5 gb:context-form:py-3 gb:context-form:text-[13px] gb:context-form:font-bold gb:context-form:text-ink gb:context-form:cursor-pointer gb:context-form:hover:bg-hover ${focus}`;
  const help = 'gb:context-form:block gb:context-form:mt-1 gb:context-form:text-xs gb:context-form:font-normal gb:context-form:leading-normal gb:context-form:text-secondary';
  const sectionBody = 'gb:context-form:border-t gb:context-form:border-line gb:context-form:p-3.5';
  export function report(message: string, pending: boolean): void { status = message; busy = pending; }
  // Stable public helpers accept controls belonging to this live authored form only.
  function synchronizeControls(): void {
    const value = (id: string) => root.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(`#${id}`)?.value || '';
    condition.name = value('condition-input'); condition.since = value('condition-since');
    family.relative = value('fh-relative'); family.condition = value('fh-condition'); family.age = value('fh-age'); family.note = value('fh-note');
    draft.note = value('ctx-note-input'); draft.proceduresNote = value('diagnosis-procedures-input');
    for (const [key] of INTERPRETATION_FLAGS) {
      if (root.querySelector<HTMLInputElement>(`#diagnosis-flag-${key}`)?.checked) draft.flags[key] = true;
      else delete draft.flags[key];
    }
  }
  export function readDraft(): MedicalHistoryDraft { return $state.snapshot(draft); }
  export function hideSuggestions(): void { conditionControl?.hide(); familyControl?.hide(); }
  export function action(name: string, argument?: number | string): void {
    if (!current() || busy) return;
    synchronizeControls();
    switch (name) {
      case 'syncDiagnosesNote': break;
      case 'filterConditionSuggestions': conditionControl.refresh(); break;
      case 'filterFamilyConditionSuggestions': familyControl.refresh(); break;
      case 'selectConditionSuggestion': if (typeof argument === 'string') conditionControl.select(argument); break;
      case 'selectFamilyConditionSuggestion': if (typeof argument === 'string') familyControl.select(argument); break;
      case 'addCondition': addCondition(); break;
      case 'addFamilyHistoryEntry': addFamily(); break;
      case 'editCondition': if (typeof argument === 'number') editCondition(argument); break;
      case 'editFamilyHistoryEntry': if (typeof argument === 'number') editFamily(argument); break;
      case 'deleteCondition': if (typeof argument === 'number') removeCondition(argument); break;
      case 'deleteFamilyHistoryEntry': if (typeof argument === 'number') removeFamily(argument); break;
      case 'cancelConditionEdit': resetCondition(); break;
      case 'cancelFamilyHistoryEdit': resetFamily(); break;
    }
  }
  function resetCondition(): void { conditionIndex = -1; condition = { name: '', severity: 'mild', status: '', since: '' }; conditionControl?.hide(); }
  function resetFamily(): void { familyIndex = -1; family = { relative: 'mother', condition: '', age: '', note: '' }; familyControl?.hide(); }
  function addCondition(): void {
    if (!current() || busy) return;
    const value = conditionValue($state.snapshot(condition), $state.snapshot(draft.conditions[conditionIndex]));
    if (!value) { status = 'Enter a condition name to add.'; return; }
    if (conditionIndex >= 0 && draft.conditions[conditionIndex]) draft.conditions[conditionIndex] = value; else draft.conditions.push(value);
    resetCondition(); status = '';
  }
  function addFamily(): void {
    if (!current() || busy) return;
    const value = familyHistoryValue($state.snapshot(family), $state.snapshot(draft.familyHistory[familyIndex]));
    if (!value) { status = 'Choose a relative and enter a condition to add.'; return; }
    if (familyIndex >= 0 && draft.familyHistory[familyIndex]) draft.familyHistory[familyIndex] = value; else draft.familyHistory.push(value);
    resetFamily(); status = '';
  }
  function editCondition(index: number): void {
    if (!current() || busy) return;
    const entry = draft.conditions[index]; if (!entry) return;
    conditionIndex = index; condition = { name: entry.name, severity: entry.severity || 'mild', status: entry.status || '', since: entry.since || '' };
    root.querySelector<HTMLInputElement>('#condition-input')?.focus({ preventScroll: true });
  }
  function editFamily(index: number): void {
    if (!current() || busy) return;
    const entry = draft.familyHistory[index]; if (!entry) return;
    familyIndex = index; familyOpen = true;
    family = { relative: entry.relative, condition: entry.condition, age: entry.onsetAge == null ? '' : String(entry.onsetAge), note: entry.note || '' };
    void tick().then(() => { if (current() && familyIndex === index) root.querySelector<HTMLInputElement>('#fh-condition')?.focus({ preventScroll: true }); });
  }
  function removeCondition(index: number): void { if (current() && !busy && draft.conditions[index]) { draft.conditions.splice(index, 1); if (conditionIndex === index) resetCondition(); else if (conditionIndex > index) conditionIndex--; } }
  function removeFamily(index: number): void { if (current() && !busy && draft.familyHistory[index]) { draft.familyHistory.splice(index, 1); if (familyIndex === index) resetFamily(); else if (familyIndex > index) familyIndex--; } }
</script>
<div bind:this={root} data-context-form-view="diagnoses" data-context-medical-view class="gb:context-form:min-w-0 gb:context-form:[overflow-wrap:anywhere]">
  <header class={editorHeader}>
    <div><div class={editorKicker}>Profile context</div><h2 id="context-medical-title" class={editorTitle}>Medical History</h2></div>
    <button type="button" class={closeButton} aria-label="Close Medical History" onclick={() => { if (current()) close(); }}>×</button>
  </header>
  <div class="gb:context-form:px-[26px] gb:context-form:pt-[22px] gb:context-form:max-[720px]:px-[18px]">
    <p class="gb:context-form:mt-0 gb:context-form:mb-5 gb:context-form:text-[13px] gb:context-form:leading-normal gb:context-form:text-secondary">Add only what matters for interpretation. Nothing changes until you save.</p>
    {#if draft.conditions.length}<ul id="ctx-conditions-list" aria-label="Conditions" class="gb:context-form:m-0 gb:context-form:mb-4 gb:context-form:list-none gb:context-form:p-0">
      {#each draft.conditions as entry, index (entry)}<li class={`ctx-condition-item ${row}`}>
        <div class="gb:context-form:min-w-0 gb:context-form:flex-1 gb:context-form:flex gb:context-form:flex-wrap gb:context-form:items-center gb:context-form:gap-2"><span class="ctx-condition-name gb:context-form:min-w-0 gb:context-form:flex-1 gb:context-form:font-medium gb:context-form:text-ink gb:context-form:max-[480px]:basis-full">{entry.name}</span>
          {#if entry.severity}<span class="gb:context-form:rounded-control gb:context-form:border gb:context-form:border-line gb:context-form:px-2 gb:context-form:py-0.5 gb:context-form:text-[11px] gb:context-form:text-ink">{CONDITION_IMPACT_LABELS[entry.severity] || entry.severity}</span>{/if}
          {#if entry.status}<span class="gb:context-form:text-xs gb:context-form:text-secondary">{entry.status}</span>{/if}{#if entry.since}<span class="gb:context-form:text-xs gb:context-form:text-secondary">since {entry.since}</span>{/if}
        </div>
        <div class="gb:context-form:flex gb:context-form:shrink-0"><button type="button" class={rowAction} aria-label="Edit condition" title={`Edit ${entry.name}`} disabled={busy} onclick={() => { if (draft.conditions[index] === entry) editCondition(index); }}>✎</button><button type="button" class={rowRemove} aria-label="Remove condition" title={`Remove ${entry.name}`} disabled={busy} onclick={() => { if (draft.conditions[index] === entry) removeCondition(index); }}>×</button></div>
      </li>{/each}
    </ul>{/if}
    <div id="condition-impact-label" class={label}>Impact on interpretation</div><div id="condition-severity" role="group" aria-labelledby="condition-impact-label" class="gb:context-form:flex gb:context-form:flex-wrap gb:context-form:gap-1.5 gb:context-form:mb-4">
      {#each Object.entries(CONDITION_IMPACT_LABELS) as [value, text]}<button type="button" class={`${choiceButton}`} aria-pressed={condition.severity === value} data-context-value={value} disabled={busy} onclick={() => { if (current() && !busy) condition.severity = value; }}>{text}</button>{/each}
    </div>
    <div id="condition-status-label" class={label}>Status</div><div id="condition-status" role="group" aria-labelledby="condition-status-label" class="gb:context-form:flex gb:context-form:flex-wrap gb:context-form:gap-1.5 gb:context-form:mb-4">
      {#each CONDITION_STATUS as value}<button type="button" class={`${choiceButton}`} aria-pressed={condition.status === value} data-context-value={value} disabled={busy} onclick={() => { if (current() && !busy) condition.status = condition.status === value ? '' : value; }}>{value}</button>{/each}
    </div>
    <div class="gb:context-form:grid gb:context-form:grid-cols-[minmax(0,1fr)_112px] gb:context-form:gap-2 gb:context-form:max-[480px]:grid-cols-1">
      <ConditionInput bind:this={conditionControl} id="condition-input" listId="condition-suggestions" title="Condition name" placeholder="Type condition name..." value={condition.name} suggestions={conditionSuggestions(condition.name, draft, sex)} disabled={busy} {current} change={value => { condition.name = value; }} add={addCondition} />
      <div><label class={label} for="condition-since">Since (year)</label><input id="condition-since" type="text" class={input} placeholder="Since (year)" value={condition.since} disabled={busy} oninput={event => { if (current() && !busy) condition.since = event.currentTarget.value; }} /></div>
    </div>
    <div class="gb:context-form:flex gb:context-form:flex-wrap gb:context-form:gap-2 gb:context-form:my-3"><button type="button" class={surfaceButton} disabled={busy} onclick={addCondition}>{conditionIndex >= 0 ? 'Update condition' : 'Add condition'}</button>{#if conditionIndex >= 0}<button type="button" class={surfaceButton} disabled={busy} onclick={() => { if (current() && !busy) resetCondition(); }}>Cancel condition edit</button>{/if}</div>
    <details class={section}><summary class={summary}>Major procedures &amp; organ changes<span class={help}>{draft.proceduresNote ? draft.proceduresNote.slice(0, 90) : 'Optional surgery, transplant, or removed-organ context'}</span></summary><div class={sectionBody}><label class={label} for="diagnosis-procedures-input">Procedures or organ changes</label><textarea id="diagnosis-procedures-input" class={noteInput} placeholder="For example: bariatric surgery, thyroid removal, transplant, splenectomy" value={draft.proceduresNote} disabled={busy} oninput={event => { if (current() && !busy) draft.proceduresNote = event.currentTarget.value; }}></textarea></div></details>
    <details id="ctx-family-section" bind:open={familyOpen} class={section}><summary class={summary}>Family history{draft.familyHistory.length ? ` (${draft.familyHistory.length})` : ''}<span class={help}>{draft.familyHistory.length ? `${draft.familyHistory.length} saved relative${draft.familyHistory.length === 1 ? '' : 's'}` : 'Optional inherited-risk context'}</span></summary>
      <div class={sectionBody}><p class="gb:context-form:mt-0 gb:context-form:mb-3 gb:context-form:text-xs gb:context-form:leading-normal gb:context-form:text-secondary">Family history can change how borderline results are interpreted without implying that you have the same condition.</p>
        {#if rows.length}<ul id="ctx-family-list" aria-label="Family history entries" class="gb:context-form:m-0 gb:context-form:mb-3.5 gb:context-form:list-none gb:context-form:p-0">
          {#each rows as rowData (rowData.entry)}<li class={`ctx-family-item ${row}`}><div class="gb:context-form:min-w-0 gb:context-form:flex-1 gb:context-form:flex gb:context-form:items-center gb:context-form:gap-2 gb:context-form:max-[600px]:flex-wrap">
            <span class="gb:context-form:min-w-0 gb:context-form:basis-[32%] gb:context-form:truncate gb:context-form:rounded-control gb:context-form:bg-secondary-surface gb:context-form:px-2 gb:context-form:py-1 gb:context-form:text-xs gb:context-form:text-secondary gb:context-form:max-[600px]:basis-full" title={rowData.label}><span aria-hidden="true">{rowData.emoji}</span> {rowData.label}</span>
            <span class="ctx-family-condition gb:context-form:min-w-0 gb:context-form:flex-1 gb:context-form:truncate gb:context-form:font-medium gb:context-form:text-ink gb:context-form:max-[600px]:basis-full" title={rowData.entry.condition}>{rowData.entry.condition}</span>
            {#if rowData.entry.onsetAge != null && rowData.entry.onsetAge !== ''}<span class="gb:context-form:shrink-0 gb:context-form:text-xs gb:context-form:text-secondary">age {rowData.entry.onsetAge}</span>{/if}
            {#if rowData.entry.note}<span class="gb:context-form:min-w-0 gb:context-form:max-w-[28%] gb:context-form:truncate gb:context-form:text-xs gb:context-form:text-secondary gb:context-form:max-[600px]:max-w-full gb:context-form:max-[600px]:basis-full" title={rowData.entry.note}>{rowData.entry.note}</span>{/if}
          </div><div class="gb:context-form:flex gb:context-form:shrink-0"><button type="button" class={rowAction} aria-label="Edit family history entry" title={`Edit ${rowData.label}`} disabled={busy} onclick={() => { if (draft.familyHistory[rowData.index] === rowData.entry) editFamily(rowData.index); }}>✎</button><button type="button" class={rowRemove} aria-label="Remove entry" title={`Remove ${rowData.label}`} disabled={busy} onclick={() => { if (draft.familyHistory[rowData.index] === rowData.entry) removeFamily(rowData.index); }}>×</button></div></li>{/each}
        </ul>{/if}
        <div class="gb:context-form:grid gb:context-form:grid-cols-[minmax(0,200px)_minmax(0,1fr)] gb:context-form:gap-2 gb:context-form:max-[600px]:grid-cols-1"><div><label class={label} for="fh-relative">Relative</label><select id="fh-relative" class={input} value={family.relative} disabled={busy} onchange={event => { if (current() && !busy) family.relative = event.currentTarget.value; }}>
          {#if !FAMILY_RELATIVES.some(relative => relative.key === family.relative)}<option value={family.relative}>{family.relative}</option>{/if}
          {#each FAMILY_GROUPS as group}<optgroup label={group.label}>{#each group.keys as key}<option value={key}>{relativeLabel(key)}</option>{/each}</optgroup>{/each}
        </select></div><ConditionInput bind:this={familyControl} id="fh-condition" listId="fh-condition-suggestions" title="Family condition" placeholder="Condition (e.g. heart attack, Alzheimer's, breast cancer)" value={family.condition} suggestions={conditionSuggestions(family.condition, draft, sex, true)} disabled={busy} {current} change={value => { family.condition = value; }} add={addFamily} /></div>
        <div class="gb:context-form:grid gb:context-form:grid-cols-[130px_minmax(0,1fr)] gb:context-form:gap-2 gb:context-form:mt-2 gb:context-form:max-[600px]:grid-cols-1"><div><label class={label} for="fh-age">Age at onset</label><input id="fh-age" type="number" min="0" max="120" class={input} value={family.age} disabled={busy} oninput={event => { if (current() && !busy) family.age = event.currentTarget.value; }} /></div><div><label class={label} for="fh-note">Family note</label><input id="fh-note" type="text" class={input} placeholder="Outcome, treatment, etc. (optional)" value={family.note} disabled={busy} oninput={event => { if (current() && !busy) family.note = event.currentTarget.value; }} /></div></div>
        <div class="gb:context-form:flex gb:context-form:flex-wrap gb:context-form:gap-2 gb:context-form:mt-3"><button type="button" class={surfaceButton} disabled={busy} onclick={addFamily}>{familyIndex >= 0 ? 'Update family entry' : 'Add family entry'}</button>{#if familyIndex >= 0}<button type="button" class={surfaceButton} disabled={busy} onclick={() => { if (current() && !busy) resetFamily(); }}>Cancel family edit</button>{/if}</div>
      </div>
    </details>
    <details class={section}><summary class={summary}>Interpretation flags<span class={help}>{flagCount ? `${flagCount} saved flag${flagCount === 1 ? '' : 's'}` : 'Only when a score needs special handling'}</span></summary><div class={sectionBody}><p class="gb:context-form:mt-0 gb:context-form:mb-3 gb:context-form:text-xs gb:context-form:text-secondary">Use these only when context changes what a lab marker means.</p><div class="gb:context-form:grid gb:context-form:gap-2">
      {#each INTERPRETATION_FLAGS as [key, text, description]}<label class={`gb:context-form:grid gb:context-form:grid-cols-[auto_minmax(0,1fr)] gb:context-form:gap-2.5 gb:context-form:items-start gb:context-form:min-h-11 gb:context-form:rounded-control gb:context-form:border gb:context-form:border-line gb:context-form:bg-surface gb:context-form:p-3 gb:context-form:cursor-pointer gb:context-form:hover:bg-hover`}><input type="checkbox" id={`diagnosis-flag-${key}`} checked={!!draft.flags[key]} disabled={busy} class={`gb:context-form:mt-0.5 gb:context-form:accent-accent ${focus}`} onchange={event => { if (current() && !busy) { if (event.currentTarget.checked) draft.flags[key] = true; else delete draft.flags[key]; } }} /><span><strong class="gb:context-form:text-[13px] gb:context-form:font-semibold gb:context-form:text-ink">{text}</strong><small class={help}>{description}</small></span></label>{/each}
    </div></div></details>
    <label class={label} for="ctx-note-input">Notes</label><textarea id="ctx-note-input" rows="2" class={noteInput} value={draft.note} disabled={busy} placeholder="Anything else that may be relevant" oninput={event => { if (current() && !busy) draft.note = event.currentTarget.value; }}></textarea>
    <p role="status" aria-live="polite" class="gb:context-form:my-2 gb:context-form:text-xs gb:context-form:text-secondary">{status}</p>
    <footer class={editorFooter}>
      <button type="button" class={`${button} gb:context-form:border-accent gb:context-form:bg-accent gb:context-form:text-on-accent`} disabled={busy} onclick={() => { if (current() && !busy) save(); }}>{busy ? 'Saving…' : 'Save'}</button><button type="button" class={surfaceButton} onclick={() => { if (current()) close(); }}>Cancel</button>
      {#if canClear}<button type="button" class={`${button} gb:context-form:ml-auto gb:context-form:border-danger gb:context-form:bg-surface gb:context-form:text-danger-ink gb:context-form:hover:bg-hover`} disabled={busy} onclick={() => { if (current() && !busy) clear(); }}>Clear</button>{/if}
    </footer>
  </div>
</div>
