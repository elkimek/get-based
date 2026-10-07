import type { Component } from 'svelte';
import type { PersonaEditorContent, PersonaEditorActions } from '../chat-persona-editor-contract.js';
declare const ChatPersonalityEditor: Component<{ content: PersonaEditorContent; actions: PersonaEditorActions }>;
export default ChatPersonalityEditor;
export { mount, unmount, flushSync } from 'svelte';
