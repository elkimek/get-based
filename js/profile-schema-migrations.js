// @ts-check
// profile-schema-migrations.js — Copy-on-write, sequential profile migrations.

import { migrateProfileData } from './profile-data-migrations.js';

/** @typedef {Record<string, any>} ProfileObject */
/**
 * @typedef {{
 *   id: string,
 *   fromVersion: number,
 *   toVersion: number,
 *   migrate: (draft: ProfileObject) => void,
 * }} ProfileMigrationStep
 */
/**
 * @typedef {{
 *   ok: false,
 *   mode: 'shadow',
 *   targetVersion: number,
 *   error: { code: string, message: string, [key: string]: unknown },
 * }} ProfileMigrationFailure
 */
/**
 * @typedef {{
 *   ok: true,
 *   mode: 'shadow',
 *   fromVersion: number,
 *   toVersion: number,
 *   changed: boolean,
 *   appliedMigrations: Array<{ id: string, fromVersion: number, toVersion: number }>,
 *   validation: { counts: Record<string, number>, identifiedRecords: number },
 *   data: ProfileObject,
 * }} ProfileMigrationSuccess
 */
/** @typedef {ProfileMigrationFailure | ProfileMigrationSuccess} ProfileMigrationResult */

export const LEGACY_PROFILE_SCHEMA_VERSION = 0;
export const CURRENT_PROFILE_SCHEMA_VERSION = 1;

const REQUIRED_COLLECTIONS = Object.freeze([
  'entries',
  'notes',
  'supplements',
  'healthGoals',
  'changeHistory',
  'importSnapshots',
  'sunSessions',
  'deviceSessions',
  'lightDevices',
  'lightMeasurements',
  'lightAudits',
]);

const REQUIRED_MAPS = Object.freeze([
  'customMarkers',
  'markerNotes',
  'markerValueNotes',
  'biologyScoreAI',
  'contextSourceSettings',
]);

// These roots are the complete mutation surface of the existing migration
// chain and its marker-repair helpers. Any other existing root must compare
// equal after a migration.
const CONTENT_MUTABLE_ROOTS = new Set([
  'sleepCircadian',
  'sleepRest',
  'lightCircadian',
  'circadian',
  'sleep',
  'fieldExperts',
  'fieldLens',
  'interpretiveLens',
  'diagnoses',
  'diet',
  'exercise',
  'customMarkers',
  'entries',
  'manualValues',
  'markerLabels',
  'markerNotes',
  'markerValueNotes',
  'refOverrides',
  'importSnapshots',
  'emfAssessment',
  'contextSourceSettings',
  'lightEnvironment',
  'sunDefaults',
]);

// These fields may be added when absent, but an existing value may not be
// rewritten unless the root also appears in CONTENT_MUTABLE_ROOTS.
const INITIALIZED_ROOTS = new Set([
  'entries',
  'notes',
  'supplements',
  'healthGoals',
  'sleepRest',
  'lightCircadian',
  'stress',
  'loveLife',
  'environment',
  'interpretiveLens',
  'contextNotes',
  'customMarkers',
  'menstrualCycle',
  'emfAssessment',
  'genetics',
  'markerNotes',
  'markerValueNotes',
  'biologyScoreAI',
  'contextSourceSettings',
  'changeHistory',
  'importSnapshots',
  'biometrics',
  'sunSessions',
  'deviceSessions',
  'lightDevices',
  'lightEnvironment',
  'lightMeasurements',
  'lightAudits',
  'sunCorrelations',
  'lifelightProfile',
  'sunDefaults',
]);

/** @param {unknown} value */
function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * @param {unknown} value
 * @param {Set<object>} [ancestors]
 * @returns {string | null}
 */
function findUnsupportedProfileValue(value, ancestors = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? null : 'NON_FINITE_NUMBER';
  if (typeof value !== 'object') return 'NON_JSON_VALUE';
  if (ancestors.has(/** @type {object} */ (value))) return 'CYCLIC_VALUE';
  if (!Array.isArray(value) && !isPlainObject(value)) return 'NON_PLAIN_OBJECT';

  ancestors.add(/** @type {object} */ (value));
  const children = Array.isArray(value) ? value : Object.values(value);
  for (const child of children) {
    const issue = findUnsupportedProfileValue(child, ancestors);
    if (issue) return issue;
  }
  ancestors.delete(/** @type {object} */ (value));
  return null;
}

/** @param {ProfileObject} value */
function cloneProfileObject(value) {
  return /** @type {ProfileObject} */ (JSON.parse(JSON.stringify(value)));
}

/** @param {unknown} left @param {unknown} right */
function jsonEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

/** @param {unknown} value */
function profileSchemaVersion(value) {
  if (
    !isPlainObject(value)
    || !Object.hasOwn(/** @type {object} */ (value), 'schemaVersion')
  ) {
    return LEGACY_PROFILE_SCHEMA_VERSION;
  }
  return /** @type {ProfileObject} */ (value).schemaVersion;
}

/** @param {ProfileObject} draft */
function migrateLegacyProfileToV1(draft) {
  if (draft.entries === undefined) draft.entries = [];
  if (draft.notes === undefined) draft.notes = [];
  if (draft.supplements === undefined) draft.supplements = [];
  migrateProfileData(/** @type {import('../types/app-state.js').ProfileData} */ (draft));
  draft.schemaVersion = 1;
}

/** @type {readonly ProfileMigrationStep[]} */
export const PROFILE_MIGRATION_REGISTRY = Object.freeze([
  Object.freeze({
    id: 'profile-v0-to-v1-normalize',
    fromVersion: 0,
    toVersion: 1,
    migrate: migrateLegacyProfileToV1,
  }),
]);

/**
 * @param {unknown} registry
 * @returns {{ ok: true, stepsByVersion: Map<number, ProfileMigrationStep> } | { ok: false, reason: string }}
 */
function compileMigrationRegistry(registry) {
  if (!Array.isArray(registry)) return { ok: false, reason: 'REGISTRY_NOT_ARRAY' };
  const stepsByVersion = new Map();
  for (const candidate of registry) {
    if (!isPlainObject(candidate)) return { ok: false, reason: 'STEP_NOT_OBJECT' };
    const step = /** @type {ProfileMigrationStep} */ (candidate);
    if (!/^[a-z0-9][a-z0-9-]{2,80}$/.test(step.id || '')) {
      return { ok: false, reason: 'STEP_ID_INVALID' };
    }
    if (!Number.isInteger(step.fromVersion) || step.fromVersion < 0) {
      return { ok: false, reason: 'STEP_FROM_VERSION_INVALID' };
    }
    if (step.toVersion !== step.fromVersion + 1) {
      return { ok: false, reason: 'STEP_NOT_SEQUENTIAL' };
    }
    if (typeof step.migrate !== 'function') return { ok: false, reason: 'STEP_MIGRATOR_INVALID' };
    if (stepsByVersion.has(step.fromVersion)) return { ok: false, reason: 'STEP_DUPLICATE_SOURCE' };
    stepsByVersion.set(step.fromVersion, step);
  }
  return { ok: true, stepsByVersion };
}

/**
 * Check registry structure without executing a migration.
 * @param {unknown} [registry]
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function validateProfileMigrationRegistry(registry = PROFILE_MIGRATION_REGISTRY) {
  const compiled = compileMigrationRegistry(registry);
  return compiled.ok ? { ok: true } : compiled;
}

/** @param {ProfileObject} data */
function collectionSummary(data) {
  const counts = /** @type {Record<string, number>} */ ({});
  let identifiedRecords = 0;
  for (const field of REQUIRED_COLLECTIONS) {
    const collection = data[field];
    if (!Array.isArray(collection)) continue;
    counts[field] = collection.length;
    identifiedRecords += collection.filter(item => (
      isPlainObject(item)
      && Object.hasOwn(/** @type {ProfileObject} */ (item), 'id')
    )).length;
  }
  return { counts, identifiedRecords };
}

/** @param {ProfileObject} data @param {string} field */
function collectionIdentitySignature(data, field) {
  const collection = data[field];
  if (!Array.isArray(collection)) return null;
  return collection.map(item => {
    if (!isPlainObject(item) || !Object.hasOwn(item, 'id')) return null;
    const id = /** @type {ProfileObject} */ (item).id;
    return typeof id === 'string' || typeof id === 'number' ? `${typeof id}:${id}` : null;
  });
}

/**
 * @param {ProfileObject} before
 * @param {ProfileObject} after
 * @param {number} targetVersion
 * @returns {{ ok: true, summary: ReturnType<typeof collectionSummary> } | { ok: false, reason: string, field?: string }}
 */
function validateMigratedProfile(before, after, targetVersion) {
  if (!isPlainObject(after)) return { ok: false, reason: 'PROFILE_NOT_OBJECT' };
  if (after.schemaVersion !== targetVersion) return { ok: false, reason: 'VERSION_STAMP_MISMATCH' };

  for (const field of REQUIRED_COLLECTIONS) {
    if (!Array.isArray(after[field])) return { ok: false, reason: 'REQUIRED_COLLECTION_INVALID', field };
    if (Array.isArray(before[field]) && before[field].length !== after[field].length) {
      return { ok: false, reason: 'COLLECTION_COUNT_CHANGED', field };
    }
    const beforeIds = collectionIdentitySignature(before, field);
    const afterIds = collectionIdentitySignature(after, field);
    if (beforeIds && !jsonEqual(beforeIds, afterIds)) {
      return { ok: false, reason: 'COLLECTION_IDENTITY_CHANGED', field };
    }
  }

  for (const field of REQUIRED_MAPS) {
    if (!isPlainObject(after[field])) return { ok: false, reason: 'REQUIRED_MAP_INVALID', field };
  }

  const allRoots = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const field of allRoots) {
    if (field === 'schemaVersion' || CONTENT_MUTABLE_ROOTS.has(field)) continue;
    if (!Object.hasOwn(before, field) && INITIALIZED_ROOTS.has(field)) continue;
    if (!Object.hasOwn(before, field) || !Object.hasOwn(after, field)) {
      return { ok: false, reason: 'PROTECTED_ROOT_SET_CHANGED', field };
    }
    if (!jsonEqual(before[field], after[field])) {
      return { ok: false, reason: 'PROTECTED_ROOT_VALUE_CHANGED', field };
    }
  }

  return { ok: true, summary: collectionSummary(after) };
}

/**
 * Run profile migrations against a detached copy. This function never writes
 * storage and never mutates the caller's value.
 *
 * @param {unknown} input
 * @param {{ targetVersion?: number, registry?: readonly ProfileMigrationStep[] }} [options]
 * @returns {ProfileMigrationResult}
 */
export function runProfileMigrationsInShadow(input, options = {}) {
  const targetVersion = options.targetVersion ?? CURRENT_PROFILE_SCHEMA_VERSION;
  /**
   * @param {string} code
   * @param {string} message
   * @param {Record<string, unknown>} [extra]
   * @returns {ProfileMigrationFailure}
   */
  const fail = (code, message, extra = {}) => ({
    ok: false,
    mode: 'shadow',
    targetVersion,
    error: { code, message, ...extra },
  });

  if (!isPlainObject(input)) {
    return fail('PROFILE_INPUT_INVALID', 'Profile data must be a plain object.');
  }
  const unsupported = findUnsupportedProfileValue(input);
  if (unsupported) {
    return fail('PROFILE_INPUT_UNSERIALIZABLE', 'Profile data is not safely serializable.', { reason: unsupported });
  }
  if (!Number.isInteger(targetVersion) || targetVersion < 1 || targetVersion > CURRENT_PROFILE_SCHEMA_VERSION) {
    return fail('PROFILE_TARGET_VERSION_INVALID', 'Requested profile schema version is unsupported.');
  }

  const fromVersion = profileSchemaVersion(input);
  if (!Number.isInteger(fromVersion) || fromVersion < 0) {
    return fail('PROFILE_SCHEMA_VERSION_INVALID', 'Stored profile schema version is invalid.');
  }
  if (fromVersion > CURRENT_PROFILE_SCHEMA_VERSION) {
    return fail('PROFILE_SCHEMA_VERSION_FUTURE', 'This profile requires a newer GetBased version.', { fromVersion });
  }
  if (fromVersion > targetVersion) {
    return fail('PROFILE_DOWNGRADE_UNSUPPORTED', 'Profile schema downgrades are not supported.', { fromVersion });
  }

  const compiled = compileMigrationRegistry(options.registry ?? PROFILE_MIGRATION_REGISTRY);
  if ('reason' in compiled) {
    return fail('MIGRATION_REGISTRY_INVALID', 'Profile migration registry is invalid.', { reason: compiled.reason });
  }

  const before = cloneProfileObject(/** @type {ProfileObject} */ (input));
  const draft = cloneProfileObject(before);
  const appliedMigrations = [];
  let version = fromVersion;
  while (version < targetVersion) {
    const step = compiled.stepsByVersion.get(version);
    if (!step) {
      return fail('MIGRATION_STEP_MISSING', 'A required profile migration step is unavailable.', { fromVersion: version });
    }
    try {
      step.migrate(draft);
    } catch {
      return fail('MIGRATION_STEP_FAILED', 'A profile migration step failed safely.', { migrationId: step.id });
    }
    if (draft.schemaVersion !== step.toVersion) {
      return fail('MIGRATION_VERSION_NOT_ADVANCED', 'A profile migration did not stamp its target version.', { migrationId: step.id });
    }
    appliedMigrations.push({ id: step.id, fromVersion: step.fromVersion, toVersion: step.toVersion });
    version = step.toVersion;
  }

  const validation = validateMigratedProfile(before, draft, targetVersion);
  if ('reason' in validation) {
    return fail('PROFILE_VALIDATION_FAILED', 'Shadow-migrated profile data failed validation.', {
      reason: validation.reason,
      ...('field' in validation && validation.field ? { field: validation.field } : {}),
    });
  }

  return {
    ok: true,
    mode: 'shadow',
    fromVersion,
    toVersion: targetVersion,
    changed: !jsonEqual(before, draft),
    appliedMigrations,
    validation: validation.summary,
    data: draft,
  };
}
