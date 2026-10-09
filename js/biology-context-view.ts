import {getBiologyContextReviewView} from './biology-score-context-ai.js';
import {getBiologyProfileContext} from './profile-context.js';
import {projectBiologyContextLabels} from './biology-context-presentation.js';
import {renderHTML} from './components/BiologyContextPresentation.svelte.html.js';

/** Compose the lens section without moving request or persistence ownership. */
export function renderBiologyContextSection(data: Parameters<typeof getBiologyContextReviewView>[0] = null): string {
  return renderHTML({kind: 'section', view: {
    labels: projectBiologyContextLabels(getBiologyProfileContext()),
    review: getBiologyContextReviewView(data),
  }});
}
