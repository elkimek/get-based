// @ts-check
// Node-only persistent object store for encrypted profile-share envelopes.
// The schema is deliberately generic so the runtime-neutral service can keep
// its existing atomic share, TTL, cleanup, and rate-marker behavior.

import { createHmac } from 'node:crypto';
import {
  chmodSync,
  mkdirSync,
  statfsSync,
} from 'node:fs';
import { dirname, isAbsolute } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const DEFAULT_MAX_DATABASE_BYTES = 512 * 1024 * 1024;
const MIN_MAX_DATABASE_BYTES = 64 * 1024 * 1024;
const MAX_MAX_DATABASE_BYTES = 4 * 1024 * 1024 * 1024;
const MAX_OBJECT_BYTES = 4 * 1024 * 1024;
const MIN_FREE_BYTES = 256 * 1024 * 1024;
const PATHNAME_RE = /^[A-Za-z0-9._/-]{1,512}$/;

export class ProfileShareStoreConflictError extends Error {
  constructor(message = 'Profile-share object already exists.') {
    super(message);
    this.name = 'ProfileShareStoreConflictError';
    this.code = 'PROFILE_SHARE_PRECONDITION_FAILED';
  }
}

function boundedInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isSafeInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

function validatePathname(pathname) {
  const normalized = String(pathname || '');
  if (!PATHNAME_RE.test(normalized) || normalized.includes('..')) {
    throw new Error('Invalid profile-share storage pathname.');
  }
  return normalized;
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw signal.reason || new Error('Profile-share storage operation aborted.');
}

function sqliteConflict(error) {
  return error instanceof ProfileShareStoreConflictError
    || /unique constraint|primary key|already exists/i.test(String(error?.message || ''));
}

function beginTransaction(database) {
  database.exec('BEGIN IMMEDIATE');
  let finished = false;
  return {
    commit() {
      if (finished) return;
      database.exec('COMMIT');
      finished = true;
    },
    rollback() {
      if (finished) return;
      try { database.exec('ROLLBACK'); } catch {}
      finished = true;
    },
  };
}

/**
 * @param {{
 *   databasePath: string,
 *   rateLimitHmacKey: string,
 *   maxDatabaseBytes?: number | string,
 * }} settings
 * @returns {import('./profile-share-service.js').ProfileShareObjectStore & {
 *   check: () => void,
 *   close: () => void,
 *   databasePath: string,
 * }}
 */
export function createSqliteProfileShareStore(settings) {
  const databasePath = String(settings?.databasePath || '').trim();
  if (!databasePath || !isAbsolute(databasePath)) {
    throw new Error('PROFILE_SHARE_SQLITE_PATH must be an absolute path.');
  }
  const rateLimitHmacKey = String(settings?.rateLimitHmacKey || '');
  if (rateLimitHmacKey.length < 32) {
    throw new Error('PROFILE_SHARE_RATE_LIMIT_KEY must contain at least 32 characters.');
  }
  const maxDatabaseBytes = boundedInteger(
    settings?.maxDatabaseBytes,
    DEFAULT_MAX_DATABASE_BYTES,
    MIN_MAX_DATABASE_BYTES,
    MAX_MAX_DATABASE_BYTES,
  );
  const databaseDirectory = dirname(databasePath);
  mkdirSync(databaseDirectory, { recursive: true, mode: 0o700 });
  chmodSync(databaseDirectory, 0o700);

  const database = new DatabaseSync(databasePath, {
    open: true,
    readOnly: false,
    allowExtension: false,
    enableForeignKeyConstraints: true,
  });
  database.exec('PRAGMA busy_timeout = 5000');
  database.exec('PRAGMA journal_mode = WAL');
  database.exec('PRAGMA synchronous = FULL');
  database.exec('PRAGMA temp_store = MEMORY');
  database.exec('PRAGMA trusted_schema = OFF');
  const pageSizeRow = database.prepare('PRAGMA page_size').get();
  const pageSize = Number(pageSizeRow?.page_size) || 4096;
  const maxPageCount = Math.max(1, Math.floor(maxDatabaseBytes / pageSize));
  database.exec(`PRAGMA max_page_count = ${maxPageCount}`);
  database.exec(`
    CREATE TABLE IF NOT EXISTS profile_share_objects (
      pathname TEXT PRIMARY KEY NOT NULL,
      body TEXT NOT NULL,
      uploaded_at INTEGER NOT NULL,
      content_type TEXT NOT NULL DEFAULT 'application/json'
    ) STRICT;
  `);
  chmodSync(databasePath, 0o600);

  const selectObject = database.prepare(
    'SELECT body FROM profile_share_objects WHERE pathname = ?',
  );
  const insertObject = database.prepare(`
    INSERT INTO profile_share_objects (pathname, body, uploaded_at, content_type)
    VALUES (?, ?, ?, ?)
  `);
  const upsertObject = database.prepare(`
    INSERT INTO profile_share_objects (pathname, body, uploaded_at, content_type)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(pathname) DO UPDATE SET
      body = excluded.body,
      uploaded_at = excluded.uploaded_at,
      content_type = excluded.content_type
  `);
  const listObjects = database.prepare(`
    SELECT pathname, uploaded_at
    FROM profile_share_objects
    WHERE substr(pathname, 1, ?) = ?
      AND pathname > ?
    ORDER BY pathname
    LIMIT ?
  `);
  const deleteObject = database.prepare(
    'DELETE FROM profile_share_objects WHERE pathname = ?',
  );
  const pageCountStatement = database.prepare('PRAGMA page_count');

  function ensureWriteCapacity(bodyBytes) {
    const pageCount = Number(pageCountStatement.get()?.page_count) || 0;
    if ((pageCount * pageSize) + bodyBytes > maxDatabaseBytes) {
      throw new Error('Profile-share storage capacity reached.');
    }
    const filesystem = statfsSync(databaseDirectory);
    const availableBytes = Number(filesystem.bavail) * Number(filesystem.bsize);
    if (Number.isFinite(availableBytes) && availableBytes < MIN_FREE_BYTES + bodyBytes) {
      throw new Error('Profile-share host disk reserve reached.');
    }
  }

  return {
    databasePath,
    async get(pathname, options = {}) {
      throwIfAborted(options.abortSignal);
      const row = selectObject.get(validatePathname(pathname));
      throwIfAborted(options.abortSignal);
      return typeof row?.body === 'string' ? row.body : null;
    },
    async put(pathname, body, options = {}) {
      throwIfAborted(options.abortSignal);
      const normalizedPath = validatePathname(pathname);
      const text = String(body);
      const bodyBytes = Buffer.byteLength(text, 'utf8');
      if (bodyBytes > MAX_OBJECT_BYTES) {
        throw new Error('Profile-share storage object is too large.');
      }
      ensureWriteCapacity(bodyBytes);
      const values = [
        normalizedPath,
        text,
        Date.now(),
        String(options.contentType || 'application/json'),
      ];
      try {
        if (options.allowOverwrite) upsertObject.run(...values);
        else insertObject.run(...values);
      } catch (error) {
        if (sqliteConflict(error)) throw new ProfileShareStoreConflictError();
        throw error;
      }
      throwIfAborted(options.abortSignal);
      return { pathname: normalizedPath };
    },
    async list(options = {}) {
      throwIfAborted(options.abortSignal);
      const prefix = String(options.prefix || '');
      if (prefix && (!PATHNAME_RE.test(prefix) || prefix.includes('..'))) {
        throw new Error('Invalid profile-share storage prefix.');
      }
      const cursor = options.cursor ? validatePathname(options.cursor) : '';
      const limit = boundedInteger(options.limit, 100, 1, 1000);
      const rows = listObjects.all(prefix.length, prefix, cursor, limit + 1);
      const hasMore = rows.length > limit;
      const page = rows.slice(0, limit);
      throwIfAborted(options.abortSignal);
      return {
        blobs: page.map(row => ({
          pathname: String(row.pathname),
          uploadedAt: new Date(Number(row.uploaded_at)),
        })),
        hasMore,
        ...(hasMore && page.length ? { cursor: String(page.at(-1)?.pathname || '') } : {}),
      };
    },
    async delete(pathnames, options = {}) {
      throwIfAborted(options.abortSignal);
      const normalizedPaths = Array.from(new Set(pathnames.map(validatePathname)));
      const transaction = beginTransaction(database);
      try {
        for (const pathname of normalizedPaths) deleteObject.run(pathname);
        transaction.commit();
      } catch (error) {
        transaction.rollback();
        throw error;
      }
      throwIfAborted(options.abortSignal);
    },
    isPreconditionFailure(error) {
      return sqliteConflict(error);
    },
    hashRateLimitSubject(subject) {
      const day = new Date().toISOString().slice(0, 10);
      return createHmac('sha256', rateLimitHmacKey)
        .update(day)
        .update('\0')
        .update(String(subject || 'unknown-client'))
        .digest('hex');
    },
    check() {
      const result = database.prepare('PRAGMA quick_check').get();
      if (result?.quick_check !== 'ok') throw new Error('Profile-share database integrity check failed.');
    },
    close() {
      database.close();
    },
  };
}
