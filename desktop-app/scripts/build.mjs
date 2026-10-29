import { build as viteBuild } from 'vite';
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { copyFile } from 'node:fs/promises';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
await viteBuild({ configFile: path.join(root, 'vite.config.ts') });
await build({ entryPoints: [path.join(root, 'src/main/index.ts')], outfile: path.join(root, 'dist/main/index.js'), bundle: true, platform: 'node', target: 'node22', format: 'esm', external: ['electron'], define: { WAYFINDER_SOURCE_ROOT: JSON.stringify(path.resolve(root, '..')) } });
await build({ entryPoints: [path.join(root, 'src/preload/index.ts')], outfile: path.join(root, 'dist/preload/index.cjs'), bundle: true, platform: 'node', target: 'node22', format: 'cjs', external: ['electron'] });
// Companion preload — same isolation model as main preload, different entry point
await build({ entryPoints: [path.join(root, 'src/preload/companion.ts')], outfile: path.join(root, 'dist/preload/companion.cjs'), bundle: true, platform: 'node', target: 'node22', format: 'cjs', external: ['electron'] });
await copyFile(path.join(root, 'FEATURES.json'), path.join(root, 'dist/release.json'));
console.log('Built renderer, isolated preload, companion preload, main broker and build inclusion snapshot.');

await build({entryPoints:[path.join(root,'scripts/import-local-connections.ts')],outfile:path.join(root,'.cache/import-local-connections.cjs'),bundle:true,platform:'node',target:'node22',format:'cjs',external:['electron']});
