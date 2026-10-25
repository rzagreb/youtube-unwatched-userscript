// Bundles src/ into dist/youtube-unwatched.user.js. `--watch` rebuilds and serves dist/.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const root = new URL('..', import.meta.url);
const pkg = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));

export const FILE_NAME = 'youtube-unwatched.user.js';
const PAGES_URL = `https://rzagreb.github.io/youtube-unwatched-userscript/${FILE_NAME}`;

// Redirect for the Pages root, so the README stays the only landing page.
const INDEX_HTML = `<!doctype html>
<meta charset="utf-8">
<title>YouTube Unwatched</title>
<meta http-equiv="refresh" content="0; url=${pkg.homepage}#readme">
<a href="${pkg.homepage}#readme">YouTube Unwatched on GitHub</a>
`;

/** Header rows. Dev copies skip the update URLs, so Pages never replaces them. */
function metadata({ dev }) {
  return [
    // Never change name or namespace: managers key saved settings by them.
    ['name', 'YouTube Unwatched'],
    ['namespace', 'https://github.com/rzagreb/youtube-unwatched-userscript'],
    ['version', pkg.version],
    ['description', pkg.description],
    ['homepageURL', pkg.homepage],
    ['supportURL', pkg.bugs.url],
    ...(dev
      ? []
      : [
          ['downloadURL', PAGES_URL],
          ['updateURL', PAGES_URL],
        ]),
    ['match', 'https://www.youtube.com/*'],
    ['match', 'https://youtube.com/*'],
    ['run-at', 'document-start'],
    ['inject-into', 'content'],
    ['noframes', ''],
    ['grant', 'GM_addStyle'],
    ['grant', 'GM_getValue'],
    ['grant', 'GM_setValue'],
    ['license', pkg.license],
  ];
}

function header(options) {
  const lines = metadata(options).map(([key, value]) => `// @${key.padEnd(12)} ${value}`.trimEnd());
  return ['// ==UserScript==', ...lines, '// ==/UserScript=='].join('\n');
}

/** esbuild options, shared with the bundle test. */
export function buildOptions({ dev = false } = {}) {
  return {
    absWorkingDir: fileURLToPath(root),
    entryPoints: ['src/main.js'],
    outfile: `dist/${FILE_NAME}`,
    bundle: true,
    format: 'iife',
    charset: 'utf8',
    banner: { js: header({ dev }) },
  };
}

if (import.meta.main) {
  if (process.argv.includes('--watch')) {
    const context = await esbuild.context({ ...buildOptions({ dev: true }), logLevel: 'info' });
    await context.watch();
    const servedir = fileURLToPath(new URL('dist', root));
    const { port } = await context.serve({ host: '127.0.0.1', servedir });
    // Violentmonkey only tracks a served script when the host is spelled "localhost".
    console.log(`Install the dev copy from http://localhost:${port}/${FILE_NAME}`);
  } else {
    await esbuild.build({ ...buildOptions(), logLevel: 'info' });
    writeFileSync(new URL('dist/index.html', root), INDEX_HTML);
  }
}
