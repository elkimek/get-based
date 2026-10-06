import type { WearableConnection } from './wearable-persistence-types.js';
import type { WearableConnectionSummary } from './wearables-summary-model.js';
// Derive public source summaries without carrying account details or credentials.
export function summarizeWearableConnections(
  connections: Readonly<Record<string, WearableConnection>>,
  eligible: (adapterId: string, connection: WearableConnection) => boolean,
): Record<string, WearableConnectionSummary> {
  const summaries: Record<string, WearableConnectionSummary> = {};
  for (const [id, connection] of Object.entries(connections)) {
    if (connection?.connectedAt && eligible(id, connection)) {
      summaries[id] = { connectedSince: connection.connectedAt, lastSyncAt: connection.lastSyncAt || 0 };
    }
  }
  return summaries;
}
