import {renderHTML as renderDates} from './components/HeaderDateSummary.svelte.html.js';
import {renderHTML as renderRange} from './components/HeaderRangeButtons.svelte.html.js';

export interface HeaderDateView {text: string}
export interface HeaderRangeButtonView {mode: string; active: boolean; pressed: boolean; label: string}
export interface HeaderRangeView {buttons: readonly HeaderRangeButtonView[]}

/** Preserve template-literal coercion, including Symbol failure, before native DOM assignment. */
export function renderHeaderDateSummary(dateText: unknown): string {
  const text = `${dateText}`;
  return renderDates({view: {text}});
}

/** The controller supplies its original modes; class and ARIA retain independent reads per row. */
export function renderHeaderRangeButtons(modes: readonly string[], readMode: () => unknown): string {
  const buttons = modes.map(mode => {
    const active = readMode() === mode;
    const pressed = readMode() === mode;
    const label = mode.charAt(0).toUpperCase() + mode.slice(1);
    return {mode, active, pressed, label};
  });
  return renderRange({view: {buttons}});
}
