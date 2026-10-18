import {renderHTML} from './components/LegalConsentModal.svelte.html.js';
import type {LegalConsentView} from './legal-consent-view.js';
export function renderLegalConsentModal(view:LegalConsentView):string{return renderHTML({view});}
