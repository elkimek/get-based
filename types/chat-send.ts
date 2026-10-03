import type {ChatAttachment} from '../js/chat-images.js';
import type {buildVisionContent,formatImageBlock} from '../js/image-utils.js';
import type {callCodexAgent} from '../js/agent-chat-backend.js';
import type {callChatAPIWithContinuation} from '../js/chat-continuation.js';
export interface ChatSendOptions {prepareRetry?:unknown;retry?:{content?:unknown;attachments?:unknown}|null}
export interface ActiveChatGenerationUI {container:HTMLElement;typingEl:HTMLElement;aiMsgEl:HTMLElement|null;labelEl:HTMLElement|null;personalityName:unknown;isCurrent:()=>boolean}
export interface TypewriterTarget {length:number;slice(start:number,end:number):unknown}
export interface ChatSendMessage extends Record<string,unknown> {role:string;content:unknown;context?:unknown;personalityName?:unknown;personalityIcon?:unknown;provider?:unknown;agentId?:unknown;modelId?:unknown;modelDisplay?:unknown;lensSources?:{length?:unknown}|null}
export type VisionMessages = Array<{role:unknown;content:string|undefined|ReturnType<typeof buildVisionContent>}>;
export type RawImageFormatter = (base64:unknown,mediaType:unknown,provider:Parameters<typeof formatImageBlock>[2])=>ReturnType<typeof formatImageBlock>;
export type RawVisionBuilder = (blocks:Parameters<typeof buildVisionContent>[0],text:string|undefined,provider:Parameters<typeof buildVisionContent>[2])=>ReturnType<typeof buildVisionContent>;
export type RawAgentCaller = (options:Omit<Parameters<typeof callCodexAgent>[0],'history'|'images'> & {history?:Array<{role:unknown;content:string}>;images?:Array<{base64?:unknown;mediaType?:unknown}>})=>ReturnType<typeof callCodexAgent>;
export type RawDirectCaller = (options:Omit<Parameters<typeof callChatAPIWithContinuation>[0],'messages'> & {messages:VisionMessages})=>ReturnType<typeof callChatAPIWithContinuation>;
export interface RawSendError {name?:unknown;_modalShown?:unknown;message?:unknown;code?:unknown}
export interface EMFAssessmentOperations {date:string}
export type RawAttachments = ChatAttachment[];
