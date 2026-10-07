import { mkdir, copyFile } from 'node:fs/promises';
await mkdir('dist', { recursive: true });
for (const name of ['index.html', 'style.css', 'sw.js', 'manifest.webmanifest', 'icon.svg']) {
  await copyFile(`public/${name}`, `dist/${name}`);
}
console.log('Built dist/ — static, no application server required.');
