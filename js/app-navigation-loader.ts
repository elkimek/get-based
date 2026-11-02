// The shell registers the port; chat does not import the feature ownership graph.
import { configureAppNavigation } from './app-navigation-runtime.js';
configureAppNavigation(async (request, canOpen, isOwnerCurrent) => {
  try {
    const module = await import('./app-native-navigation.js');
    if (!canOpen()) return { changed: false, reason: 'The navigation request expired.' };
    return await module.openAppDestination(request, canOpen, isOwnerCurrent);
  } catch { return { changed: false, reason: 'This native view could not be opened. Try again.', dataSaved: false }; }
});
