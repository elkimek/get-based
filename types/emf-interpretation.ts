import type{callAssistantFeatureAI,getAssistantFeatureIdentity}from'../js/ai-feature-routing.js';
import type{renderEMFMitigationRecs}from'../js/health-data-loader.js';
import type{getEMFSeverity,calculateCost,trackUsage}from'../js/schema.js';
import type{AssessmentOperations as EditorAssessment, RoomOperations as EditorRoom}from'./emf-editor.js';
export type SeverityReader=(type:Parameters<typeof getEMFSeverity>[0],value:unknown,sleeping?:Parameters<typeof getEMFSeverity>[2])=>ReturnType<typeof getEMFSeverity>;
export type CostReader=(provider:unknown,model:unknown,input:unknown,output:unknown)=>ReturnType<typeof calculateCost>;
export type UsageReader=(provider:Parameters<typeof trackUsage>[0],model:Parameters<typeof trackUsage>[1],input:unknown,output:unknown)=>ReturnType<typeof trackUsage>;
export interface InterpretationOperations {text?:unknown;model?:unknown;provider?:unknown;modelId?:unknown;inputTokens?:unknown;outputTokens?:unknown;date?:unknown}
export interface TokenOperations {inputTokens?:unknown;outputTokens?:unknown}
export interface ResponseOperations {text?:unknown;usage?:unknown}
export interface GeneratedInterpretation extends TokenOperations {inputTokens:unknown;outputTokens:unknown;text:unknown;model:ReturnType<typeof getAssistantFeatureIdentity>['modelDisplay'];provider:ReturnType<typeof getAssistantFeatureIdentity>['provider'];modelId:ReturnType<typeof getAssistantFeatureIdentity>['modelId'];date:string}
export interface InterpretationDependencies {collectActiveAssessmentState?:unknown;getAssessments?:unknown}
export interface RuntimeConfigInput {callClaudeAPI?:unknown;closeModal?:unknown;openChatPanel?:unknown}
export interface RuntimeInvocationOperations {callClaudeAPI:(...args:Parameters<typeof callAssistantFeatureAI>)=>Promise<unknown>;closeModal?:((()=>unknown)|null);openChatPanel?:(((message?:string)=>unknown)|null)}
export interface InterpretationOverlay extends HTMLElement {_interpretText?:unknown;_onGenerate?:unknown;_mouseDownInside?:unknown;_delegatesInstalled?:unknown}
export interface ReplaceOperations {replace(search:RegExp,replacement:string):ReplaceOperations;trim():unknown}
// Private consumed collection and joined-tag views retain original unchecked read errors.
export type RoomOperations=Omit<EditorRoom,'sources'|'mitigations'>&{sources?:unknown[]|null;mitigations?:unknown[]|null};
export type AssessmentOperations=Omit<EditorAssessment,'rooms'>&{rooms:RoomOperations[];interpretation?:unknown};

export type MitigationRendererReader=(catalog:Parameters<typeof renderEMFMitigationRecs>[0],tags:unknown[],options?:Parameters<typeof renderEMFMitigationRecs>[2])=>ReturnType<typeof renderEMFMitigationRecs>;

export interface ErrorOperations {name?:unknown;message?:unknown}
