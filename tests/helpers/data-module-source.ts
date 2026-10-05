/** Reconstruct the logical data module for source contracts across its service boundary. */
export function dataModuleSource(adapter: string, core: string): string {
  const boundary = "import { createDataCore } from './data-core.js';";
  const boundaryIndex = adapter.indexOf(boundary);
  if (boundaryIndex < 0) return adapter;
  const returned = /return \{\s*([\w,\s]+)\s*\};\s*\}\s*$/.exec(core);
  const factory = /export function createDataCore\(ports\) \{/.exec(core);
  if (!returned || !factory) throw new Error('Data core source boundary does not match its factory');
  const publicFunctions = new Set(returned[1]!.split(',').map(name => name.trim()).filter(Boolean));
  const body = core.slice(factory.index + factory[0].length, returned.index)
    .replace(/\(0, ports\.(\w+)\)/g, '$1')
    .replace(/\bports\.(\w+)/g, '$1')
    .replace(/\b((?:async )?function) (\w+)\(/g, (declaration, kind: string, name: string) =>
      publicFunctions.has(name) ? `export ${kind} ${name}(` : declaration)
    .replace(/\)\s*\n\s*(return\b|await\b)/g, ') $1')
    .replace(/\}\s*\n\s*catch\b/g, '} catch');
  return adapter.slice(0, boundaryIndex) + '\n' + body;
}
