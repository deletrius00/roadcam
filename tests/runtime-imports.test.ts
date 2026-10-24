/**
 * Guard against a real production bug we hit on the first deploy.
 *
 * Vercel runs `api/` as plain Node.js ES modules, with no bundler. Plain Node needs
 * file extensions on relative imports (`'./geo.js'`, not `'./geo'`), even though
 * Vite and Vitest don't care. Anything the API can reach must follow that rule.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const BACKEND_DIRS = ['api', 'server', 'src/lib'];

function tsFiles(dir: string): string[] {
  return readdirSync(join(ROOT, dir))
    .filter((f) => f.endsWith('.ts'))
    .map((f) => join(dir, f));
}

describe('backend imports work in plain Node (Vercel)', () => {
  const files = BACKEND_DIRS.flatMap(tsFiles);

  it('finds the backend files', () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it.each(files.map((f): [string] => [f]))('%s uses .js extensions on relative imports', (file) => {
    const source = readFileSync(join(ROOT, file), 'utf8');
    const relativeImports = [...source.matchAll(/from\s+'(\.{1,2}\/[^']+)'/g)].map((m) => m[1]);
    const missing = relativeImports.filter((spec) => spec !== undefined && !spec.endsWith('.js'));
    expect(missing).toEqual([]);
  });
});
