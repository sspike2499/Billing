import { mkdirSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
mkdirSync('dist/src', { recursive: true });
copyFileSync('index.html', 'dist/index.html');
copyFileSync('src/main.js', 'dist/src/main.js');
copyFileSync('src/styles.css', 'dist/src/styles.css');
const html = readFileSync('dist/index.html', 'utf8');
writeFileSync('dist/index.html', html.replace('/src/main.js', './src/main.js'));
console.log('Built static site to dist/');
