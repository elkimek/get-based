import {renderHTML} from './components/ChartLayersDropdown.svelte.html.js';

export interface ChartLayersAvailability {hasNotes:boolean;hasSupps:boolean;hasCycle:boolean|undefined}
export interface ChartLayersView {
  notes:{checked:boolean}|null;
  supplements:{checked:boolean}|null;
  cycle:{checked:boolean}|null;
}

/** The controller has already read availability; only included modes are read, in native order. */
export function projectChartLayers(
  availability:ChartLayersAvailability,
  readNote:()=>unknown, readSupplement:()=>unknown, readPhase:()=>unknown,
):ChartLayersView {
  const notes=availability.hasNotes?{checked:readNote()==='on'}:null;
  const supplements=availability.hasSupps?{checked:readSupplement()==='on'}:null;
  const cycle=availability.hasCycle?{checked:readPhase()==='on'}:null;
  return {notes,supplements,cycle};
}

export function renderChartLayersPresentation(
  availability:ChartLayersAvailability,
  readNote:()=>unknown, readSupplement:()=>unknown, readPhase:()=>unknown,
):string {
  const view=projectChartLayers(availability,readNote,readSupplement,readPhase);
  return view.notes||view.supplements||view.cycle?renderHTML({view}):'';
}
