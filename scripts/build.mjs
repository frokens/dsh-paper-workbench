import { build } from 'esbuild';
import { access, mkdir } from 'node:fs/promises';

await access('runtime/osx-arm64/paper-docx');
await mkdir('dist', { recursive: true });
await build({ entryPoints: ['src/host.ts'], outfile: 'dist/host.js', bundle: true, format: 'esm', platform: 'node', target: 'node24', packages: 'bundle', external: ['@deepseek-ai/*'], legalComments: 'linked' });
await build({ entryPoints: ['src/client.tsx'], outfile: 'dist/client.js', bundle: true, format: 'iife', globalName: 'PaperClient', platform: 'browser', target: 'es2023', external: ['react'], jsx: 'transform', legalComments: 'linked',
  banner: { js: 'window.__ModuleLoader__.load({id:"dsh-paper-workbench",factory(require){' }, footer: { js: 'return PaperClient;}});' } });
