import { readFile, mkdir, copyFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { execFileSync } from 'node:child_process';

await mkdir('resources/licenses', { recursive: true });
for (const name of ['prosemirror-model', 'prosemirror-transform', 'orderedmap', 'diff', 'zod'])
  await copyFile(`node_modules/${name}/LICENSE`, `resources/licenses/${name}.txt`);
for (const [name, file] of [['pdf-lib', 'LICENSE.md'], ['@pdf-lib/standard-fonts', 'LICENSE.md'], ['@pdf-lib/upng', 'LICENSE'], ['pako', 'LICENSE'], ['tslib', 'LICENSE.txt'], ['pandoc-wasm', 'LICENSE']])
  await copyFile(`node_modules/${name}/${file}`, `resources/licenses/${name.replaceAll('/', '-')}.txt`);
for (const file of ['pandoc-3.10-COPYING.md', 'pandoc-3.10-COPYRIGHT.txt', 'pandoc-sources.md'])
  await access(`resources/licenses/${file}`);
const nuget = process.env.NUGET_PACKAGES ?? join(homedir(), '.nuget/packages');
const runtimeVersion = JSON.parse(await readFile('document-engine/obj/project.assets.json', 'utf8')).project.frameworks['net10.0'].downloadDependencies.find(d => d.name === 'Microsoft.NETCore.App.Runtime.osx-arm64').version.replace(/[\[\]]/g, '').split(',')[0];
for (const file of ['LICENSE.TXT', 'THIRD-PARTY-NOTICES.TXT'])
  await copyFile(join(nuget, 'microsoft.netcore.app.runtime.osx-arm64', runtimeVersion, file), `resources/licenses/dotnet-${file}`);
for (const file of ['openxml.txt', 'openxml-NOTICE.txt'])
  if ((await readFile(`resources/licenses/${file}`, 'utf8')).length < 20) throw new Error(`Missing required license ${file}`);
await mkdir('.local/packages', { recursive: true });
const manifest = JSON.parse(await readFile('package.json', 'utf8'));
const target = `.local/packages/${manifest.name}-${manifest.version}.tgz`;
try { await access(target); throw new Error(`Refusing to replace existing candidate ${target}; select a new package version.`); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const [packed] = JSON.parse(execFileSync('npm', ['pack', '--json', '--pack-destination', '.local/packages'], { encoding: 'utf8' }));
for (const required of ['dist/host.js', 'dist/client.js', 'dist/markdown.mjs', 'runtime/osx-arm64/paper-docx', 'skills/local-revision/SKILL.md', 'locale/zh.json', 'resources/icon.svg', 'resources/licenses/pandoc-3.10-COPYING.md', 'docs/reference/document-delivery-status.md'])
  if (!packed.files.some(f => f.path === required)) throw new Error(`Package omitted ${required}`);
console.log(JSON.stringify({ filename: packed.filename, size: packed.size, files: packed.files.length }, null, 2));
