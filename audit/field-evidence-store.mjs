/** Local testing only: private SQLite storage, never production authentication. */
import {DatabaseSync} from 'node:sqlite';
import {existsSync, mkdirSync, lstatSync, realpathSync, openSync, closeSync} from 'node:fs';
import {dirname, resolve, join, relative, isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';

const REPOSITORY = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
const APP_ID = 0x53414649;
const inside = (parent, child) => { const p = relative(parent, child); return p === '' || (!p.startsWith('..') && !isAbsolute(p)); };

export function openEvidenceStore({storageDir, maxPhotoBytes = 50 * 1024 * 1024, maxPhotos = 100} = {}) {
  let filename = ':memory:';
  let isNew = true;
  if (storageDir) {
    const directory = resolve(storageDir);
    if (inside(REPOSITORY, directory)) throw new Error('Evidence must be stored outside the code repository.');
    // Check the closest existing ancestor before creating anything.
    let ancestor = directory;
    while (!existsSync(ancestor)) ancestor = dirname(ancestor);
    if (inside(REPOSITORY, realpathSync(ancestor))) throw new Error('Evidence directory resolves inside the repository.');
    mkdirSync(directory, {recursive: true, mode: 0o700});
    const stat = lstatSync(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink() || inside(REPOSITORY, realpathSync(directory))) {
      throw new Error('Use a dedicated real directory outside the repository.');
    }
    if (process.platform !== 'win32' && (stat.mode & 0o077)) throw new Error('Evidence directory must have mode 0700.');
    filename = join(realpathSync(directory), 'field-demo.sqlite');
    isNew = !existsSync(filename);
    if (isNew) { const fd = openSync(filename, 'wx', 0o600); closeSync(fd); }
    else {
      const f = lstatSync(filename);
      if (!f.isFile() || f.isSymbolicLink() || f.nlink !== 1 ||
          (process.platform !== 'win32' && (f.mode & 0o077))) throw new Error('Unsafe evidence database file.');
    }
  }
  const db = new DatabaseSync(filename);
  try {
    if (!isNew && (db.prepare('PRAGMA application_id').get().application_id !== APP_ID ||
        db.prepare('PRAGMA user_version').get().user_version !== 1)) throw new Error('Unrecognized evidence database; no migration performed.');
    db.exec('PRAGMA busy_timeout=3000; PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;');
    db.exec(`CREATE TABLE IF NOT EXISTS entries(bucket TEXT NOT NULL, key TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(bucket,key)) STRICT;
      CREATE TABLE IF NOT EXISTS photos(token TEXT PRIMARY KEY, bytes BLOB NOT NULL) STRICT;
      PRAGMA application_id=${APP_ID}; PRAGMA user_version=1;`);
    if (db.prepare('PRAGMA quick_check').get().quick_check !== 'ok') throw new Error('Evidence database failed integrity check.');
  } catch (error) { db.close(); throw error; }
  const read = db.prepare('SELECT payload FROM entries WHERE bucket=? AND key=?');
  const write = db.prepare('INSERT INTO entries(bucket,key,payload) VALUES(?,?,?) ON CONFLICT(bucket,key) DO UPDATE SET payload=excluded.payload');
  const all = db.prepare('SELECT payload FROM entries WHERE bucket=? ORDER BY rowid');
  const bytes = db.prepare('SELECT bytes FROM photos WHERE token=?');
  let closed = false;
  const collections = {};
  for (const bucket of ['records', 'photoTokens', 'correctionReplies']) {
    collections[bucket] = {
      get(key) { const row = read.get(bucket, key); return row ? JSON.parse(row.payload) : undefined; },
      has(key) { return !!read.get(bucket, key); },
      set(key, value) {
        if (!read.get(bucket,key) && db.prepare('SELECT COUNT(*) AS n FROM entries').get().n >= 2000) {
          throw Object.assign(new Error('Demo record limit reached. No records were removed.'), {status:507});
        }
        write.run(bucket, key, JSON.stringify(value));
      },
      values() { return all.all(bucket).map(row => JSON.parse(row.payload)); }
    };
  }
  return {
    ...collections,
    persistent: !!storageDir,
    transaction(fn) {
      db.exec('BEGIN IMMEDIATE');
      try { const result = fn(); if (result?.then) throw new Error('Async work is not allowed inside a storage transaction.'); db.exec('COMMIT'); return result; }
      catch (error) { db.exec('ROLLBACK'); throw error; }
    },
    addPhoto(token, data) {
      if (!storageDir) return;
      const usage = db.prepare('SELECT COUNT(*) AS count, COALESCE(SUM(length(bytes)),0) AS size FROM photos').get();
      if (usage.count >= maxPhotos || usage.size + data.length > maxPhotoBytes) {
        throw Object.assign(new Error('Demo photo storage is full. No existing evidence was deleted.'), {status:507});
      }
      db.prepare('INSERT INTO photos(token,bytes) VALUES(?,?)').run(token, data);
    },
    photo(token) { const row = bytes.get(token); return row ? Buffer.from(row.bytes) : null; },
    usage() { return db.prepare('SELECT COUNT(*) AS photos, COALESCE(SUM(length(bytes)),0) AS bytes FROM photos').get(); },
    close() { if (!closed) { db.close(); closed = true; } }
  };
}
