import type { AppNavigationRequest } from '../shared/app-navigation-contract.js';
export interface AppNavigationReceipt { changed: boolean; requiresUserAction?: true; nextAction?: string; opened?: string | null; reason?: string; settingsSaved?: boolean; credentialsEntered?: false; dataSaved?: false; labRange?: string; layout?: string; scope?: string; firstDate?: string; secondDate?: string; undoId?: string; undone?: boolean; persistenceUncertain?: boolean; status?: 'pending_user_confirmation'; saved?: false }
type Navigation = (request: AppNavigationRequest, canOpen: () => boolean, isOwnerCurrent: () => boolean) => Promise<AppNavigationReceipt>;
let openNative: Navigation | null = null;
export function configureAppNavigation(callback: Navigation) { const previous = openNative; openNative = callback; return previous; }
export async function openNativeAppDestination(request: AppNavigationRequest, canOpen: () => boolean, isOwnerCurrent = canOpen): Promise<AppNavigationReceipt> {
  if (!canOpen()) return { changed: false, reason: 'The navigation request expired.' };
  return openNative ? openNative(request, canOpen, isOwnerCurrent) : { changed: false, reason: 'Native navigation is not available yet.' };
}
