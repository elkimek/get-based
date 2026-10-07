// Shared shell ownership for authored context dialogs at the stable detail modal.
export function prepareContextFormDialog(modal: HTMLElement, title: string, titleId: string): void {
  modal.replaceChildren();
  modal.className = 'modal gb:context-form:w-[min(94vw,760px)] gb:context-form:max-w-[760px] gb:context-form:max-h-[min(90vh,860px)] gb:context-form:p-0 gb:context-form:overflow-y-auto gb:context-form:overflow-x-hidden gb:context-form:bg-secondary-surface gb:context-form:shadow-dialog gb:context-form:max-[720px]:w-[calc(100vw-24px)] gb:context-form:max-[720px]:max-h-[calc(100dvh-24px)]';
  modal.dataset.contextFormModal = '';
  delete modal.dataset.syncRefreshKind;
  modal.setAttribute('aria-labelledby', titleId);
  modal.setAttribute('aria-label', title);
  modal.scrollTop = 0;
}
export function releaseContextFormDialog(modal: HTMLElement, root: HTMLElement, title: string, titleId: string): void {
  const replacement = modal.querySelector('[data-context-form-view]');
  if (replacement && replacement !== root) return;
  delete modal.dataset.contextFormModal;
  if (modal.getAttribute('aria-labelledby') === titleId) modal.removeAttribute('aria-labelledby');
  if (modal.getAttribute('aria-label') === title) modal.removeAttribute('aria-label');
  for (const token of [...modal.classList]) if (token.startsWith('gb:context-form:')) modal.classList.remove(token);
}
