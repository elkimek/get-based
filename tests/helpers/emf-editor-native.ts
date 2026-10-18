import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import * as ts from 'typescript/unstable/ast';
import {withParsedSource} from '../../scripts/native-typescript-ast.js';
import * as schema from '../../js/schema.js';
import * as constants from '../../js/constants.js';
import * as model from '../../js/emf-model.js';
import * as utils from '../../js/utils.js';
import * as recommendations from '../../js/recommendations.js';
import * as comparison from '../../js/emf-comparison-presentation.js';
import * as lifecycle from '../../js/modal-lifecycle.js';
import {createUniqueId} from '../../js/unique-id.js';
import {saveImportedData} from '../../js/data.js';
import {toggleCtxTag} from '../../js/context-card-editor-ui.js';
import type * as current from '../../js/emf-editor.js';
const source=readFileSync('tests/fixtures/emf-editor-native-before.ts.txt','utf8');
const declarations=withParsedSource(source,'emf-editor.ts',ast=>ast.statements.filter(node=>!ts.isImportDeclaration(node)).map(node=>node.getText(ast)).join('\n'));
const program=stripTypeScriptTypes(declarations.replace(/\bexport /g,''));
export function nativeEMFEditor():Pick<typeof current,'renderEMFEditor'|'showEMFImportPreview'|'configureEMFEditor'|'emfEditorState'> & {dispose:()=>void} {
 return vm.runInNewContext(program+'\n;({renderEMFEditor,showEMFImportPreview,configureEMFEditor,emfEditorState,dispose:removeEMFEditorDelegates});',{
  ...schema,...constants,...model,...utils,...recommendations,...comparison,...lifecycle,
  createUniqueId,saveImportedData,toggleCtxTag,document,HTMLElement,Element,HTMLInputElement,HTMLTextAreaElement,HTMLSelectElement,
  requestAnimationFrame:globalThis.requestAnimationFrame,cancelAnimationFrame:globalThis.cancelAnimationFrame,setTimeout,clearTimeout,
 });
}
