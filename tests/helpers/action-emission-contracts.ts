import * as ts from 'typescript/unstable/ast';
import {withParsedSource} from '../../scripts/native-typescript-ast.js';
import {scriptSource,syntaxFile} from '../../scripts/svelte-source.mjs';
import type {SpreadContracts} from './action-emission.js';
/**
 * Closed native attribute tuples stay separate from component prop spreads.
 * The two generic compatibility boundaries are explicit: validated caller data
 * attributes and copying the configured native Light fragment's attributes.
 */
export const REVIEWED_ATTRIBUTE_RECORDS:Readonly<Record<string,SpreadContracts>>={
 'js/components/CorrelationWorkspaceChrome.svelte':{'view.panel':['role','aria-labelledby','tabindex']},
 'js/components/CorrelationWorkspaceUsageSegments.svelte':{'row.accessibility':['role','tabindex']},
 'js/components/MarkerPairComparison.svelte':{'view.scroll':['tabindex']},
 'js/components/TherapyComparisonResults.svelte':{'view.scroll':['tabindex']},
 'js/components/SyncDiagnoseModal.svelte':{'storageValueAttributes(s.pct)':['aria-valuenow']},
 'js/components/SunBodyPicker.svelte':{'figure.placement':['x','y','width','height']},
 'js/components/WearableManualLog.svelte':{'view.save':['data-wearable-action','data-wearable-form','data-wearable-kind','data-wearable-metric'],'view.cancel':['data-wearable-action','data-wearable-form','data-wearable-kind','data-wearable-metric'],'view.form':['data-wearable-action','data-wearable-form','data-wearable-kind','data-wearable-metric']},
 'js/components/ContextNutritionLink.svelte':{'view.attributes':['data-*']},
 'js/sun-active-session.ts':{'setAttribute(attr)':['data-*']},
};
export const GENERIC_DATA_ATTRIBUTE_OWNERS=['js/components/ContextNutritionLink.svelte','js/sun-active-session.ts']as const;

/** A reviewed fixed-key spread must remain one literal passthrough map. */
export function qualifyFixedAttributeReturn(source:string,file:string,owner:string,expected:readonly string[]):void {
 withParsedSource(scriptSource(file,source),syntaxFile(file),parsed=>{
  const declarations:ts.FunctionDeclaration[]=[];let rebound=false;
  function containsOwner(node:ts.Node):boolean {if(ts.isIdentifier(node)&&node.text===owner)return true;let found=false;node.forEachChild(child=>{if(containsOwner(child))found=true;});return found;}
  function visit(node:ts.Node):void {
   if(ts.isFunctionDeclaration(node)&&node.name?.text===owner)declarations.push(node);
   if(ts.isBinaryExpression(node)&&node.operatorToken.kind>=ts.SyntaxKind.FirstAssignment&&node.operatorToken.kind<=ts.SyntaxKind.LastAssignment&&containsOwner(node.left))rebound=true;
   node.forEachChild(visit);
  }
  visit(parsed);const fn=declarations[0],parameter=fn?.parameters[0],statement=fn?.body?.statements[0];
  if(rebound||declarations.length!==1||!fn||fn.asteriskToken||fn.modifiers?.some(m=>m.kind===ts.SyntaxKind.AsyncKeyword)||fn.parameters.length!==1||!parameter||!ts.isIdentifier(parameter.name)||parameter.type?.kind!==ts.SyntaxKind.StringKeyword||parameter.initializer||parameter.dotDotDotToken||fn.body?.statements.length!==1||!statement||!ts.isReturnStatement(statement)||!statement.expression||!ts.isObjectLiteralExpression(statement.expression))throw new Error('Fixed attribute map must remain one literal passthrough return');
  const parameterName=parameter.name.text;
  const keys=statement.expression.properties.map(property=>{
   if(!ts.isPropertyAssignment(property)||!(ts.isIdentifier(property.name)||ts.isStringLiteralLikeNode(property.name))||!ts.isIdentifier(property.initializer)||property.initializer.text!==parameterName)throw new Error('Unreviewed fixed attribute map key/value');
   return property.name.text;
  });
  if(JSON.stringify(keys)!==JSON.stringify(expected))throw new Error('Fixed attribute map ownership changed');
 });
}
