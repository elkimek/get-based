// AI disclosure stays tied to original marker groups, independently of presentation order.
import type { ProfileData } from '../types/app-state.js';
import type { LabOrderingPatch, LabOrderingReview } from '../shared/lab-ordering-control-contract.js';
import type { NativeLabOrderScope } from './lab-ordering-native.js';
import { nativeLabOrderScope } from './lab-ordering-native.js';
import { labToolRegistry, labToolMarker, labToolMarkerGroup } from './lab-tool-markers.js';
import { isGroupInAIContext } from './lab-context-settings.js';
import { CONTEXT_SOURCE_IDS, isContextSourceEnabled } from './context-source-registry.js';
import { state } from './state.js';
export function labOrderingPolicy(data: ProfileData, scope: NativeLabOrderScope) {
  const enabled = isContextSourceEnabled(CONTEXT_SOURCE_IDS.LAB_MARKERS), catalog = labToolRegistry(data);
  const source = (key: string) => { try { labToolMarker(data, key, catalog); return true; } catch { return false; } };
  const category = scope.kind === 'markers' ? catalog[scope.id.slice('markers.'.length)] : null;
  const scopeAllowed = enabled && (!category || isGroupInAIContext(labToolMarkerGroup(scope.id.slice('markers.'.length), category)));
  const decisions = scope.items.map(item => ({ id: item.id, allowed: scopeAllowed && item.sourceKeys.length > 0 && item.sourceKeys.every(source) }));
  const visible = new Set(decisions.filter(row => row.allowed).map(row => row.id));
  const items = scope.items.filter(item => visible.has(item.id)).map(({ id, label }) => ({ id, label }));
  return { items, allVisible: scopeAllowed && decisions.length > 0 && decisions.every(row => row.allowed),
    stamp: JSON.stringify({ enabled, scopeAllowed, decisions: [...decisions].sort((a, b) => a.id.localeCompare(b.id)) }) };
}
export function canDiscloseLabOrdering(control: { profileId: string; parameters: LabOrderingPatch; baseline: LabOrderingReview }, data: ProfileData = state.importedData) {
  try {
    if (state.currentProfile !== control.profileId) return false;
    const scope = nativeLabOrderScope(data, control.parameters.scopeId), policy = labOrderingPolicy(data, scope), review = control.baseline;
    if (scope.label !== review.label || scope.kind !== review.kind) return false;
    const patch = control.parameters;
    if ('reset' in patch) return policy.allVisible;
    const item = policy.items.find(row => row.id === patch.move.item), anchor = policy.items.find(row => row.id === (patch.move.before ?? patch.move.after));
    return !!item && !!anchor && item.label === review.move?.item.label && anchor.label === review.move.anchor.label;
  } catch { return false; }
}
