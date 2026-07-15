import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

rmSync('dist', { recursive: true, force: true });
mkdirSync('dist/src', { recursive: true });

copyFileSync('src/main.js', 'dist/src/main.js');
copyFileSync('src/styles.css', 'dist/src/styles.css');

const html = readFileSync('index.html', 'utf8')
  .replace(/href="(?:\.\/|\/)?src\/styles\.css"/, 'href="./src/styles.css"')
  .replace(/src="(?:\.\/|\/)?src\/main\.js"/, 'src="./src/main.js"');

writeFileSync('dist/index.html', html);
console.log('Built static site to dist/ with external CSS and module JavaScript.');
