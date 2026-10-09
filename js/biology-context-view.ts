import {getBiologyContextReviewView} from './biology-score-context-ai.js';
import {getBiologyProfileContext} from './profile-context.js';
import {projectBiologyContextLabels} from './biology-context-presentation.js';
import {renderHTML} from './components/BiologyContextPresentation.svelte.html.js';

/** Snapshot the section without moving request or persistence ownership. */
export function getBiologyContextSectionView(data: Parameters<typeof getBiologyContextReviewView>[0] = null) {
  return {labels:projectBiologyContextLabels(getBiologyProfileContext()),review:getBiologyContextReviewView(data)};
}
export function renderBiologyContextSection(data: Parameters<typeof getBiologyContextReviewView>[0] = null): string {
  return renderHTML({kind:'section',view:getBiologyContextSectionView(data)});
}
