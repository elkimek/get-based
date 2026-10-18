import assert from 'node:assert/strict';
import inverse from '../fixtures/category-page-chrome-sink-inverse.json' with {type:'json'};
/** Restore only the qualified seven-sink Category page AST fingerprint for prior
 * policy predicates. Scanned counts, all foreign fingerprints and policy rules
 * are copied exactly; the actual new surface is independently checked at source. */
export function restoreCategoryPageChromeSinkFingerprint<T extends {files:Record<string,unknown>}>(policy:T):T {
 assert.equal(inverse.exactUnchangedSinkCount,7);
 assert.deepEqual(policy.files[inverse.changedRuntimeURL],inverse.afterFingerprint,'Exact actual Category page assignment surface');
 return{...policy,files:{...policy.files,[inverse.changedRuntimeURL]:inverse.beforeFingerprint}};
}
