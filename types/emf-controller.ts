import type{callAssistantFeatureAI,hasAssistantFeatureProvider}from'../js/ai-feature-routing.js';
import type{configureRuntimeFunctions}from'../js/runtime-callbacks.js';
import type{RoomOperations,AssessmentOperations,MeasurementOperations}from'./emf-editor.js';
// Public injected callback snapshots retain the raw getter reread value.
export interface RawAIRegistry {callClaudeAPI:unknown;hasAIProvider:unknown}
export interface RawRuntimeRegistry {closeModal:unknown}
export interface RuntimeUpdates {closeModal?:unknown}
export interface AIInvocationOperations {callClaudeAPI:(...args:Parameters<typeof callAssistantFeatureAI>)=>unknown;hasAIProvider:(...args:Parameters<typeof hasAssistantFeatureProvider>)=>unknown}
export type ConfigureAIFunctionsReader=(current:RawAIRegistry,updates:unknown,fields:Parameters<typeof configureRuntimeFunctions>[2])=>RawAIRegistry;
// Private original read/write operations, never a canonical persisted schema.
export type RoomMutationOperations=Omit<RoomOperations,'measurements'>&{[field:string]:unknown;measurements?:Record<string,MeasurementOperations|undefined>|null};
export type AssessmentMutationOperations=Omit<AssessmentOperations,'rooms'>&{[field:string]:unknown;rooms:RoomMutationOperations[]};
export interface PDFResponseOperations {text?:unknown}
export interface MatchOperations {match(pattern:RegExp):RegExpMatchArray|null}
