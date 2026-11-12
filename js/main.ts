// Gate full initialization before evaluating any profile or integration owner.
import {getHostedTransition} from '../shared/hosted-transition.js';
const recover = !!localStorage.getItem('labcharts-migration-pending') || getHostedTransition(location.origin)?.phase === 'recovery';
if (recover) location.replace('/app/migration.html');
export const initialization: Promise<unknown> = recover ? Promise.resolve() : import('./main-runtime.js');
