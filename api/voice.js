// Vercel Web-standard entrypoint for the bounded BYOK Voice relay.

import { handler } from '../lib/voice-relay-handler.js';

export { handler };
export default { fetch: handler };
