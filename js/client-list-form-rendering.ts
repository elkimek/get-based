import {renderHTML} from './components/ClientListFormPresentation.svelte.html.js';
import type {ClientFormAvatar,ClientFormFragmentView,ClientFormView} from './client-list-form-presentation.js';
export function renderClientListForm(view:ClientFormView):string {return renderHTML({view});}
export function renderClientFormAvatar(avatar:ClientFormAvatar):string {return renderHTML({view:{kind:'avatar',avatar}});}
export function renderClientFormTagBody(view:ClientFormFragmentView):string {return renderHTML({view});}
