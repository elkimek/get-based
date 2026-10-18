import {renderHTML} from './components/EMFPhoto.svelte.html.js';

export interface EMFPhotoView {
  readonly source: string;
  readonly name: string;
}

export function renderEMFPhoto(view: EMFPhotoView): string {
  return renderHTML({view});
}
