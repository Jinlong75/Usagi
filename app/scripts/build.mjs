import { build } from 'vite';
import { build as bundle } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';

export const placeholderBuild = process.env.USAGI_PLACEHOLDER_BUILD === undefined ?
  !existsSync(fileURLToPath(new URL('../../assets/models/usagi.vrm', import.meta.url))) : process.env.USAGI_PLACEHOLDER_BUILD === '1';

export async function buildProcesses() {
  await bundle({
    entryPoints: { main: 'src/main/index.ts', preload: 'src/preload/index.ts', 'bubble-preload': 'src/preload/bubble.ts', 'chat-preload': 'src/preload/chat.ts', 'settings-preload': 'src/preload/settings.ts' },
    outdir: 'out', outExtension: { '.js': '.cjs' }, bundle: true,
    platform: 'node', format: 'cjs', target: 'node24', external: ['electron'],
    sourcemap: true,
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await buildProcesses();
  await build({ define: { __USAGI_PLACEHOLDER__: JSON.stringify(placeholderBuild) } });
}
