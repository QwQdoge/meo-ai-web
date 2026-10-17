import { execFileSync } from 'node:child_process';
import { access, cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const pagesRoot = path.resolve(scriptDir, '..');
const repoRoot = path.resolve(pagesRoot, '..');
const clientDist = path.join(repoRoot, 'client', 'dist');
const pagesDist = path.join(pagesRoot, 'dist');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function run(args) {
  execFileSync(npm, args, {
    cwd: repoRoot,
    env: { ...process.env, NODE_ENV: 'production' },
    stdio: 'inherit',
  });
}

// Cloudflare Pages still uses /meo-pages as its root so the existing
// Pages Functions under meo-pages/functions keep handling browser OAuth.
// The static application, however, is now built exclusively from client/.
run(['ci']);
run(['run', 'build:data-provider']);
run(['run', 'build:client-package']);
run(['run', 'build:client']);

await access(path.join(clientDist, 'index.html'));
await rm(pagesDist, { recursive: true, force: true });
await mkdir(pagesDist, { recursive: true });
await cp(clientDist, pagesDist, { recursive: true });

console.log('Built the canonical React Meo AI Web into meo-pages/dist.');
