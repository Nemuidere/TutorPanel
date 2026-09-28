import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

// Every file the app loads must be in the service worker's offline list.
test('offline file list covers the app', () => {
  const listed = new Set(readFileSync('sw.js', 'utf8').match(/const FILES = \[([^\]]*)\]/)[1].match(/'[^']+'/g).map(s => s.slice(1, -1)));
  const files = ['style.css', 'manifest.webmanifest', 'vendor/preact-htm.mjs', ...readdirSync('js', { recursive: true })
    .filter(f => f.endsWith('.js')).map(f => 'js/' + f.replaceAll('\\', '/'))];
  for (const f of files) assert.ok(listed.has(f), `${f} is missing from FILES in sw.js`);
  for (const f of listed) if (f !== './') assert.doesNotThrow(() => readFileSync(f), `${f} is listed but doesn't exist`);
});
