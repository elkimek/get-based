import { bytesToBase64, _base64ToBytes } from './base64.js';

export interface MigrationFile { path: string; bytes: string }
type Directory = FileSystemDirectoryHandle;
export function validMigrationFilePath(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('lens-local/') && value.length <= 1024
    && value.split('/').every(part => /^[A-Za-z0-9_.-]+$/.test(part) && part !== '.' && part !== '..');
}
export async function readMigrationFiles(): Promise<MigrationFile[]> {
  if (!navigator.storage?.getDirectory) throw new Error('This browser cannot check local Knowledge Base files. Do not clear its data.');
  const root = await navigator.storage.getDirectory();
  let directory: Directory;
  try { directory = await root.getDirectoryHandle('lens-local') as Directory; }
  catch (error) { if (error instanceof DOMException && error.name === 'NotFoundError') return []; throw error; }
  const files: MigrationFile[] = [];
  const visit = async (handle: Directory, prefix: string): Promise<void> => {
    const entries = [];
    for await (const entry of handle.entries()) entries.push(entry);
    entries.sort(([a], [b]) => a.localeCompare(b));
    for (const [name, child] of entries) {
      const path = prefix + '/' + name;
      if (!validMigrationFilePath(path)) throw new Error('A local Knowledge Base file has an unsupported path.');
      if (child.kind === 'directory') await visit(child as Directory, path);
      else {
        const file = await (child as FileSystemFileHandle).getFile();
        files.push({path, bytes: bytesToBase64(new Uint8Array(await file.arrayBuffer()))});
      }
    }
  };
  await visit(directory, 'lens-local'); return files;
}
export async function writeMigrationFiles(files: readonly MigrationFile[]): Promise<void> {
  const root = await navigator.storage.getDirectory();
  for (const file of files) {
    if (!validMigrationFilePath(file.path)) throw new Error('Invalid migration file path.');
    const parts = file.path.split('/');
    let directory = root;
    for (const name of parts.slice(0, -1)) directory = await directory.getDirectoryHandle(name, {create: true});
    const handle = await directory.getFileHandle(parts.at(-1)!, {create: true});
    const writer = await handle.createWritable();
    try { await writer.write(_base64ToBytes(file.bytes)); await writer.close(); }
    catch (error) { await writer.abort().catch(() => {}); throw error; }
    const read = new Uint8Array(await (await handle.getFile()).arrayBuffer());
    if (bytesToBase64(read) !== file.bytes) throw new Error('A restored Knowledge Base file could not be verified. Retry with the same archive.');
  }
}
