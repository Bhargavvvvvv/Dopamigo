import { build } from 'esbuild';
import { build as viteBuild } from 'vite';
export async function buildMain() {
  await build({ entryPoints: { main: 'apps/desktop/main/index.ts', preload: 'apps/desktop/main/preload.ts' }, bundle: true, platform: 'node', format: 'cjs', outdir: 'dist', outExtension: { '.js': '.cjs' }, external: ['electron', 'unpdf'], sourcemap: true });
}
await buildMain();
if (!process.argv.includes('--main-only')) await viteBuild();
