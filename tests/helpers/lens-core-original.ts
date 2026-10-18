/** Frozen pre-extraction controller with the same genuine public Svelte renderer. */
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import type * as Shell from '../../js/lens-page-shell.js';
import {state} from '../../js/state.js';
import {getWidgetHeaderDescription} from '../../js/dashboard-widget-copy.js';
import {actionAttributes} from '../../js/action-attributes.js';
import {profileStorageKey} from '../../js/profile.js';
import {openEMFAssessmentEditor} from '../../js/emf-runtime.js';
import {triggerContextCardDNAFilePickerRuntime} from '../../js/context-cards-runtime.js';
import {getDnaModuleFunction} from '../../js/dna-runtime-bridge.js';
import {getSettingsModuleFunction} from '../../js/settings-runtime-bridge.js';
import {projectLensHeader,projectLensWidget,projectLensWidgetChrome} from '../../js/lens-shell-presentation.js';
import {renderHTML as renderShell} from '../../js/components/LensShellPresentation.svelte.html.js';
import {renderHTML as renderDashboardToggle} from '../../js/components/LensDashboardToggle.svelte.html.js';

export const originalShellValueExports=['configureLensPageShell','lensPageActionAttrs','renderLensHeader','getLensPageWidgetOrder','renderLensPageWidgets','moveLensPageWidget','getLensDashboardToggleView','renderLensDashboardToggle','getLensWidgetChrome','getLensContentGrid','renderLensWidget'] as const;
export function originalLensCore():typeof Shell {
  const source=readFileSync('tests/fixtures/lens-page-shell-core-original.js.txt','utf8');
  assert.equal(createHash('sha256').update(source).digest('hex'),'f734fe097e54d402ab3c5414d24e70bb3f1b1293adda3f37cf7070df0bab3abb');
  // Only the pinned original VM loses module syntax. Current sources, child
  // rendering, complete raw HTML, getter effects and errors remain observable.
  const program=source.replace(/^import[\s\S]*?;\n/gm,'').replace(/\bexport /g,'');
  return vm.runInNewContext(program+'\n;({'+originalShellValueExports.join(',')+'});',{
    state,getWidgetHeaderDescription,actionAttributes,profileStorageKey,openEMFAssessmentEditor,
    triggerContextCardDNAFilePickerRuntime,getDnaModuleFunction,getSettingsModuleFunction,
    projectLensHeader,projectLensWidget,projectLensWidgetChrome,renderShell,renderDashboardToggle,
    document:{addEventListener(){}},Element,HTMLElement,localStorage,
  }) as typeof Shell;
}
